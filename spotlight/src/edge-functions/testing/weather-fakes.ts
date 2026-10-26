/**
 * Fake Open-Meteo answers for the weather function tests. No network.
 */
import { fakeResponse } from './model-fakes';

/** A forecast body as Open-Meteo sends it (one day): light rain, 14.4 / 7.6 °C, 60 %, 21.7 km/h. */
export function forecastBody(overrides: Record<string, unknown[]> = {}) {
  return {
    latitude: 51.5,
    longitude: -0.10000038,
    timezone: 'Europe/London',
    daily_units: { temperature_2m_max: '°C', wind_speed_10m_max: 'km/h', precipitation_probability_max: '%' },
    daily: {
      time: ['2026-10-26'],
      weather_code: [61],
      temperature_2m_max: [14.4],
      temperature_2m_min: [7.6],
      precipitation_probability_max: [60],
      wind_speed_10m_max: [21.7],
      ...overrides,
    },
  };
}

/** A geocoding body with one match (London), or none. */
export function geocodingBody(found = true) {
  return found
    ? { results: [{ id: 2643743, name: 'London', latitude: 51.50853, longitude: -0.12574, country: 'United Kingdom', admin1: 'England' }] }
    : { generationtime_ms: 0.4 };
}

/** A fake fetch that answers geocoding and forecast URLs from the given bodies, recording every URL. */
export function openMeteoFetch({
  forecast = () => fakeResponse(200, JSON.stringify(forecastBody())),
  geocoding = () => fakeResponse(200, JSON.stringify(geocodingBody())),
}: { forecast?: () => Response | Promise<Response>; geocoding?: () => Response | Promise<Response> } = {}) {
  const urls: string[] = [];
  const fetchMock = jest.fn(async (input: unknown) => {
    const url = String(input);
    urls.push(url);
    if (url.startsWith('https://geocoding-api.open-meteo.com/')) return geocoding();
    if (url.startsWith('https://api.open-meteo.com/')) return forecast();
    throw new Error(`unexpected URL ${url}`);
  });
  return { fetch: fetchMock as unknown as typeof fetch, fetchMock, urls };
}
