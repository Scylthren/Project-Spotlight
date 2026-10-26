import { act, renderHook } from '@testing-library/react-native';

import { MockWeatherClient } from '@/ai/weather-client';
import { MockLocationProvider } from '@/data/location-provider';
import { MemoryWeatherDayCache } from '@/data/weather-day-cache';
import { MemoryWeatherSettingsStore, type WeatherSettings } from '@/data/weather-settings';

import { useWeatherSettings } from './use-weather-settings';
import { createWeatherServices } from './weather-services';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    jest.requireActual('react').useEffect(effect, [effect]);
  },
}));

function services(initial?: WeatherSettings) {
  const settings = new MemoryWeatherSettingsStore(initial);
  return {
    settings,
    services: createWeatherServices({ settings, location: new MockLocationProvider(), client: new MockWeatherClient(), cache: new MemoryWeatherDayCache() }),
  };
}

describe('useWeatherSettings', () => {
  it('loads, toggles and saves at once (default off)', async () => {
    const s = services();
    const { result } = await renderHook(() => useWeatherSettings(s.services));
    await act(async () => undefined);
    expect(result.current.settings).toEqual({ useLocalWeather: false, homeCity: null });
    await act(async () => result.current.setUseLocalWeather(true));
    expect(await s.settings.load()).toEqual({ useLocalWeather: true, homeCity: null });
    expect(result.current.settings.useLocalWeather).toBe(true);
  });

  it('saves a normalized city on leave, clears it when empty, and refuses a long one', async () => {
    const s = services({ useLocalWeather: true, homeCity: 'Oslo' });
    const { result } = await renderHook(() => useWeatherSettings(s.services));
    await act(async () => undefined);
    expect(result.current.cityText).toBe('Oslo');
    await act(async () => result.current.changeCity('  Mexico   City '));
    await act(async () => {
      await result.current.saveCity();
    });
    expect(result.current.cityText).toBe('Mexico City');
    expect(await s.settings.load()).toEqual({ useLocalWeather: true, homeCity: 'Mexico City' });

    await act(async () => result.current.changeCity('x'.repeat(81)));
    let saved = true;
    await act(async () => {
      saved = await result.current.saveCity();
    });
    expect(saved).toBe(false);
    expect(result.current.cityError).toBe('Keep it to 80 characters.');
    expect((await s.settings.load()).homeCity).toBe('Mexico City');

    await act(async () => result.current.changeCity(''));
    expect(result.current.cityError).toBeUndefined();
    await act(async () => {
      await result.current.saveCity();
    });
    expect(await s.settings.load()).toEqual({ useLocalWeather: true, homeCity: null });
  });

  it('a failed save keeps what is stored and says so', async () => {
    const s = services();
    s.settings.save = async () => Promise.reject(new Error('disk'));
    const { result } = await renderHook(() => useWeatherSettings(s.services));
    await act(async () => undefined);
    await act(async () => result.current.setUseLocalWeather(true));
    expect(result.current.settings.useLocalWeather).toBe(false);
    expect(result.current.saveError).toBe("Couldn't save. Try again.");
  });
});
