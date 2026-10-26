/**
 * weather request handling (Gate 3 slice 5a), independent of Deno so Jest
 * can test it. `index.ts` adapts a `Request` to `WeatherHttpRequest` and
 * back. API: `docs/api/weather.md`.
 *
 * Order of checks, as in the other functions: method (405), token (401;
 * 500 when the secret is unusable), rate limit (429), body size, JSON and
 * shape (400). Then the hourly cache (`cache.ts`), else Open-Meteo: for a
 * city the geocoding search first (404 `place_not_found` when it finds
 * nothing), then today's forecast, mapped to the generate-outfits
 * `WeatherSummary` (`open-meteo.ts`, `wmo.ts`).
 *
 * Privacy: the coordinates and the city go only to Open-Meteo. Nothing here
 * logs them, the token, the URLs or the answer: one JSON line per request
 * with the request kind, status, cache use, call count and time only.
 */
import type { ProviderError } from '../_shared/claude.ts';
import { checkDevToken } from '../_shared/dev-token.ts';
import type { WeatherSummary } from '../_shared/generate-outfits-contract.ts';
import type { CappedBody } from '../_shared/http-body.ts';
import type { FixedWindowRateLimiter, RateLimit } from '../_shared/rate-limit.ts';
import {
  validateWeatherRequest,
  WEATHER_API_VERSION,
  WEATHER_ATTRIBUTION,
  WEATHER_MAX_BODY_BYTES,
  type WeatherErrorCode,
  type WeatherErrorResponse,
  type WeatherRequest,
  type WeatherResponse,
} from '../_shared/weather-contract.ts';

import { HourlyCache, weatherCacheKey } from './cache.ts';
import { fetchJson, forecastUrl, geocodingUrl, readForecast, readGeocoding, type FetchJsonResult } from './open-meteo.ts';

export interface WeatherHttpRequest {
  method: string;
  authorization: string | null;
  contentLength: string | null;
  /** Reads the body as UTF-8, giving up once it exceeds `maxBytes`. */
  readBody(maxBytes: number): Promise<CappedBody>;
}

export interface WeatherHttpResult {
  status: number;
  headers: Record<string, string>;
  body: WeatherResponse | WeatherErrorResponse;
}

/** What the cache keeps per request: the answer's place name (city requests) and summary. */
export interface CachedWeather {
  placeName: string | null;
  weather: WeatherSummary;
}

export interface WeatherEnv {
  /** The `DEV_TOKEN` secret. */
  devToken: string | undefined;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Milliseconds; defaults to `Date.now`. */
  now?: () => number;
  /** One line per request; defaults to `console.log`. */
  log?: (line: string) => void;
  /** `index.ts` passes one per instance (`WEATHER_RATE_LIMIT`); none means no limit (tests). */
  rateLimiter?: FixedWindowRateLimiter;
  /** `index.ts` passes one per instance; none means no caching. */
  cache?: HourlyCache<CachedWeather>;
  /** Per Open-Meteo call; defaults to `UPSTREAM_ATTEMPT_TIMEOUT_MS`. */
  attemptTimeoutMs?: number;
  /** For all calls of one request; defaults to `UPSTREAM_BUDGET_MS`. */
  budgetMs?: number;
}

/**
 * Best-effort limit per function instance (`_shared/rate-limit.ts`). Weather
 * costs nothing per call but Open-Meteo's free tier allows under 10,000
 * calls a day; the app caches a day's weather, so one person needs a few
 * calls a day. 30 a minute caps a runaway loop at about 1,800 calls an hour
 * per instance, before the hourly cache (most of those would be cache hits).
 */
export const WEATHER_RATE_LIMIT: RateLimit = { limit: 30, windowMs: 60_000 };

/**
 * Time limits: each Open-Meteo call at most 5 s, both calls of a city
 * request together at most 8 s (the app gives up after 12 s).
 */
export const UPSTREAM_ATTEMPT_TIMEOUT_MS = 5_000;
export const UPSTREAM_BUDGET_MS = 8_000;
/** A call is not started with less than this left of the budget (it is a timeout instead). */
export const UPSTREAM_MIN_CALL_MS = 500;

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function failure(status: number, code: WeatherErrorCode, message: string, extraHeaders: Record<string, string> = {}): WeatherHttpResult {
  return { status, headers: { ...JSON_HEADERS, ...extraHeaders }, body: { error: { code, message } } };
}

/** Fixed answers for Open-Meteo trouble; its own message is never passed on. */
const UPSTREAM_FAILURES: Record<ProviderError, WeatherHttpResult> = {
  unavailable: failure(503, 'upstream_unavailable', 'The weather service is unavailable. Try again later.'),
  rate_limited: failure(503, 'upstream_rate_limited', 'The weather service is busy. Try again later.'),
  timeout: failure(504, 'upstream_timeout', 'The weather service did not answer in time.'),
  rejected: failure(502, 'upstream_rejected', 'The weather service refused the request or gave an unreadable answer.'),
};

const PLACE_NOT_FOUND = failure(404, 'place_not_found', 'No place matches that city. Check the spelling.');

