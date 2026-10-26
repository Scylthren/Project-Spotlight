/**
 * The weather function's request handling: method, token, rate limit, body
 * checks, the position and city paths, the cache, upstream failures and the
 * log line. `fetch` is always a fake (`openMeteoFetch`); no network.
 */
import type { CappedBody } from '../../../supabase/functions/_shared/http-body.ts';
import { FixedWindowRateLimiter } from '../../../supabase/functions/_shared/rate-limit.ts';
import { validateWeatherResponse, WEATHER_ATTRIBUTION, WEATHER_MAX_BODY_BYTES } from '../../../supabase/functions/_shared/weather-contract.ts';
import { HourlyCache } from '../../../supabase/functions/weather/cache.ts';
import {
  handleWeather,
  UPSTREAM_BUDGET_MS,
  WEATHER_RATE_LIMIT,
  type CachedWeather,
  type WeatherHttpRequest,
} from '../../../supabase/functions/weather/handler.ts';
import { DEFAULT_WEATHER_TIMEOUT_MS } from '@/ai/remote-weather-client';
import { joinPath, readText, REPO_ROOT } from '@/security/testing/node-files';

import { fakeResponse } from './testing/model-fakes';
import { forecastBody, geocodingBody, openMeteoFetch } from './testing/weather-fakes';

/** Built at run time so no token-like literal sits in the repo. */
const TOKEN = 'ef'.repeat(32);
const LIGHT_RAIN = { highC: 14, lowC: 8, rainChance: 60, windKph: 22, conditions: 'rain', intensity: 'light' };

function request(body: string = JSON.stringify({ lat: 51.5, lon: -0.1 }), overrides: Partial<WeatherHttpRequest> = {}) {
  const readBody = jest.fn(async (maxBytes: number): Promise<CappedBody> =>
    new TextEncoder().encode(body).length > maxBytes ? { ok: false, reason: 'too_large' } : { ok: true, text: body },
  );
  const req: WeatherHttpRequest = { method: 'POST', authorization: `Bearer ${TOKEN}`, contentLength: null, readBody, ...overrides };
  return { req, readBody };
}

const log = jest.fn();
beforeEach(() => log.mockClear());
const logLines = () => log.mock.calls.map((call) => JSON.parse(call[0] as string) as Record<string, unknown>);

function errorCode(body: unknown) {
  return (body as { error?: { code?: string } }).error?.code;
}

