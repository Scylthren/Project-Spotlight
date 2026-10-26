import { InMemoryDevTokenStore, type DevTokenStore } from '@/data/dev-token-store';

import { handleWeather } from '../../../supabase/functions/weather/handler.ts';
import { openMeteoFetch } from '../edge-functions/testing/weather-fakes';

import { functionUrl } from './backend-config';
import { FakeWeatherClient, MOCK_WEATHER, MockWeatherClient, WEATHER_FAILURES } from './weather-client';
import { DEFAULT_WEATHER_TIMEOUT_MS, RemoteWeatherClient } from './remote-weather-client';
import { WEATHER_ATTRIBUTION } from './weather-contract';

const URL_ = 'https://example.supabase.co/functions/v1/weather';
/** Built at run time so no token-like literal sits in the repo. */
const TOKEN = '5c'.repeat(32);
const SUMMARY = { highC: 14, lowC: 8, rainChance: 60, windKph: 22, conditions: 'rain', intensity: 'light' } as const;
const GOOD = { apiVersion: 1, weather: SUMMARY, attribution: WEATHER_ATTRIBUTION };

function jsonResponse(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, text: async () => text } as unknown as Response;
}

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];
type FetchMock = jest.Mock<Promise<Response>, FetchArgs>;

function setup(options: { respond?: (...args: FetchArgs) => Promise<Response>; store?: DevTokenStore; url?: string | null; timeoutMs?: number } = {}) {
  const fetchMock: FetchMock = jest.fn(options.respond ?? (async () => jsonResponse(200, GOOD)));
  const client = new RemoteWeatherClient({
    url: options.url === undefined ? URL_ : options.url,
    tokenStore: options.store ?? new InMemoryDevTokenStore(TOKEN),
    fetch: fetchMock as unknown as typeof fetch,
    timeoutMs: options.timeoutMs,
  });
  return { client, fetchMock };
}

const hanging = (_input: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
  });

