/**
 * weather API contract (Gate 3 slice 5a): request and response types,
 * limits and validators.
 *
 * THE SOURCE OF TRUTH. `spotlight/src/ai/weather-contract.ts` is a
 * byte-for-byte copy (the Expo app cannot import from `supabase/`); a Jest
 * test fails when the two drift. Edit this file, then copy it over.
 *
 * Plain TypeScript. Its only imports are the sibling contracts, which sit
 * next to it in both places, so it runs unchanged in Deno (the edge
 * function), in React Native (the app) and in Jest (the tests). Documented
 * in `docs/api/weather.md`.
 *
 * The answer's `weather` is the generate-outfits `WeatherSummary`, so the app
 * passes it on unchanged. Coordinates and city text only ever go to our
 * function and from there to Open-Meteo; they never reach Claude and are
 * never stored or logged.
 */
import { validateWeatherSummary, type WeatherSummary } from './generate-outfits-contract.ts';
import { TAG_ITEM_ERROR_CODES, type Validation } from './tag-item-contract.ts';

/** Bumped when the request or response shape changes incompatibly. */
export const WEATHER_API_VERSION = 1;

/** Largest accepted request body in bytes (a city at its cap with 4-byte characters is about 340). */
export const WEATHER_MAX_BODY_BYTES = 1_024;

/** Longest city text, in characters (code points) after trimming and collapsing whitespace. */
export const WEATHER_CITY_MAX_LENGTH = 80;

/** Longest place name in an answer, in characters (code points). */
export const WEATHER_PLACE_MAX_LENGTH = 120;

/**
 * Coordinates are sent with at most one decimal (0.1 degree, about 11 km
 * north-south): the app rounds before anything leaves the phone, and the
 * function refuses more precision rather than rounding it itself.
 */
export const WEATHER_COORDINATE_DECIMALS = 1;

/** The credit Open-Meteo's licence (CC BY 4.0) asks for; the app shows it wherever weather appears. */
export const WEATHER_ATTRIBUTION = 'Weather data by Open-Meteo.com';

/** Today's weather at a rounded position. */
export interface WeatherByPosition {
  /** Latitude, -90 to 90, at most one decimal. */
  lat: number;
  /** Longitude, -180 to 180, at most one decimal. */
  lon: number;
}

/** Today's weather in a city the user typed (geocoded by the function). */
export interface WeatherByCity {
  /** 1 to 80 characters, no control characters. */
  city: string;
}

export type WeatherRequest = WeatherByPosition | WeatherByCity;

export interface WeatherResponse {
  apiVersion: number;
  /** Only for a city request: the place Open-Meteo matched, e.g. "London, United Kingdom". */
  place?: { name: string };
  weather: WeatherSummary;
  /** Always WEATHER_ATTRIBUTION. */
  attribution: string;
}

export const WEATHER_ERROR_CODES = [
  ...TAG_ITEM_ERROR_CODES,
  /** A city request that Open-Meteo's geocoding could not match (404). */
  'place_not_found',
] as const;
export type WeatherErrorCode = (typeof WEATHER_ERROR_CODES)[number];

export interface WeatherErrorResponse {
  error: { code: WeatherErrorCode; message: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A coordinate rounded to 0.1 degree. Also turns -0 into 0 and clears float
 * noise (0.1 + 0.2 gives 0.3), so the value prints with at most one decimal.
 */
export function roundCoordinate(value: number): number {
  const rounded = Number((Math.round(value * 10) / 10).toFixed(WEATHER_COORDINATE_DECIMALS));
  return rounded === 0 ? 0 : rounded;
}

/** Rounds a position for sending; null when either value is not a finite number in range. */
export function roundPosition(lat: number, lon: number): WeatherByPosition | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: roundCoordinate(lat), lon: roundCoordinate(lon) };
}

/** A finite number within ±limit with at most one decimal (as `roundCoordinate` gives). */
export function isRoundedCoordinate(value: unknown, limit: number): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) return false;
  return Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
}

/** Trims and collapses whitespace runs to one space. */
export function normalizeCity(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** True when the text has a C0 or C1 control character. */
function hasControlCharacter(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** The city normalized, or null when it is empty, over 80 characters or has a control character. */
export function readCity(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const city = normalizeCity(value);
  const length = [...city].length;
  if (length < 1 || length > WEATHER_CITY_MAX_LENGTH || hasControlCharacter(city)) return null;
  return city;
}

/**
 * Checks a parsed request body: exactly one of `{ lat, lon }` (both rounded
 * to 0.1 degree) or `{ city }`. Unknown extra fields are ignored; `null`
 * counts as absent.
 */
export function validateWeatherRequest(body: unknown): Validation<WeatherRequest> {
  if (!isRecord(body)) return { ok: false, reason: 'Body must be a JSON object.' };
  const has = (key: string) => body[key] !== undefined && body[key] !== null;
  const byPosition = has('lat') || has('lon');
  const byCity = has('city');
  if (byPosition && byCity) return { ok: false, reason: 'Send either lat and lon, or city, not both.' };
  if (byCity) {
    const city = readCity(body.city);
    if (city === null) {
      return { ok: false, reason: `city must be 1 to ${WEATHER_CITY_MAX_LENGTH} characters of text.` };
    }
    return { ok: true, value: { city } };
  }
  if (!byPosition) return { ok: false, reason: 'Send lat and lon, or city.' };
  if (!isRoundedCoordinate(body.lat, 90) || !isRoundedCoordinate(body.lon, 180)) {
    return {
      ok: false,
      reason: 'lat must be -90 to 90 and lon -180 to 180, each rounded to 0.1 degree (at most one decimal).',
    };
  }
  return { ok: true, value: { lat: roundCoordinate(body.lat), lon: roundCoordinate(body.lon) } };
}

/** Checks a place name: 1 to 120 characters, no control characters. */
export function readPlaceName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = normalizeCity(value);
  const length = [...name].length;
  if (length < 1 || length > WEATHER_PLACE_MAX_LENGTH || hasControlCharacter(name)) return null;
  return name;
}

/**
 * Checks a parsed 200 body. `place` is kept when valid (a malformed one is
 * dropped, not fatal); `weather` must pass `validateWeatherSummary`.
 */
export function validateWeatherResponse(body: unknown): Validation<WeatherResponse> {
  if (!isRecord(body)) return { ok: false, reason: 'Response must be a JSON object.' };
  if (body.apiVersion !== WEATHER_API_VERSION) return { ok: false, reason: 'Unsupported apiVersion.' };
  const weather = validateWeatherSummary(body.weather);
  if (!weather.ok) return { ok: false, reason: `${weather.reason}.` };
  if (body.attribution !== WEATHER_ATTRIBUTION) return { ok: false, reason: 'Missing attribution.' };
  const name = isRecord(body.place) ? readPlaceName(body.place.name) : null;
  return {
    ok: true,
    value: {
      apiVersion: WEATHER_API_VERSION,
      ...(name ? { place: { name } } : {}),
      weather: weather.value,
      attribution: WEATHER_ATTRIBUTION,
    },
  };
}

/** Reads an error body's code, or null when it is not a known one. */
export function readWeatherErrorCode(body: unknown): WeatherErrorCode | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const { code } = body.error;
  return typeof code === 'string' && (WEATHER_ERROR_CODES as readonly string[]).includes(code) ? (code as WeatherErrorCode) : null;
}
