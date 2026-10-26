/**
 * Today's weather on the phone: settings, the day cache, where the weather
 * is for (rounded position, else home city), and the location intro rule.
 * Location, the weather function and storage are fakes.
 */
import { FakeWeatherClient, MOCK_WEATHER } from '@/ai/weather-client';

import type { KeyValueStorage } from './kv-appearance-store';
import { LocationIntroGate, locationIntroNeeded } from './location-intro-gate';
import { MockLocationProvider } from './location-provider';
import { TodayWeather, weatherPlaceKey, type TodayWeatherDeps } from './today-weather';
import { KvWeatherDayCache, MemoryWeatherDayCache, parseCachedDayWeather, WEATHER_TODAY_KEY } from './weather-day-cache';
import {
  checkHomeCity,
  DEFAULT_WEATHER_SETTINGS,
  KvWeatherSettingsStore,
  MemoryWeatherSettingsStore,
  parseWeatherSettings,
  WEATHER_SETTINGS_KEY,
  type WeatherSettings,
} from './weather-settings';

class MapStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  async getItemAsync(key: string) {
    return this.map.get(key) ?? null;
  }
  async setItemAsync(key: string, value: string) {
    this.map.set(key, value);
  }
}

const ON: WeatherSettings = { useLocalWeather: true, homeCity: null };
const OCT_26 = new Date(2026, 9, 26, 9, 0);

function setup(settings: WeatherSettings = ON, location = new MockLocationProvider()) {
  const client = new FakeWeatherClient();
  const cache = new MemoryWeatherDayCache();
  let now = OCT_26;
  const deps: TodayWeatherDeps = { settings: new MemoryWeatherSettingsStore(settings), location, client, cache, now: () => now };
  return { today: new TodayWeather(deps), client, cache, location, setNow: (date: Date) => (now = date) };
}

describe('TodayWeather', () => {
  it('is off when "Use local weather" is off: no location, no call', async () => {
    const s = setup(DEFAULT_WEATHER_SETTINGS);
    expect(await s.today.resolve()).toEqual({ kind: 'off' });
    expect(s.location.positionCalls).toBe(0);
    expect(s.client.queries).toHaveLength(0);
  });

  it('asks for the rounded position, then caches the answer for the day and place', async () => {
    const s = setup();
    expect(await s.today.resolve()).toEqual({ kind: 'ready', weather: MOCK_WEATHER, placeName: null, source: 'location' });
    expect(s.client.queries[0].query).toEqual({ lat: 51.5, lon: -0.1 });
    expect(await s.today.resolve()).toMatchObject({ kind: 'ready' });
    expect(s.client.queries).toHaveLength(1);
    expect(s.cache.entry).toMatchObject({ day: '2026-10-26', place: 'pos:51.5,-0.1' });
  });

  it('asks again on a new day, and in a new place (travel)', async () => {
    const s = setup();
    await s.today.resolve();
    s.setNow(new Date(2026, 9, 27, 0, 1));
    await s.today.resolve();
    expect(s.client.queries).toHaveLength(2);
    s.location.fix = { lat: 48.8566, lon: 2.3522 };
    await s.today.resolve();
    expect(s.client.queries.map((q) => q.query)).toEqual([
      { lat: 51.5, lon: -0.1 },
      { lat: 51.5, lon: -0.1 },
      { lat: 48.9, lon: 2.4 },
    ]);
  });

  it('falls back to the home city when location is not allowed, off or has no fix', async () => {
    for (const [permission, fix] of [
      [{ status: 'denied', canAskAgain: false }, { lat: 1, lon: 2 }],
      [{ status: 'granted', canAskAgain: true }, 'services-off'],
      [{ status: 'granted', canAskAgain: true }, 'unavailable'],
    ] as const) {
      const s = setup({ useLocalWeather: true, homeCity: 'Leeds' }, new MockLocationProvider({ ...permission }, fix));
      s.client.queue.push({ ok: true, weather: MOCK_WEATHER, placeName: 'Leeds, United Kingdom' });
      expect(await s.today.resolve()).toEqual({ kind: 'ready', weather: MOCK_WEATHER, placeName: 'Leeds, United Kingdom', source: 'city' });
      expect(s.client.queries[0].query).toEqual({ city: 'Leeds' });
    }
  });

  it('says why when there is no position and no city', async () => {
    expect(await setup(ON, new MockLocationProvider({ status: 'denied', canAskAgain: false })).today.resolve()).toEqual({
      kind: 'no-location',
      problem: 'not-allowed',
    });
    expect(await setup(ON, new MockLocationProvider(undefined, 'services-off')).today.resolve()).toEqual({ kind: 'no-location', problem: 'services-off' });
    expect(await setup(ON, new MockLocationProvider(undefined, 'unavailable')).today.resolve()).toEqual({ kind: 'no-location', problem: 'unavailable' });
  });

  it('reports a city with no match, other failures, and cancellation; failures are not cached', async () => {
    const s = setup({ useLocalWeather: true, homeCity: 'Qwxzz' }, new MockLocationProvider({ status: 'denied', canAskAgain: false }));
    s.client.queue.push({ ok: false, failure: 'place-not-found' }, { ok: false, failure: 'offline' }, { ok: false, failure: 'rate-limited' });
    expect(await s.today.resolve()).toEqual({ kind: 'place-not-found', city: 'Qwxzz' });
    expect(await s.today.resolve()).toEqual({ kind: 'failed', failure: 'offline' });
    expect(await s.today.resolve()).toEqual({ kind: 'failed', failure: 'rate-limited' });
    expect(s.cache.entry).toBeNull();
    const controller = new AbortController();
    controller.abort();
    expect(await s.today.resolve({ signal: controller.signal })).toEqual({ kind: 'cancelled' });
  });

  it('passes the signal to the client and survives broken storage', async () => {
    const s = setup();
    s.cache.load = async () => {
      throw new Error('db');
    };
    s.cache.save = async () => {
      throw new Error('db');
    };
    const controller = new AbortController();
    expect(await s.today.resolve({ signal: controller.signal })).toMatchObject({ kind: 'ready' });
    expect(s.client.queries[0].options.signal).toBe(controller.signal);
    const broken = new TodayWeather({
      settings: { load: async () => Promise.reject(new Error('db')), save: async () => undefined },
      location: new MockLocationProvider(),
      client: new FakeWeatherClient(),
      cache: new MemoryWeatherDayCache(),
    });
    expect(await broken.resolve()).toEqual({ kind: 'off' });
  });

  it('keys places by rounded position or lowercase city', () => {
    expect(weatherPlaceKey({ lat: 51.5, lon: -0.1 })).toBe('pos:51.5,-0.1');
    expect(weatherPlaceKey({ city: 'New York' })).toBe('city:new york');
  });
});

