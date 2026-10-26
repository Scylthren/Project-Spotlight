import { joinPath, readText, REPO_ROOT } from '@/security/testing/node-files';

import { WEATHER_CONDITIONS, WEATHER_INTENSITIES } from './generate-outfits-contract';
import { TAG_ITEM_ERROR_CODES } from './tag-item-contract';
import {
  isRoundedCoordinate,
  readWeatherErrorCode,
  roundCoordinate,
  roundPosition,
  validateWeatherRequest,
  validateWeatherResponse,
  WEATHER_API_VERSION,
  WEATHER_ATTRIBUTION,
  WEATHER_CITY_MAX_LENGTH,
  WEATHER_ERROR_CODES,
  WEATHER_MAX_BODY_BYTES,
  WEATHER_PLACE_MAX_LENGTH,
} from './weather-contract';

const DOC = 'docs/api/weather.md';
const SUMMARY = { highC: 14, lowC: 8, rainChance: 60, windKph: 22, conditions: 'rain', intensity: 'light' } as const;

describe('weather contract drift', () => {
  it('the app copy is byte-identical to supabase/functions/_shared/weather-contract.ts', () => {
    const canonical = readText(joinPath(REPO_ROOT, 'supabase/functions/_shared/weather-contract.ts'));
    const copy = readText(joinPath(REPO_ROOT, 'spotlight/src/ai/weather-contract.ts'));
    // If this fails: edit the supabase file, then copy it over the app file.
    expect(copy).toBe(canonical);
  });

  it('keeps every tag-item error code and adds place_not_found', () => {
    expect([...WEATHER_ERROR_CODES]).toEqual([...TAG_ITEM_ERROR_CODES, 'place_not_found']);
  });

  it('documents every field, code, value and limit in the API doc', () => {
    const doc = readText(joinPath(REPO_ROOT, DOC));
    for (const code of WEATHER_ERROR_CODES) expect(doc).toContain(`\`${code}\``);
    for (const field of ['lat', 'lon', 'city', 'apiVersion', 'place', 'place.name', 'weather', 'attribution']) expect(doc).toContain(`\`${field}\``);
    for (const field of ['highC', 'lowC', 'rainChance', 'windKph', 'conditions', 'intensity']) expect(doc).toContain(`\`weather.${field}\``);
    for (const value of [...WEATHER_CONDITIONS, ...WEATHER_INTENSITIES]) expect(doc).toContain(`\`${value}\``);
    expect(doc).toContain(WEATHER_ATTRIBUTION);
    expect(doc.replace(/,/g, '')).toContain(`${WEATHER_MAX_BODY_BYTES} bytes`);
    expect(doc).toContain(`1 to ${WEATHER_CITY_MAX_LENGTH} characters`);
    expect(doc).toContain(`over ${WEATHER_PLACE_MAX_LENGTH} characters`);
  });
});

