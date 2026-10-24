import type { AccessibilityRole, TextStyle, ViewStyle } from 'react-native';

import type { Theme } from '@/theme';

import { controlAccessibilityState, type ControlState } from './control-state';
import { hitSlopFor, type HitSlop } from './touch-target';

/**
 * Buttons (README "Buttons"): primary is an ink fill, outline a 1 pt ink
 * outline, text a bare uppercase label, accent the red fill used only for
 * the Style screen's main action ("Get looks"). All 52 pt tall except the
 * text button, which is 44 pt (the minimum touch target).
 */
export const BUTTON_VARIANTS = ['primary', 'outline', 'text', 'accent'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export interface ButtonLook {
  container: ViewStyle;
  label: TextStyle;
  /** The color behind the label (for contrast checks). */
  fill: string;
  /** The outline color when the outline is the button's visible edge, else null. */
  boundary: string | null;
  hitSlop: HitSlop;
}

export function buttonLook(theme: Theme, variant: ButtonVariant, { pressed, disabled }: ControlState): ButtonLook {
  const { colors, borders, sizes, spacing, typography } = theme;
  const height = variant === 'text' ? sizes.minTouchTarget : sizes.buttonHeight;
  const base: ViewStyle = {
    minHeight: height,
    paddingHorizontal: variant === 'text' ? spacing.sm : spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borders.radius.none,
    opacity: disabled ? theme.opacity.disabled : 1,
  };
  const active = pressed && !disabled;

  if (variant === 'primary') {
    const fill = active ? colors.textBodySecondary : colors.text;
    return {
      container: { ...base, backgroundColor: fill, borderWidth: borders.hairline, borderColor: fill },
      label: { ...typography.button, color: colors.background },
      fill,
      boundary: null,
      hitSlop: hitSlopFor({ height }),
    };
  }
  if (variant === 'accent') {
    // Pressed turns ink, like a pressed primary turns grey: a clear change on the red.
    const fill = active ? colors.text : colors.accent;
    return {
      container: { ...base, backgroundColor: fill, borderWidth: borders.hairline, borderColor: fill },
      label: { ...typography.button, color: colors.background },
      fill,
      boundary: null,
      hitSlop: hitSlopFor({ height }),
    };
  }
  if (variant === 'outline') {
    const fill = active ? colors.surface : colors.background;
    return {
      container: { ...base, backgroundColor: fill, borderWidth: borders.hairline, borderColor: colors.text },
      label: { ...typography.button, color: colors.text },
      fill,
      boundary: colors.text,
      hitSlop: hitSlopFor({ height }),
    };
  }
  const fill = active ? colors.surface : colors.background;
  return {
    container: active ? { ...base, backgroundColor: fill } : base,
    label: { ...typography.button, color: colors.text },
    fill,
    boundary: null,
    hitSlop: hitSlopFor({ height }),
  };
}

export function buttonAccessibility(label: string, disabled: boolean) {
  return {
    accessible: true,
    accessibilityRole: 'button' as AccessibilityRole,
    accessibilityLabel: label,
    accessibilityState: controlAccessibilityState({ disabled }),
  };
}
