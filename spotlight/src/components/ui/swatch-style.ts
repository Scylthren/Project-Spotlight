import type { AccessibilityRole, TextStyle, ViewStyle } from 'react-native';

import type { Theme } from '@/theme';

import { controlAccessibilityState, type ControlState } from './control-state';
import { hitSlopFor, type HitSlop } from './touch-target';

/** Diameter of the color circle (SaveItem.dc.html). */
export const SWATCH_CIRCLE_SIZE = 26;
/** Height of a pressable swatch chip; hit slop grows it to 44 pt. */
export const SWATCH_CHIP_HEIGHT = 40;

export interface SwatchLook {
  container: ViewStyle;
  label: TextStyle;
  hitSlop: HitSlop | undefined;
}

/**
 * A color circle with its name as text, so color is never the only cue
 * (README "Touch targets"). Pressable swatches are outlined chips; the
 * selected one gets a thicker ink outline, padded so the content doesn't
 * move. A static swatch is just the circle and the name.
 */
export function swatchLook(
  theme: Theme,
  { interactive, selected, pressed, disabled }: ControlState & { interactive: boolean; selected: boolean },
): SwatchLook {
  const { colors, borders, spacing, typography } = theme;
  const row: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: spacing.sm };
  const label: TextStyle = { ...typography.bodySmall, color: colors.text };
  if (!interactive) return { container: row, label, hitSlop: undefined };

  const width = selected ? borders.masthead : borders.hairline;
  const inset = width - borders.hairline;
  const active = pressed && !disabled;
  return {
    container: {
      ...row,
      minHeight: SWATCH_CHIP_HEIGHT,
      paddingLeft: spacing.xs + spacing.xxs - inset,
      paddingRight: spacing.md - inset,
      borderRadius: borders.radius.none,
      borderWidth: width,
      borderColor: selected ? colors.text : colors.border,
      backgroundColor: active ? colors.surface : colors.background,
      opacity: disabled ? theme.opacity.disabled : 1,
    },
    label: selected ? { ...label, fontFamily: theme.fonts.sans.semiBold } : label,
    hitSlop: hitSlopFor({ height: SWATCH_CHIP_HEIGHT }),
  };
}

export function swatchAccessibility(
  name: string,
  { interactive, selected, disabled }: { interactive: boolean; selected: boolean; disabled: boolean },
) {
  if (!interactive) {
    return { accessible: true, accessibilityRole: 'text' as AccessibilityRole, accessibilityLabel: name };
  }
  return {
    accessible: true,
    accessibilityRole: 'button' as AccessibilityRole,
    accessibilityLabel: name,
    accessibilityState: controlAccessibilityState({ disabled, selected }),
  };
}
