/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useColorScheme } from '@/hooks/use-color-scheme';
import { resolveColorScheme, themes, type Theme } from '@/theme';

/** The theme for the system color scheme. Slice 2 adds the in-app Appearance setting. */
export function useTheme(): Theme {
  return themes[resolveColorScheme(useColorScheme())];
}
