/**
 * Open-Meteo calls for the weather function (Gate 3 decision D9): the daily
 * forecast for today and, for a typed city, the geocoding search. Plain
 * `fetch` (no key; free tier, non-commercial, under 10,000 calls a day,
 * CC BY 4.0, credit shown by the app). Plain TypeScript with no Deno APIs,
 * so Jest tests it with a fake `fetch`.
 *
 * Rules, as for the model calls: each call must finish within its timeout
 * (aborted, and resolved `timeout` even if `fetch` ignores the abort); a
 * non-200 body is discarded unread; never throws; never logs. The URLs
 * carry the coordinates or the city, so they are never logged either.
 */
import { classifyProviderStatus, type ProviderError } from '../_shared/claude.ts';
import {
  validateWeatherSummary,
  WEATHER_TEMP_MAX_C,
  WEATHER_TEMP_MIN_C,
  WEATHER_WIND_MAX_KPH,
  type WeatherSummary,
} from '../_shared/generate-outfits-contract.ts';
import { readPlaceName } from '../_shared/weather-contract.ts';

import { mapWmoCode } from './wmo.ts';

export const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/** The daily values asked for, in Open-Meteo's default units (°C, km/h, percent). */
export const FORECAST_DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
  'wind_speed_10m_max',
] as const;

/** Today only, in the place's own time zone. */
export function forecastUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: FORECAST_DAILY_FIELDS.join(','),
    timezone: 'auto',
    forecast_days: '1',
  });
  return `${OPEN_METEO_FORECAST_URL}?${params.toString()}`;
}

/** The single best match for a name, in English. */
export function geocodingUrl(city: string): string {
  const params = new URLSearchParams({ name: city, count: '1', language: 'en', format: 'json' });
  return `${OPEN_METEO_GEOCODING_URL}?${params.toString()}`;
}

export type FetchJsonResult = { kind: 'body'; body: unknown } | { kind: 'error'; error: ProviderError };

/**
 * GETs a URL and parses the JSON. Network failure or a dropped reply is
 * `unavailable`; past `timeoutMs` is `timeout`; other statuses follow
 * `classifyProviderStatus` (429 `rate_limited`, 5xx `unavailable`, other
 * 4xx `rejected`). A 200 that is not JSON is `rejected`.
 */
export async function fetchJson(url: string, timeoutMs: number, fetchImpl: typeof fetch): Promise<FetchJsonResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timeout');
    }, Math.max(0, timeoutMs));
  });
  const work = (async (): Promise<FetchJsonResult> => {
    let response: Response;
    try {
      response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal });
    } catch {
      return { kind: 'error', error: 'unavailable' };
    }
    if (response.status !== 200) {
      try {
        await response.body?.cancel();
      } catch {
        // Already closed.
      }
      return { kind: 'error', error: classifyProviderStatus(response.status) };
    }
    let text: string;
    try {
      text = await response.text();
    } catch {
      return { kind: 'error', error: 'unavailable' };
    }
    try {
      return { kind: 'body', body: JSON.parse(text) };
    } catch {
      return { kind: 'error', error: 'rejected' };
    }
  })();
  try {
    const result = await Promise.race([work, expired]);
    if (result === 'timeout') {
      work.catch(() => undefined);
      return { kind: 'error', error: 'timeout' };
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The first entry of `daily[field]` when it is a finite number, else null. */
function firstNumber(daily: Record<string, unknown>, field: string): number | null {
  const list = daily[field];
  if (!Array.isArray(list) || list.length === 0) return null;
  const value = list[0];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Today's summary from a forecast body, or null when it lacks what is
 * needed (a code and both temperatures) or is out of range. Temperatures,
 * rain chance and wind are rounded to whole numbers. A missing rain chance
 * or wind counts as 0 (Open-Meteo leaves them null where its models have
 * none); the rain chance is clamped to 0-100.
 */
export function readForecast(body: unknown): WeatherSummary | null {
  if (!isRecord(body) || !isRecord(body.daily)) return null;
  const { daily } = body;
  const code = firstNumber(daily, 'weather_code');
  const high = firstNumber(daily, 'temperature_2m_max');
  const low = firstNumber(daily, 'temperature_2m_min');
  if (code === null || high === null || low === null) return null;
  const highC = Math.round(high);
  const lowC = Math.round(low);
  if (highC > WEATHER_TEMP_MAX_C || lowC < WEATHER_TEMP_MIN_C || lowC > highC) return null;
  const rainChance = Math.min(100, Math.max(0, Math.round(firstNumber(daily, 'precipitation_probability_max') ?? 0)));
  const windKph = Math.max(0, Math.round(firstNumber(daily, 'wind_speed_10m_max') ?? 0));
  if (windKph > WEATHER_WIND_MAX_KPH) return null;
  const summary: WeatherSummary = { highC, lowC, rainChance, windKph, ...mapWmoCode(Math.round(code)) };
  const valid = validateWeatherSummary(summary);
  return valid.ok ? valid.value : null;
}

export interface GeocodedPlace {
  lat: number;
  lon: number;
  /** "London, United Kingdom" (name and country; the name alone when that is too long; null when unusable). */
  name: string | null;
}

/**
 * The best match from a geocoding body: a place, `not_found` when the
 * search found nothing, or null when the body is malformed.
 */
export function readGeocoding(body: unknown): GeocodedPlace | 'not_found' | null {
  if (!isRecord(body)) return null;
  const { results } = body;
  if (results === undefined || results === null) return 'not_found';
  if (!Array.isArray(results)) return null;
  if (results.length === 0) return 'not_found';
  const first = results[0];
  if (!isRecord(first)) return null;
  const { latitude, longitude } = first;
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const own = readPlaceName(first.name);
  const country = readPlaceName(first.country);
  const full = own && country && own !== country ? readPlaceName(`${own}, ${country}`) : null;
  return { lat: latitude, lon: longitude, name: full ?? own };
}