describe('rounding', () => {
  it('rounds to 0.1 degree, clears float noise and negative zero', () => {
    expect(roundCoordinate(51.50735)).toBe(51.5);
    expect(roundCoordinate(-0.12776)).toBe(-0.1);
    expect(roundCoordinate(-0.04)).toBe(0);
    expect(Object.is(roundCoordinate(-0.04), 0)).toBe(true);
    expect(roundCoordinate(0.1 + 0.2)).toBe(0.3);
    expect(roundCoordinate(40.75)).toBe(40.8);
    expect(String(roundCoordinate(35.6762))).toBe('35.7');
  });

  it('roundPosition rounds both, refuses out-of-range and non-finite values', () => {
    expect(roundPosition(51.50735, -0.12776)).toEqual({ lat: 51.5, lon: -0.1 });
    expect(roundPosition(-33.8688, 151.2093)).toEqual({ lat: -33.9, lon: 151.2 });
    expect(roundPosition(90, 180)).toEqual({ lat: 90, lon: 180 });
    expect(roundPosition(91, 0)).toBeNull();
    expect(roundPosition(0, -181)).toBeNull();
    expect(roundPosition(Number.NaN, 0)).toBeNull();
    expect(roundPosition(0, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('every rounded value passes isRoundedCoordinate; more decimals do not', () => {
    for (let i = -900; i <= 900; i += 7) expect(isRoundedCoordinate(roundCoordinate(i / 10 + 0.0123), 90)).toBe(true);
    expect(isRoundedCoordinate(51.51, 90)).toBe(false);
    expect(isRoundedCoordinate(51.5000001, 90)).toBe(false);
    expect(isRoundedCoordinate(0.3, 90)).toBe(true);
    expect(isRoundedCoordinate(-0.1, 180)).toBe(true);
    expect(isRoundedCoordinate(90.1, 90)).toBe(false);
    expect(isRoundedCoordinate('51.5', 90)).toBe(false);
  });
});

describe('validateWeatherRequest', () => {
  it('accepts a rounded position', () => {
    expect(validateWeatherRequest({ lat: 51.5, lon: -0.1 })).toEqual({ ok: true, value: { lat: 51.5, lon: -0.1 } });
    expect(validateWeatherRequest({ lat: 0, lon: 0, city: null, extra: 1 })).toEqual({ ok: true, value: { lat: 0, lon: 0 } });
  });

  it('accepts a city, normalized', () => {
    expect(validateWeatherRequest({ city: '  New   York ' })).toEqual({ ok: true, value: { city: 'New York' } });
    expect(validateWeatherRequest({ city: 'São Paulo', lat: null, lon: null })).toEqual({ ok: true, value: { city: 'São Paulo' } });
    expect(validateWeatherRequest({ city: '\u{1F600}'.repeat(WEATHER_CITY_MAX_LENGTH) }).ok).toBe(true);
  });

  it.each<[string, unknown]>([
    ['not an object', [51.5, -0.1]],
    ['null', null],
    ['empty object', {}],
    ['both forms', { lat: 51.5, lon: -0.1, city: 'London' }],
    ['lat only', { lat: 51.5 }],
    ['lon only', { lon: -0.1 }],
    ['over-precise lat', { lat: 51.51, lon: -0.1 }],
    ['over-precise lon', { lat: 51.5, lon: -0.127 }],
    ['full GPS precision', { lat: 51.507351, lon: -0.127758 }],
    ['lat out of range', { lat: 90.5, lon: 0 }],
    ['lon out of range', { lat: 0, lon: 180.1 }],
    ['string coordinates', { lat: '51.5', lon: '-0.1' }],
    ['empty city', { city: '   ' }],
    ['long city', { city: 'x'.repeat(WEATHER_CITY_MAX_LENGTH + 1) }],
    ['city with a control character', { city: 'Lon\u0000don' }],
    ['numeric city', { city: 42 }],
  ])('rejects %s', (_name, body) => {
    expect(validateWeatherRequest(body).ok).toBe(false);
  });

  it('a city at its cap with 4-byte characters fits the body limit', () => {
    const body = JSON.stringify({ city: '\u{1F600}'.repeat(WEATHER_CITY_MAX_LENGTH) });
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(WEATHER_MAX_BODY_BYTES);
  });
});

describe('validateWeatherResponse', () => {
  const good = { apiVersion: WEATHER_API_VERSION, place: { name: 'London, United Kingdom' }, weather: SUMMARY, attribution: WEATHER_ATTRIBUTION };

  it('accepts a full answer and one without place or intensity', () => {
    expect(validateWeatherResponse(good)).toEqual({ ok: true, value: good });
    const { intensity: _drop, ...plain } = SUMMARY;
    expect(validateWeatherResponse({ ...good, place: undefined, weather: plain })).toEqual({
      ok: true,
      value: { apiVersion: 1, weather: plain, attribution: WEATHER_ATTRIBUTION },
    });
  });

  it('drops a malformed place instead of failing', () => {
    for (const place of [{ name: '' }, { name: 'x'.repeat(WEATHER_PLACE_MAX_LENGTH + 1) }, 'London', { name: 'a\u0007b' }]) {
      const result = validateWeatherResponse({ ...good, place });
      expect(result.ok && result.value.place).toBeUndefined();
    }
  });

  it.each<[string, unknown]>([
    ['not an object', 'sunny'],
    ['wrong apiVersion', { ...good, apiVersion: 2 }],
    ['missing weather', { ...good, weather: undefined }],
    ['free-text conditions', { ...good, weather: { ...SUMMARY, conditions: 'Light rain' } }],
    ['unknown intensity', { ...good, weather: { ...SUMMARY, intensity: 'extreme' } }],
    ['missing attribution', { ...good, attribution: undefined }],
    ['other attribution', { ...good, attribution: 'Weather' }],
  ])('rejects %s', (_name, body) => {
    expect(validateWeatherResponse(body).ok).toBe(false);
  });
});

describe('readWeatherErrorCode', () => {
  it('reads known codes only', () => {
    expect(readWeatherErrorCode({ error: { code: 'place_not_found', message: 'x' } })).toBe('place_not_found');
    expect(readWeatherErrorCode({ error: { code: 'rate_limited' } })).toBe('rate_limited');
    expect(readWeatherErrorCode({ error: { code: 'nope' } })).toBeNull();
    expect(readWeatherErrorCode(null)).toBeNull();
  });
});
