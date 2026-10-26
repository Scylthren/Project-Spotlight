/**
 * The weather function's Open-Meteo parts: the WMO table, forecast and
 * geocoding parsing, the URLs, the fetch wrapper and the hourly cache.
 * `fetch` is always a fake; no network.
 */
import { WEATHER_CONDITIONS, WEATHER_INTENSITIES } from '../../../supabase/functions/_shared/generate-outfits-contract.ts';
import { HourlyCache, weatherCacheKey } from '../../../supabase/functions/weather/cache.ts';
import {
  fetchJson,
  forecastUrl,
  geocodingUrl,
  readForecast,
  readGeocoding,
} from '../../../supabase/functions/weather/open-meteo.ts';
import { mapWmoCode, WMO_TABLE, WMO_UNKNOWN } from '../../../supabase/functions/weather/wmo.ts';
import { joinPath, readText, REPO_ROOT } from '@/security/testing/node-files';

import { fakeResponse } from './testing/model-fakes';
import { forecastBody } from './testing/weather-fakes';

describe('WMO table', () => {
  it('matches the table in docs/api/weather.md row for row', () => {
    const doc = readText(joinPath(REPO_ROOT, 'docs/api/weather.md'));
    const rows = [...doc.matchAll(/^\| (\d+) \| [^|]+ \| `([a-z-]+)` \| (?:`([a-z]+)`|none) \|$/gm)];
    const documented = Object.fromEntries(rows.map((row) => [Number(row[1]), row[3] ? { conditions: row[2], intensity: row[3] } : { conditions: row[2] }]));
    expect(documented).toEqual(WMO_TABLE);
  });

  it('uses only the fixed lists, and the orchestrated choices', () => {
    for (const mapping of Object.values(WMO_TABLE)) {
      expect(WEATHER_CONDITIONS).toContain(mapping.conditions);
      if (mapping.intensity) expect(WEATHER_INTENSITIES).toContain(mapping.intensity);
    }
    expect(mapWmoCode(0)).toEqual({ conditions: 'clear' });
    expect(mapWmoCode(1)).toEqual({ conditions: 'partly-cloudy' });
    expect(mapWmoCode(3)).toEqual({ conditions: 'cloudy' });
    expect(mapWmoCode(45)).toEqual({ conditions: 'fog' });
    expect([51, 53, 55].map(mapWmoCode)).toEqual(['light', 'moderate', 'heavy'].map((intensity) => ({ conditions: 'drizzle', intensity })));
    expect([61, 63, 65].map(mapWmoCode)).toEqual(['light', 'moderate', 'heavy'].map((intensity) => ({ conditions: 'rain', intensity })));
    expect([80, 81, 82].map(mapWmoCode)).toEqual(['light', 'moderate', 'heavy'].map((intensity) => ({ conditions: 'rain', intensity })));
    expect([71, 73, 75].map(mapWmoCode)).toEqual(['light', 'moderate', 'heavy'].map((intensity) => ({ conditions: 'snow', intensity })));
    expect(mapWmoCode(77)).toEqual({ conditions: 'snow' });
    expect(mapWmoCode(95)).toEqual({ conditions: 'thunderstorm' });
    expect(mapWmoCode(99)).toEqual({ conditions: 'thunderstorm', intensity: 'heavy' });
  });

  it('maps unknown codes to cloudy without intensity, and returns fresh objects', () => {
    expect(mapWmoCode(4)).toEqual(WMO_UNKNOWN);
    expect(mapWmoCode(-1)).toEqual({ conditions: 'cloudy' });
    const a = mapWmoCode(61);
    a.conditions = 'snow';
    expect(mapWmoCode(61).conditions).toBe('rain');
  });
});

describe('readForecast', () => {
  it('summarizes today, rounded, with conditions and intensity', () => {
    expect(readForecast(forecastBody())).toEqual({ highC: 14, lowC: 8, rainChance: 60, windKph: 22, conditions: 'rain', intensity: 'light' });
    expect(readForecast(forecastBody({ weather_code: [2] }))).toEqual({ highC: 14, lowC: 8, rainChance: 60, windKph: 22, conditions: 'partly-cloudy' });
  });

  it('counts a missing rain chance or wind as 0 and clamps the rain chance', () => {
    const summary = readForecast(forecastBody({ precipitation_probability_max: [null], wind_speed_10m_max: [] }));
    expect(summary).toMatchObject({ rainChance: 0, windKph: 0 });
    expect(readForecast(forecastBody({ precipitation_probability_max: [104] }))).toMatchObject({ rainChance: 100 });
  });

  it.each<[string, unknown]>([
    ['no daily', { latitude: 1 }],
    ['not an object', 'rain'],
    ['no code', forecastBody({ weather_code: [null] })],
    ['no high', forecastBody({ temperature_2m_max: [] })],
    ['string low', forecastBody({ temperature_2m_min: ['7'] })],
    ['low above high', forecastBody({ temperature_2m_max: [3], temperature_2m_min: [9] })],
    ['absurd heat', forecastBody({ temperature_2m_max: [90] })],
    ['absurd wind', forecastBody({ wind_speed_10m_max: [900] })],
  ])('is null for %s', (_name, body) => {
    expect(readForecast(body)).toBeNull();
  });
});

