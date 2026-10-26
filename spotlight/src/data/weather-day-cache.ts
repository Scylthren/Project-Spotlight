/**
 * Today's weather kept on the phone (Gate 3 slice 5a): one entry, for one
 * calendar day and one place (the rounded position or the home city), so
 * asking again the same day in the same place costs no call. A new day or
 * a new place (travel: a new rounded position) misses and replaces it.
 *
 * The entry holds the rounded position or the city as its place key, in
 * the settings database on this phone only.
 */
import { validateWeatherSummary, type WeatherSummary } from '@/ai/generate-outfits-contract';
import { readPlaceName } from '@/ai/weather-contract';

import { settingsStorage, type KeyValueStorage } from './kv-appearance-store';

export interface CachedDayWeather {
  /** `localDayKey` of the day it is for. */
  day: string;
  /** `weatherPlaceKey` of the query. */
  place: string;
  weather: WeatherSummary;
  placeName: string | null;
}

/** Both methods may reject when storage fails; callers carry on without the cache. */
export interface WeatherDayCache {
  /** The entry for this day and place, or null. */
  load(day: string, place: string): Promise<CachedDayWeather | null>;
  save(entry: CachedDayWeather): Promise<void>;
}

/** Reads a stored entry; null when it is malformed. */
export function parseCachedDayWeather(raw: string | null): CachedDayWeather | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.day !== 'string' || typeof record.place !== 'string') return null;
  const weather = validateWeatherSummary(record.weather);
  if (!weather.ok) return null;
  return { day: record.day, place: record.place, weather: weather.value, placeName: readPlaceName(record.placeName) };
}

export class MemoryWeatherDayCache implements WeatherDayCache {
  entry: CachedDayWeather | null = null;

  async load(day: string, place: string): Promise<CachedDayWeather | null> {
    return this.entry && this.entry.day === day && this.entry.place === place ? { ...this.entry } : null;
  }

  async save(entry: CachedDayWeather): Promise<void> {
    this.entry = { ...entry };
  }
}

export const WEATHER_TODAY_KEY = 'weather-today';

export class KvWeatherDayCache implements WeatherDayCache {
  constructor(private readonly storage: KeyValueStorage) {}

  async load(day: string, place: string): Promise<CachedDayWeather | null> {
    const entry = parseCachedDayWeather(await this.storage.getItemAsync(WEATHER_TODAY_KEY));
    return entry && entry.day === day && entry.place === place ? entry : null;
  }

  async save(entry: CachedDayWeather): Promise<void> {
    await this.storage.setItemAsync(WEATHER_TODAY_KEY, JSON.stringify(entry));
  }
}

export function createKvWeatherDayCache(): KvWeatherDayCache {
  return new KvWeatherDayCache(settingsStorage());
}
