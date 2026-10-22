import type { TextStyle, ViewStyle } from 'react-native';

import type { Theme } from '@/theme';

/** Grid columns (ColorMatrix.dc.html: five swatches per row). */
export const COLOR_MATRIX_COLUMNS = 5;

/**
 * The color matrix sheet (ColorMatrix.dc.html): serif title, help in the
 * secondary body color, the chosen colors as rows between hairlines, a
 * five-column grid of 46 pt circles with names, and "Done" pinned at the
 * bottom. A selected swatch gets a 2 pt ink ring 3 pt outside the circle.
 */
export function colorMatrixLook(theme: Theme) {
  const { colors, borders, fonts, opacity, sizes, spacing, typography } = theme;
  const ringGap = spacing.xxs + 1;
  return {
    fill: { flex: 1, backgroundColor: colors.background } satisfies ViewStyle,
    content: { paddingHorizontal: sizes.screenPadding, paddingTop: spacing.xxl, paddingBottom: spacing.xxl, gap: spacing.lg } satisfies ViewStyle,
    title: { ...typography.headline, fontFamily: fonts.serif.semiBold, color: colors.text } satisfies TextStyle,
    notice: { ...typography.bodySmall, fontFamily: fonts.sans.semiBold, color: colors.text } satisfies TextStyle,
    help: { ...typography.bodySmall, color: colors.textBodySecondary } satisfies TextStyle,
    error: { ...typography.bodySmall, color: colors.danger } satisfies TextStyle,
    grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md } satisfies ViewStyle,
    cell: ({ pressed, disabled }: { pressed: boolean; disabled: boolean }): ViewStyle => ({
      width: `${100 / COLOR_MATRIX_COLUMNS}%`,
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.xxs,
      opacity: disabled ? opacity.disabled : pressed ? opacity.pressed : 1,
    }),
    /** Keeps the same size selected or not, so the grid doesn't shift. */
    ring: (selected: boolean): ViewStyle => ({
      padding: ringGap,
      borderRadius: borders.radius.round,
      borderWidth: borders.masthead,
      borderColor: selected ? colors.text : colors.background,
    }),
    cellName: (selected: boolean): TextStyle => ({
      ...typography.caption,
      fontFamily: selected ? fonts.sans.bold : fonts.sans.regular,
      color: colors.text,
      textAlign: 'center',
    }),
    badge: (primary: boolean): TextStyle => ({
      ...typography.caption,
      fontFamily: fonts.sans.semiBold,
      color: primary ? colors.text : colors.textSecondary,
      textAlign: 'center',
    }),
    selectedList: { gap: spacing.sm } satisfies ViewStyle,
    selectedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.hairline,
    } satisfies ViewStyle,
    selectedName: { ...typography.body, fontFamily: fonts.sans.semiBold, color: colors.text, flex: 1 } satisfies TextStyle,
    selectedRank: { ...typography.body, color: colors.textSecondary } satisfies TextStyle,
    footer: {
      paddingHorizontal: sizes.screenPadding,
      paddingTop: spacing.lg,
      paddingBottom: spacing.lg,
      borderTopWidth: borders.hairline,
      borderTopColor: colors.hairline,
    } satisfies ViewStyle,
  };
}