describe('weather settings', () => {
  it('defaults to off with no city; parses leniently', () => {
    expect(DEFAULT_WEATHER_SETTINGS).toEqual({ useLocalWeather: false, homeCity: null });
    expect(parseWeatherSettings(null)).toEqual(DEFAULT_WEATHER_SETTINGS);
    expect(parseWeatherSettings('nope')).toEqual(DEFAULT_WEATHER_SETTINGS);
    expect(parseWeatherSettings('{"useLocalWeather":"yes","homeCity":"  Oslo "}')).toEqual({ useLocalWeather: false, homeCity: 'Oslo' });
    expect(parseWeatherSettings('{"useLocalWeather":true,"homeCity":""}')).toEqual({ useLocalWeather: true, homeCity: null });
  });

  it('checks the city field', () => {
    expect(checkHomeCity('  ')).toEqual({ ok: true, city: null });
    expect(checkHomeCity(' Mexico  City ')).toEqual({ ok: true, city: 'Mexico City' });
    expect(checkHomeCity('x'.repeat(81))).toEqual({ ok: false, reason: 'too-long' });
    expect(checkHomeCity('a\u0000b')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('the KV store round-trips one JSON value', async () => {
    const storage = new MapStorage();
    const store = new KvWeatherSettingsStore(storage);
    expect(await store.load()).toEqual(DEFAULT_WEATHER_SETTINGS);
    await store.save({ useLocalWeather: true, homeCity: 'Oslo' });
    expect(JSON.parse(storage.map.get(WEATHER_SETTINGS_KEY)!)).toEqual({ useLocalWeather: true, homeCity: 'Oslo' });
    expect(await store.load()).toEqual({ useLocalWeather: true, homeCity: 'Oslo' });
  });
});

describe('weather day cache', () => {
  const entry = { day: '2026-10-26', place: 'city:oslo', weather: MOCK_WEATHER, placeName: 'Oslo, Norway' };

  it('the KV cache returns only the same day and place', async () => {
    const storage = new MapStorage();
    const cache = new KvWeatherDayCache(storage);
    await cache.save(entry);
    expect(await cache.load('2026-10-26', 'city:oslo')).toEqual(entry);
    expect(await cache.load('2026-10-27', 'city:oslo')).toBeNull();
    expect(await cache.load('2026-10-26', 'pos:1,2')).toBeNull();
    storage.map.set(WEATHER_TODAY_KEY, '{"day":"2026-10-26","place":"city:oslo","weather":{"conditions":"Sunny"}}');
    expect(await cache.load('2026-10-26', 'city:oslo')).toBeNull();
  });

  it('parses only well-formed entries', () => {
    expect(parseCachedDayWeather(JSON.stringify(entry))).toEqual(entry);
    expect(parseCachedDayWeather(JSON.stringify({ ...entry, placeName: 42 }))).toEqual({ ...entry, placeName: null });
    expect(parseCachedDayWeather('x')).toBeNull();
    expect(parseCachedDayWeather(JSON.stringify({ ...entry, day: 1 }))).toBeNull();
  });
});

describe('location intro', () => {
  it('shows for never-asked, and for an askable denial without a city; never when weather is off', () => {
    const undetermined = { status: 'undetermined', canAskAgain: true } as const;
    const askable = { status: 'denied', canAskAgain: true } as const;
    expect(locationIntroNeeded(undetermined, ON)).toBe(true);
    expect(locationIntroNeeded(undetermined, { useLocalWeather: true, homeCity: 'Oslo' })).toBe(true);
    expect(locationIntroNeeded(askable, ON)).toBe(true);
    expect(locationIntroNeeded(askable, { useLocalWeather: true, homeCity: 'Oslo' })).toBe(false);
    expect(locationIntroNeeded({ status: 'denied', canAskAgain: false }, ON)).toBe(false);
    expect(locationIntroNeeded({ status: 'granted', canAskAgain: true }, ON)).toBe(false);
    expect(locationIntroNeeded(undetermined, DEFAULT_WEATHER_SETTINGS)).toBe(false);
  });

  it('the gate shows it once per session and Allow triggers the system prompt', async () => {
    const location = new MockLocationProvider({ status: 'undetermined', canAskAgain: true });
    const gate = new LocationIntroGate(location);
    expect(await gate.shouldShow(ON)).toBe(true);
    expect(await gate.shouldShow(ON)).toBe(false);
    expect(await gate.allow()).toEqual({ status: 'granted', canAskAgain: true });
    expect(location.requestCalls).toBe(1);
  });
});
