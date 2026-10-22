import { Platform } from 'react-native';

/** Spacing scale in points. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  jumbo: 64,
} as const;

/** Rules and corners. Square corners everywhere except swatches and avatars. */
export const borders = {
  /** 1 pt rules and outlines. */
  hairline: 1,
  /** The 2 pt rule under the masthead. */
  masthead: 2,
  radius: {
    none: 0,
    /** For circles (swatches, avatars); clamps to half the side. */
    round: 9999,
  },
} as const;

/** Fixed sizes from the design. */
export const sizes = {
  /** Horizontal screen padding. */
  screenPadding: 20,
  buttonHeight: 52,
  chipHeight: 36,
  /** Minimum touch target; smaller elements get hit slop up to this. */
  minTouchTarget: 44,
  maxContentWidth: 800,
  /** Space the native tab bar covers at the bottom of a scrolling screen. */
  bottomTabInset: Platform.select({ ios: 50, android: 80 }) ?? 0,
} as const;
