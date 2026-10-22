/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useOptionalAppearance } from '@/hooks/appearance';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { resolveColorScheme, themes, type Theme } from '@/theme';

/**
 * The theme for the Appearance setting (Light, Dark or System). Outside
 * `AppearanceProvider` it follows the system scheme.
 */
export function useTheme(): Theme {
  const appearance = useOptionalAppearance();
  const system = useColorScheme();
  return themes[appearance ? appearance.scheme : resolveColorScheme(system)];
}
