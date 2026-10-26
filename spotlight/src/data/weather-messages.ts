/**
 * Every new line of text for weather (Gate 3 slice 5a), in one place:
 * DRAFTS for the human to approve (privacy wording especially). Also the
 * weather line on Results ("64° / 48° · Light rain · 60% rain"). Plain data
 * and functions, tested; screens only show them.
 *
 * The location permission strings shown by the OS are in `app.json`
 * (expo-location plugin) and must say the same thing as LOCATION_INTRO.
 */
import type { WeatherCondition, WeatherIntensity, WeatherSummary } from '@/ai/generate-outfits-contract';
import { WEATHER_ATTRIBUTION } from '@/ai/weather-contract';

import type { LocationProblem } from './location-provider';
import { HOME_CITY_MAX_LENGTH } from './weather-settings';

/** The intro before the system prompt (camera-intro style). */
export const LOCATION_INTRO = {
  title: 'Dress for the weather?',
  body:
    "Spotlight uses your approximate location to look up today's weather. It's rounded to about 10 km on your phone and sent to our server and Open-Meteo for the forecast. It's never sent to Claude or saved on our server.",
  allow: 'Allow location',
  notNow: 'Not now',
} as const;

/** The Me tab's Weather section. */
export const WEATHER_SETTINGS_TEXT = {
  section: 'Weather',
  toggle: 'Use local weather',
  toggleHint: "For Match today's weather. Uses your approximate location (rounded to about 10 km) or your home city.",
  cityLabel: 'Home city',
  cityHint: "Used when location is off or not allowed. It's sent to our server and Open-Meteo to find the place.",
  cityPlaceholder: 'For example, London',
  cityTooLong: `Keep it to ${HOME_CITY_MAX_LENGTH} characters.`,
  cityInvalid: 'Use letters, numbers and spaces.',
  saveFailed: "Couldn't save. Try again.",
} as const;

/** The Style screen's weather row. */
export const MATCH_WEATHER_TEXT = {
  label: "Match today's weather",
  onHint: 'Your request is optional.',
  offNote: "Turn on Use local weather on the Me tab to dress for today's weather.",
  openMe: 'Open Me',
  /** Under "Get looks" when the row is on: what else goes to Claude. */
  dataNotice: "Today's forecast (never your location) is also sent to Claude.",
} as const;

/** Results: the title for a weather request with no text, the loading line, and the notice when weather was skipped. */
export const WEATHER_RESULTS_TEXT = {
  title: "Today's weather",
  checking: "Checking today's weather...",
  skipped: "Couldn't get today's weather, so these looks don't take it into account.",
  attribution: WEATHER_ATTRIBUTION,
} as const;

const CONDITION_LABELS: Readonly<Record<WeatherCondition, string>> = {
  clear: 'Clear',
  'partly-cloudy': 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  snow: 'Snow',
  thunderstorm: 'Thunderstorms',
};

/** "Light rain", "Rain", "Heavy snow", "Severe thunderstorms"; moderate reads as the plain word. */
export function conditionsText(conditions: WeatherCondition, intensity?: WeatherIntensity): string {
  const base = CONDITION_LABELS[conditions];
  if (!intensity || intensity === 'moderate') return base;
  if (conditions === 'thunderstorm') return intensity === 'heavy' ? 'Severe thunderstorms' : base;
  return `${intensity === 'light' ? 'Light' : 'Heavy'} ${base.toLowerCase()}`;
}

/** Wind from this speed (km/h) adds "Windy". */
export const WINDY_FROM_KPH = 30;

/**
 * °C (the contract's unit, also what the function and the prompt use) to °F,
 * rounded. The app shows Fahrenheit only (human, 2026-10-26).
 */
export function fahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

/** "64° / 48° · Light rain · 60% rain" (· Windy); temperatures in °F, rounded. */
export function weatherLine(weather: WeatherSummary): string {
  const parts = [
    `${fahrenheit(weather.highC)}° / ${fahrenheit(weather.lowC)}°`,
    conditionsText(weather.conditions, weather.intensity),
    `${Math.round(weather.rainChance)}% rain`,
  ];
  if (weather.windKph >= WINDY_FROM_KPH) parts.push('Windy');
  return parts.join(' · ');
}

/** The same line for screen readers, in words. */
export function weatherAccessibilityLabel(weather: WeatherSummary, placeName: string | null = null): string {
  const parts = [
    ...(placeName ? [`Weather for ${placeName}`] : ["Today's weather"]),
    `high ${fahrenheit(weather.highC)} degrees Fahrenheit, low ${fahrenheit(weather.lowC)}`,
    conditionsText(weather.conditions, weather.intensity).toLowerCase(),
    `${Math.round(weather.rainChance)} percent chance of rain`,
  ];
  if (weather.windKph >= WINDY_FROM_KPH) parts.push('windy');
  return parts.join(', ');
}

/** A failure that stops a weather request before any looks are asked for. */
export type WeatherBlock =
  | { kind: 'weather-off' }
  | { kind: 'no-location'; problem: LocationProblem }
  | { kind: 'place-not-found'; city: string };

export interface WeatherBlockView {
  title: string;
  body: string;
  /** `open-me`: the Me tab (settings); `retry`: try again. */
  action: 'open-me' | 'retry';
}

export function describeWeatherBlock(block: WeatherBlock): WeatherBlockView {
  switch (block.kind) {
    case 'weather-off':
      return { title: 'Weather is off', body: 'Turn on Use local weather on the Me tab, then try again.', action: 'open-me' };
    case 'place-not-found':
      return {
        title: 'City not found',
        body: `No place matches “${block.city}”. Check your home city on the Me tab.`,
        action: 'open-me',
      };
    case 'no-location':
      switch (block.problem) {
        case 'not-allowed':
          return {
            title: 'No location',
            body: 'Spotlight is not allowed to use your location. Add a home city on the Me tab, or allow location for Spotlight in Settings.',
            action: 'open-me',
          };
        case 'services-off':
          return {
            title: 'Location is off',
            body: 'Location services are off on this phone. Turn them on in Settings, or add a home city on the Me tab.',
            action: 'open-me',
          };
        case 'unavailable':
          return {
            title: "Couldn't find your location",
            body: 'Try again in a moment, or add a home city on the Me tab.',
            action: 'retry',
          };
      }
  }
}
