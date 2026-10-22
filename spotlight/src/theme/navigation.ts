import type { Theme as NavigationTheme } from 'expo-router';

import type { Theme } from './index';

/**
 * React Navigation's theme (headers, screen backgrounds) built from our
 * tokens. Each font weight is its own family on native, so every entry uses
 * `fontWeight: 'normal'` and picks the face by family name.
 */
export function navigationTheme(theme: Theme): NavigationTheme {
  const { colors, fonts } = theme;
  return {
    dark: theme.scheme === 'dark',
    colors: {
      primary: colors.accent,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.hairline,
      notification: colors.accent,
    },
    fonts: {
      regular: { fontFamily: fonts.sans.regular, fontWeight: 'normal' },
      medium: { fontFamily: fonts.sans.medium, fontWeight: 'normal' },
      bold: { fontFamily: fonts.sans.semiBold, fontWeight: 'normal' },
      heavy: { fontFamily: fonts.sans.bold, fontWeight: 'normal' },
    },
  };
}

/** The status bar text color that reads on the theme background. */
export function statusBarStyle(theme: Theme): 'light' | 'dark' {
  return theme.scheme === 'dark' ? 'light' : 'dark';
}

/**
 * Native tab bar look from the mockup's bar: theme background, a 1 pt ink
 * rule on top, ink icons and labels, the accent for the current tab. Labels
 * use the tab label face and size; native tabs cannot set letter spacing or
 * text transform, so the labels themselves are written in uppercase.
 */
export function tabBarAppearance(theme: Theme) {
  const { colors, fonts, typography } = theme;
  const label = { fontFamily: typography.tabLabel.fontFamily, fontSize: typography.tabLabel.fontSize };
  return {
    backgroundColor: colors.background,
    /** iOS: the hairline above the bar. */
    shadowColor: colors.text,
    iconColor: { default: colors.text, selected: colors.accent },
    labelStyle: {
      default: { ...label, color: colors.text },
      selected: { ...label, fontFamily: fonts.sans.bold, color: colors.accent },
    },
    /** Android: ripple on press. */
    rippleColor: colors.surface,
  };
}
