import { darkColors, lightColors, type ThemeColors } from './colors';
import { borders, opacity, sizes, spacing } from './layout';
import type { ColorScheme } from './scheme';
import { fonts, typography } from './typography';

export * from './colors';
export * from './contrast';
export * from './layout';
export * from './scheme';
export * from './typography';

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  fonts: typeof fonts;
  typography: typeof typography;
  spacing: typeof spacing;
  borders: typeof borders;
  sizes: typeof sizes;
  opacity: typeof opacity;
}

function makeTheme(scheme: ColorScheme, colors: ThemeColors): Theme {
  return { scheme, colors, fonts, typography, spacing, borders, sizes, opacity };
}

export const themes: Record<ColorScheme, Theme> = {
  light: makeTheme('light', lightColors),
  dark: makeTheme('dark', darkColors),
};
