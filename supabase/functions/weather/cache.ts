/**
 * The weather function's in-memory cache (Gate 3 slice 5a). BEST EFFORT,
 * like the rate limiter: it lives in one function instance (isolate), which
 * the platform starts and stops as it likes. An answer is reused within the
 * same clock hour (UTC) for the same rounded position or city, so a burst of
 * requests from one place costs Open-Meteo one call an hour per instance.
 *
 * Keys hold the rounded position or the normalized city, in memory only:
 * never written anywhere, never logged, and gone within the hour (or when
 * the instance stops). At most `maxEntries`; the oldest goes first.
 */
import type { WeatherRequest } from '../_shared/weather-contract.ts';

export const WEATHER_CACHE_MAX_ENTRIES = 256;
const HOUR_MS = 3_600_000;

/** The cache key for a validated request: the rounded position, or the city in lowercase. */
export function weatherCacheKey(request: WeatherRequest): string {
  return 'city' in request ? `city:${request.city.toLowerCase()}` : `pos:${request.lat},${request.lon}`;
}

export class HourlyCache<T> {
  private readonly entries = new Map<string, { hour: number; value: T }>();

  constructor(private readonly maxEntries: number = WEATHER_CACHE_MAX_ENTRIES) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error('maxEntries must be a positive integer');
  }

  get size(): number {
    return this.entries.size;
  }

  /** The value stored for `key` in the clock hour of `now` (milliseconds), else undefined (and a stale entry is dropped). */
  get(key: string, now: number): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.hour !== Math.floor(now / HOUR_MS)) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Stores `value` for the clock hour of `now`, dropping the oldest entries past the cap. */
  set(key: string, value: T, now: number): void {
    this.entries.delete(key);
    this.entries.set(key, { hour: Math.floor(now / HOUR_MS), value });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