describe('readGeocoding', () => {
  it('reads the first match with name and country', () => {
    const body = { results: [{ name: 'London', latitude: 51.50853, longitude: -0.12574, country: 'United Kingdom', admin1: 'England' }] };
    expect(readGeocoding(body)).toEqual({ lat: 51.50853, lon: -0.12574, name: 'London, United Kingdom' });
  });

  it('uses the name alone when the country is missing, equal, or the pair is too long', () => {
    expect(readGeocoding({ results: [{ name: 'Monaco', latitude: 43.7, longitude: 7.4, country: 'Monaco' }] })).toMatchObject({ name: 'Monaco' });
    expect(readGeocoding({ results: [{ name: 'Somewhere', latitude: 1, longitude: 2 }] })).toMatchObject({ name: 'Somewhere' });
    expect(readGeocoding({ results: [{ name: 'x'.repeat(100), latitude: 1, longitude: 2, country: 'y'.repeat(30) }] })).toMatchObject({
      name: 'x'.repeat(100),
    });
    expect(readGeocoding({ results: [{ latitude: 1, longitude: 2 }] })).toEqual({ lat: 1, lon: 2, name: null });
  });

  it('is not_found for no results, null for malformed bodies', () => {
    expect(readGeocoding({ generationtime_ms: 0.5 })).toBe('not_found');
    expect(readGeocoding({ results: [] })).toBe('not_found');
    expect(readGeocoding({ results: 'x' })).toBeNull();
    expect(readGeocoding({ results: [{ name: 'X', latitude: '1', longitude: 2 }] })).toBeNull();
    expect(readGeocoding({ results: [{ name: 'X', latitude: 91, longitude: 2 }] })).toBeNull();
    expect(readGeocoding(null)).toBeNull();
  });
});

describe('URLs', () => {
  it('asks for today only, daily fields, local time zone', () => {
    const url = new URL(forecastUrl(51.5, -0.1));
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('latitude')).toBe('51.5');
    expect(url.searchParams.get('longitude')).toBe('-0.1');
    expect(url.searchParams.get('daily')).toBe('weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max');
    expect(url.searchParams.get('timezone')).toBe('auto');
    expect(url.searchParams.get('forecast_days')).toBe('1');
  });

  it('encodes the city for geocoding', () => {
    const url = new URL(geocodingUrl('São Paulo & co'));
    expect(url.origin + url.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search');
    expect(url.searchParams.get('name')).toBe('São Paulo & co');
    expect(url.searchParams.get('count')).toBe('1');
  });
});

describe('fetchJson', () => {
  const fetchOf = (impl: () => Promise<Response>) => jest.fn(impl) as unknown as typeof fetch;

  it('parses a 200 body', async () => {
    expect(await fetchJson('https://x', 1000, fetchOf(async () => fakeResponse(200, '{"a":1}')))).toEqual({ kind: 'body', body: { a: 1 } });
  });

  it.each<[number, string]>([
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [400, 'rejected'],
    [404, 'rejected'],
  ])('maps status %d to %s', async (status, error) => {
    expect(await fetchJson('https://x', 1000, fetchOf(async () => fakeResponse(status, '{"error":true}')))).toEqual({ kind: 'error', error });
  });

  it('maps a network error, a non-JSON 200 and a broken read', async () => {
    expect(await fetchJson('https://x', 1000, fetchOf(async () => Promise.reject(new Error('down'))))).toEqual({ kind: 'error', error: 'unavailable' });
    expect(await fetchJson('https://x', 1000, fetchOf(async () => fakeResponse(200, '<html>')))).toEqual({ kind: 'error', error: 'rejected' });
    const broken = { status: 200, text: () => Promise.reject(new Error('reset')), body: null } as unknown as Response;
    expect(await fetchJson('https://x', 1000, fetchOf(async () => broken))).toEqual({ kind: 'error', error: 'unavailable' });
  });

  it('times out even when fetch ignores the abort, and aborts the request', async () => {
    let signal: AbortSignal | undefined;
    const hang = jest.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    }) as unknown as typeof fetch;
    expect(await fetchJson('https://x', 20, hang)).toEqual({ kind: 'error', error: 'timeout' });
    expect(signal?.aborted).toBe(true);
  });
});

describe('HourlyCache', () => {
  const HOUR = 3_600_000;

  it('keys by rounded position or lowercased city', () => {
    expect(weatherCacheKey({ lat: 51.5, lon: -0.1 })).toBe('pos:51.5,-0.1');
    expect(weatherCacheKey({ city: 'LONDON' })).toBe(weatherCacheKey({ city: 'london' }));
    expect(weatherCacheKey({ city: 'London' })).not.toBe(weatherCacheKey({ lat: 51.5, lon: -0.1 }));
  });

  it('reuses within the clock hour only', () => {
    const cache = new HourlyCache<string>();
    cache.set('k', 'v', 5 * HOUR + 10);
    expect(cache.get('k', 5 * HOUR + HOUR - 1)).toBe('v');
    expect(cache.get('k', 6 * HOUR)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('is bounded: the oldest entry goes first, a re-set entry counts as new', () => {
    const cache = new HourlyCache<number>(2);
    cache.set('a', 1, 0);
    cache.set('b', 2, 0);
    cache.set('a', 3, 0);
    cache.set('c', 4, 0);
    expect(cache.size).toBe(2);
    expect(cache.get('b', 0)).toBeUndefined();
    expect(cache.get('a', 0)).toBe(3);
    expect(cache.get('c', 0)).toBe(4);
    expect(() => new HourlyCache(0)).toThrow();
  });
});