/** What one request did, for its log line. */
interface RequestTrace {
  kind: 'position' | 'city' | null;
  cache: 'hit' | 'miss' | null;
  calls: number;
}

export async function handleWeather(request: WeatherHttpRequest, env: WeatherEnv): Promise<WeatherHttpResult> {
  const now = env.now ?? (() => Date.now());
  const started = now();
  const trace: RequestTrace = { kind: null, cache: null, calls: 0 };
  const result = await answer(request, env, now, trace);
  try {
    const error = 'error' in result.body ? result.body.error.code : undefined;
    (env.log ?? ((line) => console.log(line)))(
      JSON.stringify({
        fn: 'weather',
        event: 'answer',
        status: result.status,
        kind: trace.kind,
        cache: trace.cache,
        upstream_calls: trace.calls,
        latency_ms: Math.max(0, Math.round(now() - started)),
        ...(error ? { error } : {}),
      }),
    );
  } catch {
    // Logging must never break the answer.
  }
  return result;
}

async function answer(request: WeatherHttpRequest, env: WeatherEnv, now: () => number, trace: RequestTrace): Promise<WeatherHttpResult> {
  if (request.method !== 'POST') return failure(405, 'method_not_allowed', 'Use POST.', { Allow: 'POST' });

  const auth = checkDevToken(request.authorization, env.devToken);
  if (auth === 'misconfigured') return failure(500, 'server_misconfigured', 'The function is not configured.');
  if (auth === 'unauthorized') return failure(401, 'unauthorized', 'Missing or wrong token.');
  const rate = env.rateLimiter?.take(now());
  if (rate && !rate.ok) {
    return failure(429, 'rate_limited', 'Too many requests. Try again in a minute.', { 'Retry-After': String(rate.retryAfterSeconds) });
  }

  const tooLarge = `The body is larger than ${WEATHER_MAX_BODY_BYTES} bytes.`;
  const declared = request.contentLength === null ? null : Number(request.contentLength);
  if (declared !== null && Number.isFinite(declared) && declared > WEATHER_MAX_BODY_BYTES) return failure(400, 'too_large', tooLarge);
  const body = await request.readBody(WEATHER_MAX_BODY_BYTES);
  if (!body.ok) {
    return body.reason === 'too_large' ? failure(400, 'too_large', tooLarge) : failure(400, 'bad_request', 'The body could not be read.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return failure(400, 'bad_request', 'The body is not valid JSON.');
  }
  const valid = validateWeatherRequest(parsed);
  if (!valid.ok) return failure(400, 'bad_request', valid.reason);
  trace.kind = 'city' in valid.value ? 'city' : 'position';

  const key = weatherCacheKey(valid.value);
  const cached = env.cache?.get(key, now());
  if (cached) {
    trace.cache = 'hit';
    return ok(cached);
  }
  if (env.cache) trace.cache = 'miss';

  const fetched = await fetchWeather(valid.value, env, now, trace);
  if ('status' in fetched) return fetched;
  env.cache?.set(key, fetched, now());
  return ok(fetched);
}

function ok(found: CachedWeather): WeatherHttpResult {
  const response: WeatherResponse = {
    apiVersion: WEATHER_API_VERSION,
    ...(found.placeName ? { place: { name: found.placeName } } : {}),
    weather: { ...found.weather },
    attribution: WEATHER_ATTRIBUTION,
  };
  return { status: 200, headers: { ...JSON_HEADERS }, body: response };
}

/** Geocodes a city when needed, then reads today's forecast. Resolves the answer to cache, or the failure to send. */
async function fetchWeather(
  request: WeatherRequest,
  env: WeatherEnv,
  now: () => number,
  trace: RequestTrace,
): Promise<CachedWeather | WeatherHttpResult> {
  const fetchImpl = env.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const attempt = env.attemptTimeoutMs ?? UPSTREAM_ATTEMPT_TIMEOUT_MS;
  const deadline = now() + (env.budgetMs ?? UPSTREAM_BUDGET_MS);
  const call = (url: string): Promise<FetchJsonResult> => {
    const remaining = deadline - now();
    if (remaining < UPSTREAM_MIN_CALL_MS) return Promise.resolve({ kind: 'error', error: 'timeout' });
    trace.calls += 1;
    return fetchJson(url, Math.min(attempt, remaining), fetchImpl);
  };

  let position = 'city' in request ? null : { lat: request.lat, lon: request.lon };
  let placeName: string | null = null;
  if ('city' in request) {
    const geocoded = await call(geocodingUrl(request.city));
    if (geocoded.kind === 'error') return UPSTREAM_FAILURES[geocoded.error];
    const place = readGeocoding(geocoded.body);
    if (place === 'not_found') return PLACE_NOT_FOUND;
    if (!place) return UPSTREAM_FAILURES.rejected;
    position = { lat: place.lat, lon: place.lon };
    placeName = place.name;
  }
  const forecast = await call(forecastUrl(position!.lat, position!.lon));
  if (forecast.kind === 'error') return UPSTREAM_FAILURES[forecast.error];
  const weather = readForecast(forecast.body);
  if (!weather) return UPSTREAM_FAILURES.rejected;
  return { placeName, weather };
}
