import { createContext, useContext, type ReactNode } from 'react';

import type { ColorScheme } from '@/theme';

const ThemeOverrideContext = createContext<ColorScheme | null>(null);

/**
 * Renders its children in a fixed color scheme: `useTheme()` inside returns
 * that scheme's theme. Only the app's own colors change; the saved Appearance
 * setting, the navigation theme, the status bar and native UI are untouched.
 * Used by the dev component gallery to preview the other scheme.
 */
export function ThemeOverride({ scheme, children }: { scheme: ColorScheme | null; children: ReactNode }) {
  return <ThemeOverrideContext.Provider value={scheme}>{children}</ThemeOverrideContext.Provider>;
}

/** The scheme forced by the nearest `ThemeOverride`, or null. */
export function useThemeOverride(): ColorScheme | null {
  return useContext(ThemeOverrideContext);
}