describe('RemoteWeatherClient', () => {
  it('posts the rounded position with the token and reads the summary', async () => {
    const { client, fetchMock } = setup();
    expect(await client.get({ lat: 51.5, lon: -0.1 })).toEqual({ ok: true, weather: SUMMARY, placeName: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL_);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init?.body as string)).toEqual({ lat: 51.5, lon: -0.1 });
  });

  it('posts a city, normalized, and returns the matched place', async () => {
    const { client, fetchMock } = setup({ respond: async () => jsonResponse(200, { ...GOOD, place: { name: 'Paris, France' } }) });
    expect(await client.get({ city: '  Paris ' })).toEqual({ ok: true, weather: SUMMARY, placeName: 'Paris, France' });
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ city: 'Paris' });
  });

  it('never sends an unrounded position or a bad city (rejected, no call)', async () => {
    const { client, fetchMock } = setup();
    expect(await client.get({ lat: 51.50735, lon: -0.12776 })).toEqual({ ok: false, failure: 'rejected' });
    expect(await client.get({ city: '' })).toEqual({ ok: false, failure: 'rejected' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a missing URL or token without calling', async () => {
    const noUrl = setup({ url: null });
    expect(await noUrl.client.get({ city: 'Oslo' })).toEqual({ ok: false, failure: 'not-configured' });
    const noToken = setup({ store: new InMemoryDevTokenStore(null) });
    expect(await noToken.client.get({ city: 'Oslo' })).toEqual({ ok: false, failure: 'no-token' });
    expect(noUrl.fetchMock).not.toHaveBeenCalled();
    expect(noToken.fetchMock).not.toHaveBeenCalled();
  });

  it.each<[number, unknown, string]>([
    [401, { error: { code: 'unauthorized' } }, 'unauthorized'],
    [429, { error: { code: 'rate_limited' } }, 'rate-limited'],
    [400, { error: { code: 'bad_request' } }, 'rejected'],
    [404, { error: { code: 'place_not_found', message: 'x' } }, 'place-not-found'],
    [404, '<html>not found</html>', 'server'],
    [404, { error: { code: 'other' } }, 'server'],
    [503, { error: { code: 'upstream_unavailable' } }, 'server'],
    [504, { error: { code: 'upstream_timeout' } }, 'server'],
    [200, 'not json', 'invalid-response'],
    [200, { ...GOOD, weather: { ...SUMMARY, conditions: 'Light rain' } }, 'invalid-response'],
  ])('maps %d %j to %s', async (status, body, failure) => {
    const { client } = setup({ respond: async () => jsonResponse(status, body) });
    expect(await client.get({ city: 'Oslo' })).toEqual({ ok: false, failure });
  });

  it('offline when fetch fails, timeout past the limit, cancelled on abort', async () => {
    const offline = setup({ respond: async () => Promise.reject(new Error('Network request failed')) });
    expect(await offline.client.get({ city: 'Oslo' })).toEqual({ ok: false, failure: 'offline' });

    const slow = setup({ respond: hanging, timeoutMs: 10 });
    expect(await slow.client.get({ city: 'Oslo' })).toEqual({ ok: false, failure: 'timeout' });

    const controller = new AbortController();
    const cancelled = setup({ respond: hanging });
    const pending = cancelled.client.get({ city: 'Oslo' }, { signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual({ ok: false, failure: 'cancelled' });
    const pre = setup();
    expect(await pre.client.get({ city: 'Oslo' }, { signal: controller.signal })).toEqual({ ok: false, failure: 'cancelled' });
    expect(pre.fetchMock).not.toHaveBeenCalled();
  });

  it('round-trips through the real handler with a fake Open-Meteo', async () => {
    const upstream = openMeteoFetch();
    const respond = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const text = init?.body as string;
      const result = await handleWeather(
        { method: 'POST', authorization: (init?.headers as Record<string, string>).Authorization, contentLength: null, readBody: async () => ({ ok: true, text }) },
        { devToken: TOKEN, fetch: upstream.fetch, log: () => undefined },
      );
      return jsonResponse(result.status, result.body);
    };
    const { client } = setup({ respond });
    expect(await client.get({ city: 'London' })).toEqual({ ok: true, weather: SUMMARY, placeName: 'London, United Kingdom' });
    expect(await client.get({ lat: 51.5, lon: -0.1 })).toEqual({ ok: true, weather: SUMMARY, placeName: null });
  });

  it('builds the function URL and waits 12 s by default', () => {
    expect(functionUrl('https://abc.supabase.co/', 'weather')).toBe('https://abc.supabase.co/functions/v1/weather');
    expect(DEFAULT_WEATHER_TIMEOUT_MS).toBe(12_000);
  });
});

describe('MockWeatherClient and FakeWeatherClient', () => {
  it('the mock gives a fixed day and echoes the city', async () => {
    const mock = new MockWeatherClient();
    expect(await mock.get({ city: 'Rome' })).toEqual({ ok: true, weather: MOCK_WEATHER, placeName: 'Rome' });
    expect(await mock.get({ lat: 1, lon: 2 })).toEqual({ ok: true, weather: MOCK_WEATHER, placeName: null });
    const controller = new AbortController();
    controller.abort();
    expect(await mock.get({ lat: 1, lon: 2 }, { signal: controller.signal })).toEqual({ ok: false, failure: 'cancelled' });
  });

  it('the fake takes queued outcomes then the fallback, recording queries', async () => {
    const fake = new FakeWeatherClient();
    fake.queue.push({ ok: false, failure: 'offline' });
    expect(await fake.get({ city: 'A' })).toEqual({ ok: false, failure: 'offline' });
    expect((await fake.get({ city: 'B' })).ok).toBe(true);
    expect(fake.queries.map((q) => q.query)).toEqual([{ city: 'A' }, { city: 'B' }]);
    expect(WEATHER_FAILURES).toContain('place-not-found');
  });
});
