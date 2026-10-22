/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useOptionalAppearance } from '@/hooks/appearance';
import { useThemeOverride } from '@/hooks/theme-override';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { pickColorScheme, themes, type Theme } from '@/theme';

/**
 * The theme for the Appearance setting (Light, Dark or System). Outside
 * `AppearanceProvider` it follows the system scheme. Inside a
 * `ThemeOverride` (the dev gallery) the override wins.
 */
export function useTheme(): Theme {
  const override = useThemeOverride();
  const appearance = useOptionalAppearance();
  const system = useColorScheme();
  return themes[pickColorScheme({ override, appearance: appearance?.scheme ?? null, system })];
}
