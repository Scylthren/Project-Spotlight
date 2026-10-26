/**
 * Whether to show the location intro before "Match today's weather" (Gate 3
 * slice 5a), like the camera intro: our own short explanation, whose one
 * button triggers the real system prompt. Shown at most once per app
 * session (module lifetime):
 * - permission undetermined (never asked): show it;
 * - denied, but the OS can still ask (Android after one refusal), and no
 *   home city to fall back on: show it;
 * - otherwise (granted, denied for good, or a home city covers it): don't.
 * "Use local weather" off: never (no location at all).
 */
import type { LocationPermission, LocationProvider } from './location-provider';
import type { WeatherSettings } from './weather-settings';

export function locationIntroNeeded(permission: LocationPermission, settings: WeatherSettings): boolean {
  if (!settings.useLocalWeather) return false;
  if (permission.status === 'undetermined') return true;
  return permission.status === 'denied' && permission.canAskAgain && !settings.homeCity;
}

export class LocationIntroGate {
  private shown = false;

  constructor(private readonly location: LocationProvider) {}

  /** True (and remembered for the session) when the intro should show now. */
  async shouldShow(settings: WeatherSettings): Promise<boolean> {
    if (this.shown) return false;
    const needed = locationIntroNeeded(await this.location.permission(), settings);
    if (needed) this.shown = true;
    return needed;
  }

  /** The intro's "Allow location" button: the real system prompt. */
  allow(): Promise<LocationPermission> {
    return this.location.requestPermission();
  }
}