describe('handleWeather', () => {
  it('answers a rounded position with today\'s summary and the attribution, no place', async () => {
    const upstream = openMeteoFetch();
    const result = await handleWeather(request().req, { devToken: TOKEN, fetch: upstream.fetch, log });
    expect(result.status).toBe(200);
    expect(result.headers['Cache-Control']).toBe('no-store');
    expect(result.body).toEqual({ apiVersion: 1, weather: LIGHT_RAIN, attribution: WEATHER_ATTRIBUTION });
    expect(validateWeatherResponse(result.body).ok).toBe(true);
    expect(upstream.urls).toHaveLength(1);
    expect(new URL(upstream.urls[0]).searchParams.get('latitude')).toBe('51.5');
  });

  it('geocodes a city, then fetches the forecast for the match, and names the place', async () => {
    const upstream = openMeteoFetch();
    const result = await handleWeather(request(JSON.stringify({ city: ' london ' })).req, { devToken: TOKEN, fetch: upstream.fetch, log });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ apiVersion: 1, place: { name: 'London, United Kingdom' }, weather: LIGHT_RAIN, attribution: WEATHER_ATTRIBUTION });
    expect(upstream.urls).toHaveLength(2);
    expect(new URL(upstream.urls[0]).searchParams.get('name')).toBe('london');
    expect(new URL(upstream.urls[1]).searchParams.get('latitude')).toBe('51.50853');
  });

  it('answers 404 place_not_found for a city with no match, without a forecast call', async () => {
    const upstream = openMeteoFetch({ geocoding: () => fakeResponse(200, JSON.stringify(geocodingBody(false))) });
    const result = await handleWeather(request(JSON.stringify({ city: 'Qwxzzy' })).req, { devToken: TOKEN, fetch: upstream.fetch, log });
    expect(result.status).toBe(404);
    expect(errorCode(result.body)).toBe('place_not_found');
    expect(upstream.urls).toHaveLength(1);
  });

  it.each<[string, string, number, string]>([
    ['GET', JSON.stringify({ lat: 1, lon: 2 }), 405, 'method_not_allowed'],
  ])('refuses %s', async (method, body, status, code) => {
    const result = await handleWeather(request(body, { method }).req, { devToken: TOKEN, log });
    expect([result.status, errorCode(result.body), result.headers.Allow]).toEqual([status, code, 'POST']);
  });

  it('401 without or with a wrong token, 500 with a misconfigured secret; the body is never read', async () => {
    for (const authorization of [null, 'Bearer nope', `Basic ${TOKEN}`]) {
      const { req, readBody } = request(undefined, { authorization });
      const result = await handleWeather(req, { devToken: TOKEN, log });
      expect([result.status, errorCode(result.body)]).toEqual([401, 'unauthorized']);
      expect(readBody).not.toHaveBeenCalled();
    }
    const result = await handleWeather(request().req, { devToken: 'short', log });
    expect([result.status, errorCode(result.body)]).toEqual([500, 'server_misconfigured']);
  });

  it.each<[string, string]>([
    ['not JSON', '{lat:'],
    ['over-precise coordinates', JSON.stringify({ lat: 51.507, lon: -0.127 })],
    ['both forms', JSON.stringify({ lat: 51.5, lon: -0.1, city: 'London' })],
    ['neither form', JSON.stringify({})],
    ['an empty city', JSON.stringify({ city: '' })],
  ])('400 bad_request for %s, no upstream call', async (_name, body) => {
    const upstream = openMeteoFetch();
    const result = await handleWeather(request(body).req, { devToken: TOKEN, fetch: upstream.fetch, log });
    expect([result.status, errorCode(result.body)]).toEqual([400, 'bad_request']);
    expect(upstream.urls).toHaveLength(0);
  });

  it('400 too_large by Content-Length (unread) or by reading', async () => {
    const declared = request(undefined, { contentLength: String(WEATHER_MAX_BODY_BYTES + 1) });
    const first = await handleWeather(declared.req, { devToken: TOKEN, log });
    expect([first.status, errorCode(first.body)]).toEqual([400, 'too_large']);
    expect(declared.readBody).not.toHaveBeenCalled();
    const big = await handleWeather(request(JSON.stringify({ city: 'x', pad: 'y'.repeat(WEATHER_MAX_BODY_BYTES) })).req, { devToken: TOKEN, log });
    expect([big.status, errorCode(big.body)]).toEqual([400, 'too_large']);
  });

  it('429 rate_limited with Retry-After past the per-instance limit, counted after the token', async () => {
    const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 60_000 });
    const upstream = openMeteoFetch();
    const env = { devToken: TOKEN, fetch: upstream.fetch, log, rateLimiter: limiter, now: () => 1_000 };
    await handleWeather(request(undefined, { authorization: null }).req, env);
    expect((await handleWeather(request().req, env)).status).toBe(200);
    expect((await handleWeather(request().req, env)).status).toBe(200);
    const limited = await handleWeather(request().req, env);
    expect([limited.status, errorCode(limited.body), limited.headers['Retry-After']]).toEqual([429, 'rate_limited', '60']);
    expect(WEATHER_RATE_LIMIT).toEqual({ limit: 30, windowMs: 60_000 });
  });

  it('serves a repeat within the hour from the cache, and calls again the next hour', async () => {
    const upstream = openMeteoFetch();
    let now = 10 * 3_600_000;
    const cache = new HourlyCache<CachedWeather>();
    const env = { devToken: TOKEN, fetch: upstream.fetch, log, cache, now: () => now };
    const city = JSON.stringify({ city: 'London' });
    const first = await handleWeather(request(city).req, env);
    const second = await handleWeather(request(JSON.stringify({ city: 'LONDON' })).req, env);
    expect(second.body).toEqual(first.body);
    expect(upstream.urls).toHaveLength(2);
    expect(logLines().map((line) => line.cache)).toEqual(['miss', 'hit']);
    now += 3_600_000;
    await handleWeather(request(city).req, env);
    expect(upstream.urls).toHaveLength(4);
  });

  it('does not cache failures', async () => {
    let status = 503;
    const upstream = openMeteoFetch({ forecast: () => (status === 200 ? fakeResponse(200, JSON.stringify(forecastBody())) : fakeResponse(status, '{}')) });
    const env = { devToken: TOKEN, fetch: upstream.fetch, log, cache: new HourlyCache<CachedWeather>(), now: () => 0 };
    expect((await handleWeather(request().req, env)).status).toBe(503);
    status = 200;
    expect((await handleWeather(request().req, env)).status).toBe(200);
  });

  it.each<[string, () => Response | Promise<Response>, number, string]>([
    ['a 5xx', () => fakeResponse(500, '{}'), 503, 'upstream_unavailable'],
    ['a 429', () => fakeResponse(429, '{}'), 503, 'upstream_rate_limited'],
    ['a 400', () => fakeResponse(400, '{"error":true,"reason":"x"}'), 502, 'upstream_rejected'],
    ['a non-JSON 200', () => fakeResponse(200, 'nope'), 502, 'upstream_rejected'],
    ['a 200 without temperatures', () => fakeResponse(200, JSON.stringify(forecastBody({ temperature_2m_max: [] }))), 502, 'upstream_rejected'],
    ['a network error', () => Promise.reject(new Error('down')), 503, 'upstream_unavailable'],
  ])('maps %s from the forecast to %d %s', async (_name, forecast, status, code) => {
    const upstream = openMeteoFetch({ forecast });
    const result = await handleWeather(request().req, { devToken: TOKEN, fetch: upstream.fetch, log });
    expect([result.status, errorCode(result.body)]).toEqual([status, code]);
    expect(JSON.stringify(result.body)).not.toContain('reason');
  });

  it('maps geocoding failures the same way', async () => {
    const upstream = openMeteoFetch({ geocoding: () => fakeResponse(502, '{}') });
    const result = await handleWeather(request(JSON.stringify({ city: 'Paris' })).req, { devToken: TOKEN, fetch: upstream.fetch, log });
    expect([result.status, errorCode(result.body)]).toEqual([503, 'upstream_unavailable']);
    const malformed = openMeteoFetch({ geocoding: () => fakeResponse(200, '{"results":"x"}') });
    const second = await handleWeather(request(JSON.stringify({ city: 'Paris' })).req, { devToken: TOKEN, fetch: malformed.fetch, log });
    expect([second.status, errorCode(second.body)]).toEqual([502, 'upstream_rejected']);
  });

  it('504 upstream_timeout when Open-Meteo hangs; the budget covers both calls of a city request', async () => {
    const hang = openMeteoFetch({ forecast: () => new Promise<Response>(() => undefined) });
    const result = await handleWeather(request().req, { devToken: TOKEN, fetch: hang.fetch, log, attemptTimeoutMs: 20 });
    expect([result.status, errorCode(result.body)]).toEqual([504, 'upstream_timeout']);

    // The geocoding call used the whole budget: the forecast is not started.
    let now = 0;
    const slow = openMeteoFetch({
      geocoding: () => {
        now += UPSTREAM_BUDGET_MS;
        return fakeResponse(200, JSON.stringify(geocodingBody()));
      },
    });
    const city = await handleWeather(request(JSON.stringify({ city: 'London' })).req, { devToken: TOKEN, fetch: slow.fetch, log, now: () => now });
    expect([city.status, errorCode(city.body)]).toEqual([504, 'upstream_timeout']);
    expect(slow.urls).toHaveLength(1);
  });

  it('logs one line per request with status and counts only: never coordinates, city, place or weather', async () => {
    const upstream = openMeteoFetch();
    await handleWeather(request(JSON.stringify({ city: 'Londonderry Secret' })).req, { devToken: TOKEN, fetch: upstream.fetch, log, now: () => 5 });
    await handleWeather(request(JSON.stringify({ lat: 48.9, lon: 2.4 })).req, { devToken: TOKEN, fetch: upstream.fetch, log, now: () => 5 });
    await handleWeather(request(undefined, { authorization: null }).req, { devToken: TOKEN, log });
    expect(log).toHaveBeenCalledTimes(3);
    expect(logLines()).toEqual([
      { fn: 'weather', event: 'answer', status: 200, kind: 'city', cache: null, upstream_calls: 2, latency_ms: 0 },
      { fn: 'weather', event: 'answer', status: 200, kind: 'position', cache: null, upstream_calls: 1, latency_ms: 0 },
      { fn: 'weather', event: 'answer', status: 401, kind: null, cache: null, upstream_calls: 0, latency_ms: expect.any(Number), error: 'unauthorized' },
    ]);
    const all = log.mock.calls.join('\n');
    for (const secret of ['London', 'Secret', '48.9', '2.4', '51.5', 'Kingdom', 'rain', TOKEN]) expect(all).not.toContain(secret);
  });

  it('a log that throws never breaks the answer', async () => {
    const upstream = openMeteoFetch();
    const result = await handleWeather(request().req, {
      devToken: TOKEN,
      fetch: upstream.fetch,
      log: () => {
        throw new Error('log down');
      },
    });
    expect(result.status).toBe(200);
  });

  it('keeps the function budget under the app timeout, and the doc names the limits', () => {
    expect(UPSTREAM_BUDGET_MS).toBeLessThan(DEFAULT_WEATHER_TIMEOUT_MS);
    const doc = readText(joinPath(REPO_ROOT, 'docs/api/weather.md'));
    expect(doc).toContain(`at most ${UPSTREAM_BUDGET_MS / 1000} s`);
    expect(doc).toContain(`after ${DEFAULT_WEATHER_TIMEOUT_MS / 1000} s`);
    expect(doc).toContain(`More than ${WEATHER_RATE_LIMIT.limit} requests`);
  });
});
