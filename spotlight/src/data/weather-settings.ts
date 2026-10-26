/**
 * The Me tab's weather settings (Gate 3 slice 5a), on the phone only:
 * "Use local weather" (off by default: no location, no weather features)
 * and the home city, used when location is not allowed, off or has no fix.
 */
import { readCity, WEATHER_CITY_MAX_LENGTH } from '@/ai/weather-contract';

import { settingsStorage, type KeyValueStorage } from './kv-appearance-store';

export interface WeatherSettings {
  useLocalWeather: boolean;
  /** Normalized (trimmed, spaces collapsed), 1 to 80 characters; null when not set. */
  homeCity: string | null;
}

export const DEFAULT_WEATHER_SETTINGS: WeatherSettings = Object.freeze({ useLocalWeather: false, homeCity: null });

export const HOME_CITY_MAX_LENGTH = WEATHER_CITY_MAX_LENGTH;

/** Reads stored JSON; anything unreadable gives the defaults, a bad city is dropped. */
export function parseWeatherSettings(raw: string | null): WeatherSettings {
  if (!raw) return { ...DEFAULT_WEATHER_SETTINGS };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_WEATHER_SETTINGS };
  }
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_WEATHER_SETTINGS };
  const record = value as Record<string, unknown>;
  return { useLocalWeather: record.useLocalWeather === true, homeCity: readCity(record.homeCity) };
}

export type HomeCityCheck = { ok: true; city: string | null } | { ok: false; reason: 'too-long' | 'invalid' };

/** What the city field may save: empty clears it; otherwise 1 to 80 characters without control characters. */
export function checkHomeCity(text: string): HomeCityCheck {
  if (text.trim().length === 0) return { ok: true, city: null };
  const city = readCity(text);
  if (city) return { ok: true, city };
  return [...text.trim()].length > HOME_CITY_MAX_LENGTH ? { ok: false, reason: 'too-long' } : { ok: false, reason: 'invalid' };
}

/** Both methods may reject when storage fails. */
export interface WeatherSettingsStore {
  load(): Promise<WeatherSettings>;
  save(settings: WeatherSettings): Promise<void>;
}

/** In memory, for tests. */
export class MemoryWeatherSettingsStore implements WeatherSettingsStore {
  saves = 0;

  constructor(private settings: WeatherSettings = { ...DEFAULT_WEATHER_SETTINGS }) {}

  async load(): Promise<WeatherSettings> {
    return { ...this.settings };
  }

  async save(settings: WeatherSettings): Promise<void> {
    this.saves++;
    this.settings = { ...settings };
  }
}

export const WEATHER_SETTINGS_KEY = 'weather-settings';

/** Real store: one JSON value in the settings key-value store. */
export class KvWeatherSettingsStore implements WeatherSettingsStore {
  constructor(private readonly storage: KeyValueStorage) {}

  async load(): Promise<WeatherSettings> {
    return parseWeatherSettings(await this.storage.getItemAsync(WEATHER_SETTINGS_KEY));
  }

  async save(settings: WeatherSettings): Promise<void> {
    await this.storage.setItemAsync(WEATHER_SETTINGS_KEY, JSON.stringify({ useLocalWeather: settings.useLocalWeather, homeCity: settings.homeCity }));
  }
}

/** The app's store, on the shared settings connection (`settingsStorage`). */
export function createKvWeatherSettingsStore(): KvWeatherSettingsStore {
  return new KvWeatherSettingsStore(settingsStorage());
}
