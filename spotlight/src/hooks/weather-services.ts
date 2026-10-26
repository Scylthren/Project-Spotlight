import { configuredWeatherUrl } from '@/ai/backend-config';
import { RemoteWeatherClient } from '@/ai/remote-weather-client';
import type { WeatherClient } from '@/ai/weather-client';
import { ExpoLocationProvider } from '@/data/expo-location-provider';
import { LocationIntroGate } from '@/data/location-intro-gate';
import type { LocationProvider } from '@/data/location-provider';
import { TodayWeather } from '@/data/today-weather';
import { createKvWeatherDayCache, type WeatherDayCache } from '@/data/weather-day-cache';
import { createKvWeatherSettingsStore, type WeatherSettingsStore } from '@/data/weather-settings';

import { devBackendServices } from './dev-backend-services';

/** Everything weather needs on the phone (Gate 3 slice 5a). */
export interface WeatherServices {
  settings: WeatherSettingsStore;
  location: LocationProvider;
  /** The location intro before the system prompt, once per session. */
  introGate: LocationIntroGate;
  today: TodayWeather;
}

export interface WeatherServiceDeps {
  settings: WeatherSettingsStore;
  location: LocationProvider;
  client: WeatherClient;
  cache: WeatherDayCache;
  now?: () => Date;
}

/** Builds the services from their parts (tests pass mocks). */
export function createWeatherServices(deps: WeatherServiceDeps): WeatherServices {
  return {
    settings: deps.settings,
    location: deps.location,
    introGate: new LocationIntroGate(deps.location),
    today: new TodayWeather(deps),
  };
}

let services: WeatherServices | null = null;

/**
 * One set per app session, created on first use: settings and today's
 * weather in the settings database, expo-location, and the `weather`
 * function with the session's development token store.
 */
export function weatherServices(): WeatherServices {
  services ??= createWeatherServices({
    settings: createKvWeatherSettingsStore(),
    location: new ExpoLocationProvider(),
    client: new RemoteWeatherClient({ url: configuredWeatherUrl(), tokenStore: devBackendServices().tokenStore }),
    cache: createKvWeatherDayCache(),
  });
  return services;
}
