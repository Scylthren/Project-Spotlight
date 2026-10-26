import type { TextStyle, ViewStyle } from 'react-native';

import type { Theme } from '@/theme';

/** The Style screen (StylePrompt.dc.html): eyebrow, two-line title, sections, notice, recent rows. */
export function stylePromptLook(theme: Theme) {
  const { colors, spacing, typography, borders, sizes } = theme;
  return {
    body: { paddingHorizontal: sizes.screenPadding, paddingTop: spacing.xxl, gap: spacing.xl } satisfies ViewStyle,
    eyebrow: { ...typography.headerLabel, color: colors.accent } satisfies TextStyle,
    titleItalic: { ...typography.displayItalic, color: colors.text } satisfies TextStyle,
    titleBold: { ...typography.displayBold, color: colors.text } satisfies TextStyle,
    section: { gap: spacing.sm } satisfies ViewStyle,
    sectionLabel: { ...typography.label, color: colors.text } satisfies TextStyle,
    input: {
      ...typography.inputSerif,
      minHeight: sizes.styleRequestMinHeight,
      padding: spacing.md,
      color: colors.text,
      backgroundColor: colors.background,
      borderWidth: borders.hairline,
      borderRadius: borders.radius.none,
      textAlignVertical: 'top',
    } satisfies TextStyle,
    inputBorder: (focused: boolean, error: boolean) => (error ? colors.danger : focused ? colors.text : colors.inputBorder),
    fieldFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md } satisfies ViewStyle,
    fieldError: { ...typography.caption, color: colors.danger, flexShrink: 1 } satisfies TextStyle,
    counter: { ...typography.caption, color: colors.textSecondary, marginLeft: 'auto' } satisfies TextStyle,
    notice: { ...typography.caption, color: colors.textSecondary } satisfies TextStyle,
    weatherOff: {
      gap: spacing.xs,
      paddingTop: spacing.sm,
      borderTopWidth: borders.hairline,
      borderTopColor: colors.hairline,
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.hairline,
      alignItems: 'flex-start',
    } satisfies ViewStyle,
    weatherOffLabel: { ...typography.bodyLarge, color: colors.text } satisfies TextStyle,
    recentRow: (pressed: boolean): ViewStyle => ({
      minHeight: sizes.minTouchTarget,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.xs,
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.hairline,
      backgroundColor: pressed ? colors.surface : colors.background,
    }),
    recentText: { ...typography.recentRequest, color: colors.text, flexShrink: 1 } satisfies TextStyle,
    recentArrow: { ...typography.bodyLarge, color: colors.text } satisfies TextStyle,
  };
}

/** One look on Results (Results.dc.html): number row, photos, pieces line, rationale, Restyle. */
export function lookCardLook(theme: Theme, { first }: { first: boolean }) {
  const { colors, spacing, typography, borders, sizes } = theme;
  return {
    card: { gap: spacing.md } satisfies ViewStyle,
    numberRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.md,
      ...(first ? {} : { borderTopWidth: borders.hairline, borderTopColor: colors.text, paddingTop: spacing.md, marginTop: spacing.sm }),
    } satisfies ViewStyle,
    number: { ...typography.lookNumber, color: colors.accent } satisfies TextStyle,
    of: { ...typography.headerLabel, color: colors.text, flexShrink: 1, textAlign: 'right' } satisfies TextStyle,
    mainRow: { flexDirection: 'row', gap: spacing.sm } satisfies ViewStyle,
    smallRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm } satisfies ViewStyle,
    tile: { flex: 1, backgroundColor: colors.photoBackground, overflow: 'hidden' } satisfies ViewStyle,
    smallTile: {
      width: sizes.lookSmallPhotoSize,
      height: sizes.lookSmallPhotoSize,
      backgroundColor: colors.photoBackground,
      overflow: 'hidden',
    } satisfies ViewStyle,
    removed: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xs } satisfies ViewStyle,
    removedText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' } satisfies TextStyle,
    pieces: { ...typography.lookPieces, color: colors.text } satisfies TextStyle,
    rationale: { ...typography.bodySmall, color: colors.textBodySecondary } satisfies TextStyle,
    rationaleLead: { fontFamily: theme.fonts.sans.bold, color: colors.text } satisfies TextStyle,
    notice: { ...typography.caption, color: colors.textSecondary } satisfies TextStyle,
  };
}

/** Height of the main photos: one, two or three across. */
export function lookPhotoHeight(theme: Theme, count: number): number {
  const { sizes } = theme;
  if (count <= 1) return sizes.lookPhotoHeightOne;
  if (count === 2) return sizes.lookPhotoHeightTwo;
  return sizes.lookPhotoHeightThree;
}

/** The Results header (Results.dc.html): back, the request in italic serif, the count under it, an ink rule. */
export function resultsLook(theme: Theme) {
  const { colors, spacing, typography, borders, sizes } = theme;
  return {
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.text,
    } satisfies ViewStyle,
    titleBlock: { flex: 1 } satisfies ViewStyle,
    title: { ...typography.requestTitle, color: colors.text } satisfies TextStyle,
    subtitle: { ...typography.caption, color: colors.textSecondary } satisfies TextStyle,
    body: { paddingHorizontal: sizes.screenPadding, paddingTop: spacing.lg, gap: spacing.md } satisfies ViewStyle,
    omitted: { ...typography.caption, color: colors.textSecondary } satisfies TextStyle,
    weatherBlock: { gap: spacing.xxs } satisfies ViewStyle,
    weatherLine: { ...typography.headerLabel, color: colors.text } satisfies TextStyle,
    weatherCredit: { ...typography.caption, color: colors.textSecondary } satisfies TextStyle,
    weatherSkipped: { ...typography.caption, color: colors.textBodySecondary } satisfies TextStyle,
    state: { paddingTop: spacing.xxxl, gap: spacing.md } satisfies ViewStyle,
    stateTitle: { ...typography.itemName, color: colors.text } satisfies TextStyle,
    stateBody: { ...typography.body, color: colors.textBodySecondary } satisfies TextStyle,
    spinnerColor: colors.text,
  };
}
