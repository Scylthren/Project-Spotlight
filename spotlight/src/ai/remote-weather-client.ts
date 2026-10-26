import type { DevTokenStore } from '@/data/dev-token-store';

import type { WeatherClient, WeatherFailure, WeatherGetOptions, WeatherOutcome, WeatherQuery } from './weather-client';
import { readWeatherErrorCode, validateWeatherRequest, validateWeatherResponse } from './weather-contract';

/** The app waits 12 s; the function keeps its Open-Meteo calls within 8 s. */
export const DEFAULT_WEATHER_TIMEOUT_MS = 12_000;

export interface RemoteWeatherClientOptions {
  /** Full weather URL (`configuredWeatherUrl()`), or null when not configured. */
  url: string | null;
  tokenStore: DevTokenStore;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * `WeatherClient` that calls our `weather` edge function with plain `fetch`,
 * like `RemoteOutfitGenerator`. Never throws. Checks the query against the
 * contract before sending (a position must already be rounded to 0.1
 * degree, so a precise one is never sent: `rejected`). The token goes only
 * into the Authorization header; nothing is logged.
 */
export class RemoteWeatherClient implements WeatherClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: RemoteWeatherClientOptions) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_WEATHER_TIMEOUT_MS;
  }

  async get(query: WeatherQuery, { signal }: WeatherGetOptions = {}): Promise<WeatherOutcome> {
    const { url, tokenStore } = this.options;
    if (signal?.aborted) return fail('cancelled');
    if (!url) return fail('not-configured');
    const valid = validateWeatherRequest(query);
    if (!valid.ok) return fail('rejected');

    let token: string | null;
    try {
      token = await tokenStore.get();
    } catch {
      token = null;
    }
    if (!token) return fail('no-token');
    if (signal?.aborted) return fail('cancelled');

    const controller = new AbortController();
    let stopped: 'timeout' | 'cancelled' | null = null;
    const stop = (reason: 'timeout' | 'cancelled') => {
      stopped ??= reason;
      controller.abort();
    };
    const onAbort = () => stop('cancelled');
    signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => stop('timeout'), this.timeoutMs);
    const lost = (): WeatherOutcome => fail(stopped ?? 'offline');

    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(valid.value),
          signal: controller.signal,
        });
      } catch {
        return lost();
      }
      if (response.status === 401) return fail('unauthorized');
      if (response.status === 429) return fail('rate-limited');
      if (response.status === 400) return fail('rejected');
      if (response.status !== 200 && response.status !== 404) return fail('server');

      let body: unknown;
      try {
        const text = await response.text();
        if (stopped) return lost();
        try {
          body = JSON.parse(text);
        } catch {
          return fail(response.status === 404 ? 'server' : 'invalid-response');
        }
      } catch {
        return lost();
      }
      if (response.status === 404) return fail(readWeatherErrorCode(body) === 'place_not_found' ? 'place-not-found' : 'server');

      const answer = validateWeatherResponse(body);
      if (!answer.ok) return fail('invalid-response');
      return { ok: true, weather: answer.value.weather, placeName: answer.value.place?.name ?? null };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

function fail(failure: WeatherFailure): WeatherOutcome {
  return { ok: false, failure };
}
