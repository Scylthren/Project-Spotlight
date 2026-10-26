import type { WeatherSummary } from './generate-outfits-contract';
import type { WeatherRequest } from './weather-contract';

/** What to ask for: a position already rounded to 0.1 degree (`roundPosition`), or a city. */
export type WeatherQuery = WeatherRequest;

export interface WeatherGetOptions {
  /** Aborting resolves `cancelled`. */
  signal?: AbortSignal;
}

/**
 * Why no weather came back. Same kinds as outfits where they overlap, plus
 * `place-not-found` (a city the function could not match, its 404).
 */
export const WEATHER_FAILURES = [
  'not-configured',
  'no-token',
  'unauthorized',
  'offline',
  'timeout',
  'rejected',
  'rate-limited',
  'place-not-found',
  'server',
  'invalid-response',
  'cancelled',
] as const;
export type WeatherFailure = (typeof WEATHER_FAILURES)[number];

export type WeatherOutcome =
  | {
      ok: true;
      weather: WeatherSummary;
      /** The matched place for a city query ("London, United Kingdom"), else null. */
      placeName: string | null;
    }
  | { ok: false; failure: WeatherFailure };

/**
 * Today's weather from our `weather` function (Open-Meteo behind it; the app
 * never calls Open-Meteo itself). Implementations never throw or reject:
 * every problem resolves `{ ok: false, failure }`.
 *
 * Implementations: `MockWeatherClient` (a fixed day, offline),
 * `FakeWeatherClient` (tests) and `RemoteWeatherClient`.
 */
export interface WeatherClient {
  get(query: WeatherQuery, options?: WeatherGetOptions): Promise<WeatherOutcome>;
}

/** The mock's day: mild with light rain. */
export const MOCK_WEATHER: WeatherSummary = { highC: 18, lowC: 9, rainChance: 60, windKph: 15, conditions: 'rain', intensity: 'light' };

/** Mock `WeatherClient`: the same mild, lightly rainy day everywhere; a city is echoed as the place. */
export class MockWeatherClient implements WeatherClient {
  async get(query: WeatherQuery, { signal }: WeatherGetOptions = {}): Promise<WeatherOutcome> {
    if (signal?.aborted) return { ok: false, failure: 'cancelled' };
    return { ok: true, weather: { ...MOCK_WEATHER }, placeName: 'city' in query ? query.city : null };
  }
}

/**
 * Configurable `WeatherClient` for tests. Each call takes the next queued
 * outcome (or a function returning one), then falls back to `fallback`.
 * `queries` records every call.
 */
export class FakeWeatherClient implements WeatherClient {
  readonly queries: { query: WeatherQuery; options: WeatherGetOptions }[] = [];
  readonly queue: (WeatherOutcome | ((query: WeatherQuery, options: WeatherGetOptions) => Promise<WeatherOutcome>))[] = [];
  fallback: WeatherOutcome = { ok: true, weather: { ...MOCK_WEATHER }, placeName: null };

  async get(query: WeatherQuery, options: WeatherGetOptions = {}): Promise<WeatherOutcome> {
    this.queries.push({ query, options });
    const next = this.queue.shift() ?? this.fallback;
    return typeof next === 'function' ? next(query, options) : next;
  }
}
