/**
 * The phone's position for weather (Gate 3 decision D8): foreground ("while
 * using the app") permission only, and a position that is already rounded
 * to 0.1 degree (about 11 km) when it leaves the provider. Callers never see
 * a precise position, so nothing precise can be sent, stored or logged.
 *
 * Implementations: `MockLocationProvider` (configurable, for tests and
 * layout work) and `ExpoLocationProvider` (expo-location).
 */
import { roundPosition, type WeatherByPosition } from '@/ai/weather-contract';

export type LocationPermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface LocationPermission {
  status: LocationPermissionStatus;
  /** False once only the system Settings app can grant access. */
  canAskAgain: boolean;
}

/** Why there is no position: no permission, location services off, or no fix (none in time and none recent). */
export type LocationProblem = 'not-allowed' | 'services-off' | 'unavailable';

export type PositionOutcome =
  | {
      ok: true;
      /** Rounded to 0.1 degree. */
      position: WeatherByPosition;
      /** A fresh fix, or the last known one (no fix in time). */
      source: 'current' | 'last-known';
    }
  | { ok: false; problem: LocationProblem };

export interface PositionOptions {
  /** How long to wait for a fresh fix before falling back to the last known position. */
  timeoutMs?: number;
}

/** Never rejects: a failed check or request resolves to a best guess. */
export interface LocationProvider {
  /** Current permission, without prompting. */
  permission(): Promise<LocationPermission>;
  /** Shows the system prompt if the OS still can; resolves to the result. */
  requestPermission(): Promise<LocationPermission>;
  /** Today's rounded position. Never prompts: without permission it is `not-allowed`. */
  currentPosition(options?: PositionOptions): Promise<PositionOutcome>;
}

/** Wait this long for a fresh fix (coarse accuracy is usually quicker). */
export const DEFAULT_POSITION_TIMEOUT_MS = 8_000;

/** Rounds a raw fix for leaving the provider; `unavailable` when it is not a real position. */
export function roundedOutcome(lat: number, lon: number, source: 'current' | 'last-known'): PositionOutcome {
  const position = roundPosition(lat, lon);
  return position ? { ok: true, position, source } : { ok: false, problem: 'unavailable' };
}

/**
 * Configurable `LocationProvider`. `fix` is a raw position (rounded on the
 * way out, like the real one) or a problem. `requestPermission` takes the
 * next queued answer, stores it as `current`, and returns it; with an empty
 * queue it grants when the OS could still ask.
 */
export class MockLocationProvider implements LocationProvider {
  current: LocationPermission;
  fix: { lat: number; lon: number; source?: 'current' | 'last-known' } | LocationProblem;
  readonly requests: LocationPermission[] = [];
  requestCalls = 0;
  positionCalls = 0;

  constructor(
    current: LocationPermission = { status: 'granted', canAskAgain: true },
    fix: MockLocationProvider['fix'] = { lat: 51.50735, lon: -0.12776 },
  ) {
    this.current = current;
    this.fix = fix;
  }

  async permission(): Promise<LocationPermission> {
    return { ...this.current };
  }

  async requestPermission(): Promise<LocationPermission> {
    this.requestCalls++;
    const next = this.requests.shift();
    if (next) this.current = next;
    else if (this.current.status !== 'granted' && this.current.canAskAgain) this.current = { status: 'granted', canAskAgain: true };
    return { ...this.current };
  }

  async currentPosition(): Promise<PositionOutcome> {
    this.positionCalls++;
    if (this.current.status !== 'granted') return { ok: false, problem: 'not-allowed' };
    if (typeof this.fix === 'string') return { ok: false, problem: this.fix };
    return roundedOutcome(this.fix.lat, this.fix.lon, this.fix.source ?? 'current');
  }
}
