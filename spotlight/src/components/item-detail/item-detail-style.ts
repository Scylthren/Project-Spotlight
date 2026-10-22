import type { AccessibilityRole, ImageStyle, TextStyle, ViewStyle } from 'react-native';

import { hitSlopFor, type HitSlop } from '@/components/ui/touch-target';
import type { Theme } from '@/theme';

/**
 * The read-only item screen (ItemDetail.dc.html): a photo area on the photo
 * background with a back button and Edit on white squares and the angle
 * switcher at the bottom; then the name, colors, style tags and seasons.
 */
export interface ItemDetailLook {
  /** The photo area; `topInset` (the status bar) is added above the 340 pt. */
  photoArea: ViewStyle;
  photo: ImageStyle;
  /** The white squares over the photo (back and Edit), 44 pt. */
  overlayButton: ViewStyle;
  overlayButtonPressed: ViewStyle;
  editLabel: TextStyle;
  overlayRow: ViewStyle;
  angleRow: ViewStyle;
  body: ViewStyle;
  title: TextStyle;
  /** The category under a named item's title (ItemDetail.dc.html detail line). */
  subtitle: TextStyle;
  row: ViewStyle;
  seasons: ViewStyle;
  seasonsText: TextStyle;
  message: TextStyle;
}

export function itemDetailLook(theme: Theme, topInset: number): ItemDetailLook {
  const { colors, sizes, spacing, typography } = theme;
  const overlayButton: ViewStyle = {
    minWidth: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  };
  return {
    photoArea: { height: sizes.itemPhotoHeight + topInset, backgroundColor: colors.photoBackground },
    photo: { position: 'absolute', top: topInset, left: 0, right: 0, bottom: sizes.minTouchTarget },
    overlayButton,
    overlayButtonPressed: { ...overlayButton, backgroundColor: colors.surface },
    editLabel: { ...typography.chip, color: colors.text },
    overlayRow: {
      position: 'absolute',
      top: topInset + spacing.lg,
      left: spacing.md,
      right: spacing.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    angleRow: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.xs,
    },
    body: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xl, gap: spacing.lg },
    title: { ...typography.headline, color: colors.text },
    subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: -spacing.md },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
    seasons: {
      minHeight: sizes.chipHeight,
      paddingHorizontal: sizes.chipPaddingHorizontal,
      justifyContent: 'center',
      backgroundColor: colors.photoBackground,
    },
    seasonsText: { ...typography.caption, color: colors.text },
    message: { ...typography.bodyLarge, color: colors.text, textAlign: 'center' },
  };
}

export interface AngleTabLook {
  container: ViewStyle;
  /** The label's box, carrying the rule under it (a View: per-side borders on Text are unreliable). */
  underline: ViewStyle;
  label: TextStyle;
  hitSlop: HitSlop;
}

/** An angle tab: tracked uppercase, the selected one ink with a 2 pt accent rule under it. */
export function angleTabLook(theme: Theme, selected: boolean): AngleTabLook {
  const { colors, borders, sizes, spacing, typography } = theme;
  return {
    container: {
      minHeight: sizes.minTouchTarget,
      paddingHorizontal: spacing.sm,
      justifyContent: 'center',
    },
    underline: {
      paddingBottom: spacing.xs,
      borderBottomWidth: borders.masthead,
      borderBottomColor: selected ? colors.accent : colors.photoBackground,
    },
    label: { ...typography.label, color: selected ? colors.text : colors.textSecondary },
    hitSlop: hitSlopFor({ height: sizes.minTouchTarget }),
  };
}

export function angleTabAccessibility(label: string, selected: boolean) {
  return {
    accessibilityRole: 'tab' as AccessibilityRole,
    accessibilityLabel: `${label} photo`,
    accessibilityState: { selected },
  };
}
