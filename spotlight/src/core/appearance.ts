import { resolveColorScheme, type ColorScheme } from '@/theme/scheme';

/**
 * The Appearance setting (Profile mockup): a fixed light or dark theme, or
 * follow the system. The default, and the fallback for anything unreadable,
 * is `'system'`.
 */
export const APPEARANCE_PREFERENCES = ['light', 'dark', 'system'] as const;

export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number];

export const DEFAULT_APPEARANCE: AppearancePreference = 'system';

/** Labels in the order the control shows them. */
export const APPEARANCE_LABELS: Record<AppearancePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return typeof value === 'string' && (APPEARANCE_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Reads a stored value. Exact matches only: anything else (missing, empty,
 * different case, a value from a future version) means `'system'`.
 */
export function parseAppearancePreference(stored: unknown): AppearancePreference {
  return isAppearancePreference(stored) ? stored : DEFAULT_APPEARANCE;
}

/**
 * The theme to show. `systemReported` is what the platform reports
 * (`useColorScheme()`); it only matters for `'system'`, and is mapped the
 * same way as everywhere else (`resolveColorScheme`: anything but dark is light).
 */
export function resolveAppearance(
  preference: AppearancePreference,
  systemReported: string | null | undefined,
): ColorScheme {
  return preference === 'system' ? resolveColorScheme(systemReported) : preference;
}

/**
 * The value for React Native's `Appearance.setColorScheme`, so native UI
 * (alerts, keyboards, the native tab bar material) matches the app.
 * `'unspecified'` removes the override and follows the system again.
 */
export function nativeColorSchemeOverride(
  preference: AppearancePreference,
): 'light' | 'dark' | 'unspecified' {
  return preference === 'system' ? 'unspecified' : preference;
}
