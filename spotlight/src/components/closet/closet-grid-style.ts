import type { TextStyle, ViewStyle } from 'react-native';

import type { Theme } from '@/theme';

/** Closet.dc.html: two columns, 12 pt apart, rows 18 pt apart. */
export const CLOSET_COLUMNS = 2;

export interface ClosetGridLook {
  content: ViewStyle;
  row: ViewStyle;
  cell: ViewStyle;
  photo: ViewStyle;
  name: TextStyle;
  meta: TextStyle;
  message: TextStyle;
}

/** The width of one column, so a lone tile in the last row keeps the same width. */
export function closetCellWidth(theme: Theme, windowWidth: number): number {
  const { sizes, spacing } = theme;
  const content = Math.min(windowWidth, sizes.maxContentWidth) - 2 * sizes.screenPadding;
  return Math.max(0, Math.floor((content - spacing.md * (CLOSET_COLUMNS - 1)) / CLOSET_COLUMNS));
}

/**
 * Tiles alternate the two photo backgrounds in a checkerboard so neighbours
 * stay apart (the mockup mixes them the same way).
 */
export function closetTileBackground(theme: Theme, index: number): string {
  const row = Math.floor(index / CLOSET_COLUMNS);
  const column = index % CLOSET_COLUMNS;
  return (row + column) % 2 === 0 ? theme.colors.photoBackground : theme.colors.photoBackgroundAlt;
}

export function closetGridLook(theme: Theme, { pressed }: { pressed: boolean } = { pressed: false }): ClosetGridLook {
  const { colors, sizes, spacing, typography } = theme;
  return {
    content: {
      paddingHorizontal: sizes.screenPadding,
      paddingTop: spacing.lg,
      paddingBottom: sizes.bottomTabInset + spacing.xl,
      rowGap: spacing.lg + spacing.xxs,
    },
    row: { gap: spacing.md },
    cell: { gap: spacing.xs + spacing.xxs, opacity: pressed ? theme.opacity.pressed : 1 },
    photo: { height: sizes.closetTileHeight, overflow: 'hidden' },
    name: { ...typography.itemNameSmall, color: colors.text },
    meta: { ...typography.caption, color: colors.textSecondary },
    message: { ...typography.bodyLarge, color: colors.textSecondary, textAlign: 'center' },
  };
}
