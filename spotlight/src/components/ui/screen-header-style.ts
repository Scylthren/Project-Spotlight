import type { AccessibilityRole, TextStyle, ViewStyle } from 'react-native';

import type { Theme } from '@/theme';

import { hitSlopFor, type HitSlop } from './touch-target';

/**
 * Screen headers:
 * - masthead (Closet.dc.html, Profile.dc.html): a large serif title, an
 *   optional note on the right (e.g. the item count), and a 2 pt ink rule;
 * - step (Angles.dc.html): back button, a small centered label, an optional
 *   step count ("1/2"), and a 1 pt ink rule.
 */
export const SCREEN_HEADER_VARIANTS = ['masthead', 'step'] as const;
export type ScreenHeaderVariant = (typeof SCREEN_HEADER_VARIANTS)[number];

export interface ScreenHeaderLook {
  container: ViewStyle;
  title: TextStyle;
  /** The right-hand note (count or step). */
  aside: TextStyle;
  /** Fixed-width side slots of the step header, so the label stays centered. */
  side: ViewStyle;
  backButton: ViewStyle;
  backHitSlop: HitSlop;
  /** The rule under the header. */
  rule: { width: number; color: string };
}

export function screenHeaderLook(theme: Theme, variant: ScreenHeaderVariant): ScreenHeaderLook {
  const { colors, borders, sizes, spacing, typography } = theme;
  const side: ViewStyle = { width: sizes.minTouchTarget, justifyContent: 'center' };
  const backButton: ViewStyle = {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  };
  const backHitSlop = hitSlopFor({ height: sizes.minTouchTarget, width: sizes.minTouchTarget });

  if (variant === 'masthead') {
    return {
      container: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: spacing.md,
        paddingBottom: spacing.sm,
        borderBottomWidth: borders.masthead,
        borderBottomColor: colors.text,
      },
      title: { ...typography.display, color: colors.text, flexShrink: 1 },
      aside: { ...typography.label, color: colors.textSecondary, paddingBottom: spacing.sm },
      side,
      backButton,
      backHitSlop,
      rule: { width: borders.masthead, color: colors.text },
    };
  }
  return {
    container: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: sizes.minTouchTarget + spacing.xl,
      paddingHorizontal: spacing.lg - spacing.sm,
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.text,
    },
    title: { ...typography.headerLabel, color: colors.text, flexShrink: 1, textAlign: 'center' },
    aside: { ...typography.styleTag, color: colors.text, textAlign: 'right' },
    side,
    backButton,
    backHitSlop,
    rule: { width: borders.hairline, color: colors.text },
  };
}

/** A drawn chevron (no icon library): a square with two edges, turned 45°. */
export function backChevronLook(theme: Theme): ViewStyle {
  const stroke = theme.borders.hairline + 0.5;
  return {
    width: theme.spacing.md,
    height: theme.spacing.md,
    marginLeft: theme.spacing.xs,
    borderLeftWidth: stroke,
    borderBottomWidth: stroke,
    borderColor: theme.colors.text,
    transform: [{ rotate: '45deg' }],
  };
}

export function screenHeaderAccessibility() {
  return {
    title: { accessibilityRole: 'header' as AccessibilityRole },
    back: {
      accessible: true,
      accessibilityRole: 'button' as AccessibilityRole,
      accessibilityLabel: 'Back',
    },
  };
}

/** The step count read aloud: "Step 1 of 2". */
export function stepAccessibilityLabel(step: { current: number; total: number }): string {
  return `Step ${step.current} of ${step.total}`;
}

export function stepText(step: { current: number; total: number }): string {
  return `${step.current}/${step.total}`;
}
