import type { TextStyle, ViewStyle } from 'react-native';

import type { Theme } from '@/theme';

/** A thumbs up/down button: 44 pt square, ink outline; selected is ink-filled with a paper glyph. */
export function ratingButtonLook(theme: Theme, { selected, pressed }: { selected: boolean; pressed: boolean }) {
  const { colors, borders, sizes } = theme;
  const fill = selected ? (pressed ? colors.textBodySecondary : colors.text) : pressed ? colors.surface : colors.background;
  return {
    container: {
      width: sizes.minTouchTarget,
      height: sizes.minTouchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: borders.hairline,
      borderColor: selected ? fill : colors.text,
      borderRadius: borders.radius.none,
      backgroundColor: fill,
    } satisfies ViewStyle,
    iconColor: selected ? colors.background : colors.text,
    fill,
  };
}

/** The rating and occasion controls under a look. */
export function lookActionsLook(theme: Theme) {
  const { colors, spacing, typography } = theme;
  return {
    actions: { flexDirection: 'row', gap: spacing.sm } satisfies ViewStyle,
    action: { flex: 1 } satisfies ViewStyle,
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm } satisfies ViewStyle,
    ratingLabel: { ...typography.label, color: colors.text, marginRight: 'auto' } satisfies TextStyle,
    occasionBlock: { gap: spacing.sm } satisfies ViewStyle,
    occasionLabel: { ...typography.label, color: colors.text } satisfies TextStyle,
    occasionHint: { ...typography.caption, color: colors.textSecondary } satisfies TextStyle,
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm } satisfies ViewStyle,
    error: { ...typography.caption, color: colors.danger } satisfies TextStyle,
  };
}

/** The Lookbook (Lookbook.dc.html): masthead, filter chips, one row per look. */
export function lookbookLook(theme: Theme) {
  const { colors, spacing, typography, borders, sizes } = theme;
  return {
    top: { paddingHorizontal: sizes.screenPadding, paddingTop: spacing.xxl + spacing.xs, gap: spacing.md } satisfies ViewStyle,
    chipsScroll: { marginHorizontal: -sizes.screenPadding } satisfies ViewStyle,
    chipsContent: { paddingHorizontal: sizes.screenPadding, paddingVertical: spacing.xs, gap: spacing.sm } satisfies ViewStyle,
    list: { paddingHorizontal: sizes.screenPadding, paddingTop: spacing.lg } satisfies ViewStyle,
    row: (pressed: boolean): ViewStyle => ({
      minHeight: sizes.minTouchTarget,
      gap: spacing.sm,
      paddingVertical: spacing.md,
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.hairline,
      opacity: pressed ? theme.opacity.pressed : 1,
    }),
    photos: { flexDirection: 'row', gap: spacing.xs } satisfies ViewStyle,
    photo: {
      width: sizes.lookbookPhotoWidth,
      height: sizes.lookbookPhotoHeight,
      backgroundColor: colors.photoBackground,
      overflow: 'hidden',
    } satisfies ViewStyle,
    request: { ...typography.lookbookRequest, color: colors.text } satisfies TextStyle,
    meta: { ...typography.caption, color: colors.textSecondary } satisfies TextStyle,
    message: { ...typography.body, color: colors.textBodySecondary } satisfies TextStyle,
    empty: { paddingTop: spacing.xxxl, gap: spacing.md } satisfies ViewStyle,
    emptyTitle: { ...typography.itemName, color: colors.text } satisfies TextStyle,
    spinnerColor: colors.text,
  };
}

/** A saved look's own screen: header, photos, pieces line, rationale, controls, delete. */
export function savedLookLook(theme: Theme) {
  const { colors, spacing, typography, sizes } = theme;
  return {
    body: { paddingHorizontal: sizes.screenPadding, paddingTop: spacing.lg, gap: spacing.md } satisfies ViewStyle,
    deleteBlock: { paddingTop: spacing.xl } satisfies ViewStyle,
    message: { ...typography.body, color: colors.textBodySecondary } satisfies TextStyle,
    state: { paddingTop: spacing.xxxl, gap: spacing.md, paddingHorizontal: sizes.screenPadding } satisfies ViewStyle,
    spinnerColor: colors.text,
  };
}
