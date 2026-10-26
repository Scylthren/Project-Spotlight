/**
 * Open-Meteo's daily `weather_code` (a WMO 4677 code, the subset Open-Meteo
 * uses) to the fixed `conditions` and optional `intensity` of the
 * generate-outfits `WeatherSummary` (Gate 3 slice 5a; 2026-10-26 decision).
 * The same table is in `docs/api/weather.md`; a test keeps them in step.
 *
 * Choices:
 * - 1 (mainly clear) counts as `partly-cloudy`, with 2.
 * - Freezing drizzle and freezing rain stay drizzle and rain (the low
 *   temperature already says it is freezing): 56 light, 57 heavy (dense);
 *   66 light, 67 heavy.
 * - Showers are rain or snow: 80/81/82 rain light/moderate/heavy (slight,
 *   moderate, violent); 85/86 snow light/heavy.
 * - No intensity where the code gives none: 0-3, 45, 48, 77 (snow grains),
 *   95 (thunderstorm, slight or moderate) and 96 (with slight hail); 99
 *   (with heavy hail) is a heavy thunderstorm.
 * - Any other code (Open-Meteo documents none) is `cloudy`, no intensity.
 *
 * Plain TypeScript with no Deno APIs, so Jest tests it through the app.
 */
import type { WeatherCondition, WeatherIntensity } from '../_shared/generate-outfits-contract.ts';

export interface WmoMapping {
  conditions: WeatherCondition;
  intensity?: WeatherIntensity;
}

/** Every code Open-Meteo documents, in order. */
export const WMO_TABLE: Readonly<Record<number, WmoMapping>> = {
  0: { conditions: 'clear' },
  1: { conditions: 'partly-cloudy' },
  2: { conditions: 'partly-cloudy' },
  3: { conditions: 'cloudy' },
  45: { conditions: 'fog' },
  48: { conditions: 'fog' },
  51: { conditions: 'drizzle', intensity: 'light' },
  53: { conditions: 'drizzle', intensity: 'moderate' },
  55: { conditions: 'drizzle', intensity: 'heavy' },
  56: { conditions: 'drizzle', intensity: 'light' },
  57: { conditions: 'drizzle', intensity: 'heavy' },
  61: { conditions: 'rain', intensity: 'light' },
  63: { conditions: 'rain', intensity: 'moderate' },
  65: { conditions: 'rain', intensity: 'heavy' },
  66: { conditions: 'rain', intensity: 'light' },
  67: { conditions: 'rain', intensity: 'heavy' },
  71: { conditions: 'snow', intensity: 'light' },
  73: { conditions: 'snow', intensity: 'moderate' },
  75: { conditions: 'snow', intensity: 'heavy' },
  77: { conditions: 'snow' },
  80: { conditions: 'rain', intensity: 'light' },
  81: { conditions: 'rain', intensity: 'moderate' },
  82: { conditions: 'rain', intensity: 'heavy' },
  85: { conditions: 'snow', intensity: 'light' },
  86: { conditions: 'snow', intensity: 'heavy' },
  95: { conditions: 'thunderstorm' },
  96: { conditions: 'thunderstorm' },
  99: { conditions: 'thunderstorm', intensity: 'heavy' },
};

/** The fallback for a code not in the table. */
export const WMO_UNKNOWN: WmoMapping = { conditions: 'cloudy' };

/** Maps one code; a fresh object each time (callers may spread it). */
export function mapWmoCode(code: number): WmoMapping {
  const found = Object.prototype.hasOwnProperty.call(WMO_TABLE, code) ? WMO_TABLE[code] : WMO_UNKNOWN;
  return found.intensity ? { conditions: found.conditions, intensity: found.intensity } : { conditions: found.conditions };
}
