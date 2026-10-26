import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { WEATHER_SETTINGS_TEXT } from '@/data/weather-messages';
import { checkHomeCity, DEFAULT_WEATHER_SETTINGS, type WeatherSettings } from '@/data/weather-settings';

import { useIsMounted } from './use-is-mounted';
import { weatherServices, type WeatherServices } from './weather-services';

/**
 * The Me tab's Weather section (slice 5a): "Use local weather" and the home
 * city. Loaded on focus. The toggle saves at once; the city saves when the
 * field is left or submitted (`saveCity`), after `checkHomeCity` (empty
 * clears it). Every save writes the latest whole settings, one at a time.
 * A failed save keeps what is stored and shows a short error.
 */
export function useWeatherSettings(services: WeatherServices = weatherServices()) {
  const isMounted = useIsMounted();
  const [settings, setSettings] = useState<WeatherSettings>(DEFAULT_WEATHER_SETTINGS);
  const [cityText, setCityText] = useState('');
  const [cityError, setCityError] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const latest = useRef<WeatherSettings>(DEFAULT_WEATHER_SETTINGS);
  const writes = useRef<Promise<void>>(Promise.resolve());

  useFocusEffect(
    useCallback(() => {
      let active = true;
      services.settings.load().then(
        (loaded) => {
          if (!active) return;
          latest.current = loaded;
          setSettings(loaded);
          setCityText(loaded.homeCity ?? '');
          setCityError(undefined);
        },
        () => undefined,
      );
      return () => {
        active = false;
      };
    }, [services]),
  );

  function save(next: WeatherSettings): Promise<void> {
    const previous = latest.current;
    latest.current = next;
    setSettings(next);
    setSaveError(undefined);
    const write = writes.current.then(() =>
      services.settings.save(next).catch(() => {
        if (latest.current === next) latest.current = previous;
        if (isMounted()) {
          setSettings(latest.current);
          setSaveError(WEATHER_SETTINGS_TEXT.saveFailed);
        }
      }),
    );
    writes.current = write;
    return write;
  }

  function setUseLocalWeather(on: boolean): Promise<void> {
    return save({ ...latest.current, useLocalWeather: on });
  }

  function changeCity(text: string) {
    setCityText(text);
    if (cityError) setCityError(undefined);
  }

  /** Checks and saves the city field; true when it is saved (or unchanged). */
  async function saveCity(): Promise<boolean> {
    const check = checkHomeCity(cityText);
    if (!check.ok) {
      setCityError(check.reason === 'too-long' ? WEATHER_SETTINGS_TEXT.cityTooLong : WEATHER_SETTINGS_TEXT.cityInvalid);
      return false;
    }
    setCityError(undefined);
    setCityText(check.city ?? '');
    if (check.city === latest.current.homeCity) return true;
    await save({ ...latest.current, homeCity: check.city });
    return true;
  }

  return { settings, setUseLocalWeather, cityText, changeCity, saveCity, cityError, saveError };
}
