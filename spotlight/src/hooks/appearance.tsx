import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { Appearance } from 'react-native';

import {
  nativeColorSchemeOverride,
  resolveAppearance,
  type AppearancePreference,
} from '@/core/appearance';
import { APPEARANCE_LOAD_TIMEOUT_MS, type AppearanceSettings } from '@/data/appearance-settings';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { ColorScheme } from '@/theme';

export interface AppearanceValue {
  preference: AppearancePreference;
  /** The theme in use: the preference resolved against the system scheme. */
  scheme: ColorScheme;
  setPreference(preference: AppearancePreference): void;
}

const AppearanceContext = createContext<AppearanceValue | null>(null);

/** Reads the settings' state; re-renders on change. */
export function useAppearanceState(settings: AppearanceSettings) {
  return useSyncExternalStore(settings.subscribe, settings.getSnapshot, settings.getSnapshot);
}

/**
 * Starts reading the saved preference and returns true once the app may
 * render with it (read, failed, or `APPEARANCE_LOAD_TIMEOUT_MS` passed), so
 * the root layout can keep the splash up meanwhile instead of flashing the
 * wrong theme.
 */
export function useAppearanceReady(settings: AppearanceSettings): boolean {
  const { ready } = useAppearanceState(settings);
  useEffect(() => {
    void settings.load();
    const timer = setTimeout(settings.stopWaiting, APPEARANCE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [settings]);
  return ready;
}

/**
 * Provides the Appearance setting to `useTheme()` and `useAppearance()`, and
 * mirrors it to React Native's `Appearance` override so native UI (alerts,
 * keyboards, the tab bar material) matches. Where the platform has no
 * override (web), only the app's own colors follow the setting.
 */
export function AppearanceProvider({
  settings,
  children,
}: {
  settings: AppearanceSettings;
  children: ReactNode;
}) {
  const { preference } = useAppearanceState(settings);
  const system = useColorScheme();
  const scheme = resolveAppearance(preference, system);

  useLayoutEffect(() => {
    if (typeof Appearance.setColorScheme === 'function') {
      Appearance.setColorScheme(nativeColorSchemeOverride(preference));
    }
  }, [preference]);

  const value = useMemo<AppearanceValue>(
    () => ({ preference, scheme, setPreference: (p) => void settings.setPreference(p) }),
    [preference, scheme, settings],
  );
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

/** The Appearance setting, or null outside `AppearanceProvider`. */
export function useOptionalAppearance(): AppearanceValue | null {
  return useContext(AppearanceContext);
}

export function useAppearance(): AppearanceValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance must be used inside AppearanceProvider.');
  return value;
}
