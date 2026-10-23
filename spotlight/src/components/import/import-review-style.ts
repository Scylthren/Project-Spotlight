import type { TextStyle, ViewStyle } from 'react-native';

import type { Theme } from '@/theme';

/**
 * The import review list (Gate 2 slice 6). There is no mockup; it follows
 * the design language: square photo tiles on the photo background, a serif
 * name, tracked uppercase labels, hairline rules between rows, captions in
 * the secondary body color, and anything that needs the user's attention
 * in `danger` (the accent red), always as text, never color alone.
 */
export function importReviewLook(theme: Theme) {
  const { colors, borders, sizes, spacing, typography } = theme;
  return {
    screen: { flex: 1, backgroundColor: colors.background } satisfies ViewStyle,
    /** The list's padding; rows are full width with rules between. */
    list: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxl } satisfies ViewStyle,
    intro: { paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm } satisfies ViewStyle,
    /** A notice about photos left out, or the last save's outcome: 1 pt ink box like the form's panels. */
    notice: {
      borderWidth: borders.hairline,
      borderColor: colors.text,
      padding: spacing.md,
      gap: spacing.xs,
    } satisfies ViewStyle,
    noticeText: { ...typography.bodySmall, color: colors.text } satisfies TextStyle,
    caption: { ...typography.bodySmall, color: colors.textBodySecondary } satisfies TextStyle,
    /** A row: the photo and text (one button), then its actions, then a hairline rule. */
    row: (first: boolean): ViewStyle => ({
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.hairline,
      ...(first ? { borderTopWidth: borders.hairline, borderTopColor: colors.hairline } : {}),
    }),
    rowButton: (pressed: boolean): ViewStyle => ({
      flexDirection: 'row',
      gap: spacing.lg,
      paddingTop: spacing.lg,
      backgroundColor: pressed ? colors.surface : colors.background,
    }),
    thumbnail: {
      width: sizes.importThumbnailWidth,
      height: sizes.importThumbnailHeight,
      backgroundColor: colors.photoBackground,
      overflow: 'hidden',
    } satisfies ViewStyle,
    thumbnailImage: { flex: 1 } satisfies ViewStyle,
    body: { flex: 1, gap: spacing.xs } satisfies ViewStyle,
    position: { ...typography.label, color: colors.textSecondary } satisfies TextStyle,
    title: { ...typography.itemNameSmall, color: colors.text } satisfies TextStyle,
    titleMissing: { ...typography.itemNameSmall, color: colors.textSecondary } satisfies TextStyle,
    details: { ...typography.bodySmall, color: colors.textBodySecondary } satisfies TextStyle,
    colorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs } satisfies ViewStyle,
    colorNames: { ...typography.caption, color: colors.textBodySecondary, flexShrink: 1 } satisfies TextStyle,
    status: { ...typography.caption, color: colors.textSecondary } satisfies TextStyle,
    attention: { ...typography.caption, fontFamily: theme.fonts.sans.semiBold, color: colors.danger } satisfies TextStyle,
    /** "Edit" and "Remove", lined up with the text column. */
    rowActions: {
      flexDirection: 'row',
      gap: spacing.lg,
      paddingLeft: sizes.importThumbnailWidth + spacing.lg,
      paddingBottom: spacing.sm,
    } satisfies ViewStyle,
    /** The bar pinned under the list: summary, Save, Discard. */
    footer: {
      borderTopWidth: borders.hairline,
      borderTopColor: colors.text,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.md,
      gap: spacing.sm,
    } satisfies ViewStyle,
    swatchSize: sizes.importSwatchSize,
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xxl,
      gap: spacing.lg,
      backgroundColor: colors.background,
    } satisfies ViewStyle,
    emptyText: { ...typography.bodyLarge, color: colors.textSecondary, textAlign: 'center' } satisfies TextStyle,
  };
}
