/**
 * Today's weather for "Match today's weather" (Gate 3 slice 5a; Look of the
 * day in 5b). Picks where (the rounded position, else the home city), uses
 * today's cached answer when there is one for that place, else asks our
 * `weather` function. Never throws; the outcome says what the screen shows.
 *
 * - `off`: "Use local weather" is off (or the settings could not be read).
 * - `no-location`: no position and no home city; `problem` says why.
 * - `place-not-found`: the home city matched no place.
 * - `failed`: the weather could not be fetched (offline, rate limited, ...);
 *   the caller goes on without weather and says so.
 *
 * The position is already rounded by the `LocationProvider`; only the
 * summary goes on to generate-outfits.
 */
import type { WeatherSummary } from '@/ai/generate-outfits-contract';
import type { WeatherClient, WeatherFailure, WeatherQuery } from '@/ai/weather-client';
import { localDayKey } from '@/core/local-day';

import type { LocationProblem, LocationProvider } from './location-provider';
import type { WeatherDayCache } from './weather-day-cache';
import { DEFAULT_WEATHER_SETTINGS, type WeatherSettings, type WeatherSettingsStore } from './weather-settings';

export type WeatherResolution =
  | { kind: 'ready'; weather: WeatherSummary; placeName: string | null; source: 'location' | 'city' }
  | { kind: 'off' }
  | { kind: 'no-location'; problem: LocationProblem }
  | { kind: 'place-not-found'; city: string }
  | { kind: 'failed'; failure: Exclude<WeatherFailure, 'place-not-found' | 'cancelled'> }
  | { kind: 'cancelled' };

export interface TodayWeatherDeps {
  settings: WeatherSettingsStore;
  location: LocationProvider;
  client: WeatherClient;
  cache: WeatherDayCache;
  /** Defaults to `new Date()`. */
  now?: () => Date;
}

/** The cache's place key: the rounded position, or the city in lowercase. */
export function weatherPlaceKey(query: WeatherQuery): string {
  return 'city' in query ? `city:${query.city.toLowerCase()}` : `pos:${query.lat},${query.lon}`;
}

export class TodayWeather {
  constructor(private readonly deps: TodayWeatherDeps) {}

  async resolve({ signal }: { signal?: AbortSignal } = {}): Promise<WeatherResolution> {
    const cancelled = (): WeatherResolution | null => (signal?.aborted ? { kind: 'cancelled' } : null);
    let settings: WeatherSettings;
    try {
      settings = await this.deps.settings.load();
    } catch {
      settings = DEFAULT_WEATHER_SETTINGS;
    }
    if (!settings.useLocalWeather) return { kind: 'off' };
    if (cancelled()) return cancelled()!;

    const found = await this.deps.location.currentPosition();
    if (cancelled()) return cancelled()!;
    let query: WeatherQuery;
    let source: 'location' | 'city';
    if (found.ok) {
      query = found.position;
      source = 'location';
    } else if (settings.homeCity) {
      query = { city: settings.homeCity };
      source = 'city';
    } else {
      return { kind: 'no-location', problem: found.problem };
    }

    const day = localDayKey((this.deps.now ?? (() => new Date()))());
    const place = weatherPlaceKey(query);
    try {
      const cached = await this.deps.cache.load(day, place);
      if (cached) return { kind: 'ready', weather: cached.weather, placeName: cached.placeName, source };
    } catch {
      // No cache: ask the function.
    }
    if (cancelled()) return cancelled()!;

    const outcome = await this.deps.client.get(query, { signal });
    if (!outcome.ok) {
      if (outcome.failure === 'cancelled') return { kind: 'cancelled' };
      if (outcome.failure === 'place-not-found') return { kind: 'place-not-found', city: 'city' in query ? query.city : '' };
      return { kind: 'failed', failure: outcome.failure };
    }
    try {
      await this.deps.cache.save({ day, place, weather: outcome.weather, placeName: outcome.placeName });
    } catch {
      // The answer still counts; the next ask fetches again.
    }
    return { kind: 'ready', weather: outcome.weather, placeName: outcome.placeName, source };
  }
}
