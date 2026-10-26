import {
  Accuracy,
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  getLastKnownPositionAsync,
  hasServicesEnabledAsync,
  requestForegroundPermissionsAsync,
  type LocationPermissionResponse,
} from 'expo-location';

import {
  DEFAULT_POSITION_TIMEOUT_MS,
  roundedOutcome,
  type LocationPermission,
  type LocationProvider,
  type PositionOptions,
  type PositionOutcome,
} from './location-provider';

/** A last known position older than this is not today's place. */
export const LAST_KNOWN_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** Maps the OS response; anything unexpected counts as not granted. */
export function toLocationPermission(response: LocationPermissionResponse): LocationPermission {
  const status = response.granted ? 'granted' : response.status === 'undetermined' ? 'undetermined' : 'denied';
  return { status, canAskAgain: response.canAskAgain };
}

/**
 * Real `LocationProvider` with expo-location (SDK 58 names checked against
 * node_modules/expo-location/build/Location.d.ts): foreground permission
 * only, `Accuracy.Low` (about a kilometre; weather needs no more), a fresh
 * fix within the timeout, else the last known one from the past 6 hours,
 * else `unavailable`. Every position is rounded to 0.1 degree before it is
 * returned (`roundedOutcome`); the raw fix never leaves this file.
 *
 * A failed permission check resolves 'undetermined' (the intro and the real
 * prompt then decide); a failed request re-checks, else 'denied'. A failed
 * services check assumes they are on (the fix then decides).
 */
export class ExpoLocationProvider implements LocationProvider {
  async permission(): Promise<LocationPermission> {
    try {
      return toLocationPermission(await getForegroundPermissionsAsync());
    } catch {
      return { status: 'undetermined', canAskAgain: true };
    }
  }

  async requestPermission(): Promise<LocationPermission> {
    try {
      return toLocationPermission(await requestForegroundPermissionsAsync());
    } catch {
      try {
        return toLocationPermission(await getForegroundPermissionsAsync());
      } catch {
        return { status: 'denied', canAskAgain: true };
      }
    }
  }

  async currentPosition({ timeoutMs = DEFAULT_POSITION_TIMEOUT_MS }: PositionOptions = {}): Promise<PositionOutcome> {
    if ((await this.permission()).status !== 'granted') return { ok: false, problem: 'not-allowed' };
    let servicesOn = true;
    try {
      servicesOn = await hasServicesEnabledAsync();
    } catch {
      servicesOn = true;
    }
    if (!servicesOn) return { ok: false, problem: 'services-off' };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const fresh = getCurrentPositionAsync({ accuracy: Accuracy.Low }).catch(() => null);
    try {
      const fix = await Promise.race([fresh, expired]);
      if (fix) return roundedOutcome(fix.coords.latitude, fix.coords.longitude, 'current');
    } finally {
      clearTimeout(timer);
    }
    try {
      const last = await getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
      if (last) return roundedOutcome(last.coords.latitude, last.coords.longitude, 'last-known');
    } catch {
      // No last known position either.
    }
    return { ok: false, problem: 'unavailable' };
  }
}
