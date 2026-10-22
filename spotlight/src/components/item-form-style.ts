import type { TextStyle, ViewStyle } from 'react-native';

import type { Theme } from '@/theme';

/**
 * Shared look of the Add/Edit form (SaveItem.dc.html, Angles.dc.html):
 * sections 24 pt apart, each a tracked label over its controls 8 pt below,
 * captions in the secondary body color, errors in `danger`.
 */
export function itemFormLook(theme: Theme) {
  const { colors, spacing, typography, sizes } = theme;
  return {
    /** The form's content: screen padding and the gap between sections. */
    body: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xl, gap: spacing.xxl } satisfies ViewStyle,
    /** One section: label, then its controls. */
    section: { gap: spacing.sm } satisfies ViewStyle,
    /** A label row with a note on the right ("Colors ... Detected from the photo"). */
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: spacing.md,
    } satisfies ViewStyle,
    /** The italic serif note beside a label. */
    note: { ...typography.styleTag, color: colors.textSecondary, flexShrink: 1, textAlign: 'right' } satisfies TextStyle,
    caption: { ...typography.bodySmall, color: colors.textBodySecondary } satisfies TextStyle,
    error: { ...typography.bodySmall, color: colors.danger } satisfies TextStyle,
    /** Wrapping rows of chips. */
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm } satisfies ViewStyle,
    /** Stacked full-width buttons. */
    buttons: { gap: spacing.sm } satisfies ViewStyle,
    /** A row of text buttons, left-aligned. */
    textButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg } satisfies ViewStyle,
    /** A boxed panel inside the form (adding an angle, camera access off): 1 pt ink outline. */
    panel: {
      borderWidth: theme.borders.hairline,
      borderColor: colors.text,
      padding: spacing.lg,
      gap: spacing.md,
    } satisfies ViewStyle,
    screenPadding: sizes.screenPadding,
  };
}

/** The form's photo area and angle tiles (Angles.dc.html). */
export function photoSetLook(theme: Theme) {
  const { colors, borders, sizes, spacing, typography } = theme;
  return {
    preview: {
      height: sizes.formPhotoHeight,
      backgroundColor: colors.photoBackground,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    } satisfies ViewStyle,
    previewImage: { width: '100%', height: '100%' } satisfies ViewStyle,
    emptyHint: {
      ...typography.bodySmall,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: spacing.xxl,
    } satisfies TextStyle,
    /** "Front · Primary" on the photo's top-left corner. */
    badge: {
      position: 'absolute',
      left: spacing.md,
      top: spacing.md,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    } satisfies ViewStyle,
    badgeText: { ...typography.label, color: colors.text } satisfies TextStyle,
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + spacing.xxs } satisfies ViewStyle,
    tileGap: spacing.sm + spacing.xxs,
    tileColumns: 3,
    tile: { gap: spacing.xs + spacing.xxs } satisfies ViewStyle,
    /** A thumbnail; the selected one has a 2 pt ink outline. */
    thumbnail: (selected: boolean): ViewStyle => ({
      height: sizes.angleTileHeight,
      backgroundColor: colors.photoBackground,
      overflow: 'hidden',
      borderWidth: selected ? borders.masthead : 0,
      borderColor: colors.text,
    }),
    thumbnailImage: { flex: 1 } satisfies ViewStyle,
    tileLabel: { ...typography.label, color: colors.text } satisfies TextStyle,
    tileNote: { ...typography.caption, color: colors.textSecondary } satisfies TextStyle,
    /** The dashed "Add another angle" tile. */
    addTile: (pressed: boolean): ViewStyle => ({
      height: sizes.angleTileHeight,
      borderWidth: borders.hairline,
      borderStyle: 'dashed',
      borderColor: colors.text,
      backgroundColor: pressed ? colors.surface : colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.xs,
    }),
    addTilePlus: { ...typography.itemName, color: colors.text } satisfies TextStyle,
    addTileText: {
      ...typography.caption,
      fontFamily: theme.fonts.sans.semiBold,
      color: colors.text,
      textAlign: 'center',
    } satisfies TextStyle,
  };
}

/** Width of one angle tile in a row `rowWidth` wide (three columns). */
export function angleTileWidth(theme: Theme, rowWidth: number): number {
  const { tileColumns, tileGap } = photoSetLook(theme);
  return Math.max(0, Math.floor((rowWidth - tileGap * (tileColumns - 1)) / tileColumns));
}
