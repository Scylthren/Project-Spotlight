import { WEATHER_CONDITIONS, WEATHER_INTENSITIES, type WeatherSummary } from '@/ai/generate-outfits-contract';

import {
  conditionsText,
  describeWeatherBlock,
  fahrenheit,
  LOCATION_INTRO,
  MATCH_WEATHER_TEXT,
  weatherAccessibilityLabel,
  weatherLine,
  WEATHER_RESULTS_TEXT,
  WEATHER_SETTINGS_TEXT,
} from './weather-messages';

const DAY: WeatherSummary = { highC: 18.4, lowC: 8.6, rainChance: 60, windKph: 15, conditions: 'rain', intensity: 'light' };

describe('weather line', () => {
  it('converts Celsius to rounded Fahrenheit', () => {
    expect(fahrenheit(0)).toBe(32);
    expect(fahrenheit(100)).toBe(212);
    expect(fahrenheit(-40)).toBe(-40);
    expect(fahrenheit(37)).toBe(99);
    expect(fahrenheit(18)).toBe(64);
    expect(fahrenheit(-20)).toBe(-4);
  });

  it('reads "65° / 47° · Light rain · 60% rain" in Fahrenheit, adding Windy for strong wind', () => {
    expect(weatherLine(DAY)).toBe('65° / 47° · Light rain · 60% rain');
    expect(weatherLine({ ...DAY, windKph: 30, conditions: 'clear', intensity: undefined, rainChance: 0 })).toBe('65° / 47° · Clear · 0% rain · Windy');
    expect(weatherLine({ ...DAY, highC: -2, lowC: -11 })).toBe('28° / 12° · Light rain · 60% rain');
  });

  it('names every condition and intensity', () => {
    for (const conditions of WEATHER_CONDITIONS) {
      for (const intensity of [undefined, ...WEATHER_INTENSITIES]) expect(conditionsText(conditions, intensity).length).toBeGreaterThan(0);
    }
    expect(conditionsText('rain', 'moderate')).toBe('Rain');
    expect(conditionsText('snow', 'heavy')).toBe('Heavy snow');
    expect(conditionsText('drizzle', 'light')).toBe('Light drizzle');
    expect(conditionsText('partly-cloudy')).toBe('Partly cloudy');
    expect(conditionsText('thunderstorm', 'heavy')).toBe('Severe thunderstorms');
  });

  it('has a spoken version with the place', () => {
    expect(weatherAccessibilityLabel(DAY, 'Leeds, United Kingdom')).toBe(
      'Weather for Leeds, United Kingdom, high 65 degrees Fahrenheit, low 47, light rain, 60 percent chance of rain',
    );
    expect(weatherAccessibilityLabel({ ...DAY, windKph: 40 })).toMatch(/^Today's weather, .*, windy$/);
  });
});

describe('weather blocks', () => {
  it('sends settings problems to the Me tab, and lets a missing fix retry', () => {
    expect(describeWeatherBlock({ kind: 'weather-off' })).toMatchObject({ title: 'Weather is off', action: 'open-me' });
    expect(describeWeatherBlock({ kind: 'no-location', problem: 'not-allowed' }).action).toBe('open-me');
    expect(describeWeatherBlock({ kind: 'no-location', problem: 'services-off' }).action).toBe('open-me');
    expect(describeWeatherBlock({ kind: 'no-location', problem: 'unavailable' }).action).toBe('retry');
    expect(describeWeatherBlock({ kind: 'place-not-found', city: 'Qwx' }).body).toContain('“Qwx”');
  });
});

describe('draft copy', () => {
  it('credits Open-Meteo and keeps the privacy promises in the texts', () => {
    expect(WEATHER_RESULTS_TEXT.attribution).toBe('Weather data by Open-Meteo.com');
    expect(LOCATION_INTRO.body).toContain('10 km');
    expect(LOCATION_INTRO.body).toContain('never sent to Claude');
    expect(MATCH_WEATHER_TEXT.dataNotice).toContain('never your location');
    expect(WEATHER_SETTINGS_TEXT.toggle).toBe('Use local weather');
  });
});
