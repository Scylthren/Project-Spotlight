import type { AccessibilityRole, TextStyle, ViewStyle } from 'react-native';

import type { Theme } from '@/theme';

import { controlAccessibilityState, type ControlState } from './control-state';
import { hitSlopFor, type HitSlop } from './touch-target';

/**
 * Chips (README "Chips", Closet.dc.html filters, SaveItem.dc.html tags):
 * 36 pt, square, 14 pt side padding.
 * - plain: light outline; selected is ink-filled.
 * - styleTag: italic serif label, ink outline; selected is ink-filled.
 * - add: dashed ink outline, a "+" before the label. Never selected.
 *
 * Casing (plain and add only; style tags show the tag as typed):
 * - uppercase: 12 pt tracked uppercase (Closet.dc.html filters);
 * - sentence: 13 pt sentence case (SaveItem.dc.html seasons and "+ Add").
 */
export const CHIP_VARIANTS = ['plain', 'styleTag', 'add'] as const;
export type ChipVariant = (typeof CHIP_VARIANTS)[number];

export const CHIP_CASINGS = ['uppercase', 'sentence'] as const;
export type ChipCasing = (typeof CHIP_CASINGS)[number];

export interface ChipLook {
  container: ViewStyle;
  label: TextStyle;
  /** The color behind the label (for contrast checks). */
  fill: string;
  /**
   * The outline color when it is the chip's only edge against the screen
   * (unselected and not plain), else null. Plain chips keep the design's
   * light outline: their label identifies them, and selection is a fill.
   */
  boundary: string | null;
  hitSlop: HitSlop;
}

export interface ChipState extends ControlState {
  selected: boolean;
}

/** The label's type: serif italic for style tags, else by casing (the add chip is semibold in sentence case). */
function chipLabelType(theme: Theme, variant: ChipVariant, casing: ChipCasing): TextStyle {
  const { fonts, typography } = theme;
  if (variant === 'styleTag') return typography.styleTag;
  if (casing === 'uppercase') return typography.chip;
  return variant === 'add'
    ? { ...typography.chipSentence, fontFamily: fonts.sans.semiBold }
    : typography.chipSentence;
}

export function chipLook(
  theme: Theme,
  variant: ChipVariant,
  state: ChipState,
  casing: ChipCasing = 'uppercase',
): ChipLook {
  const { colors, borders, sizes } = theme;
  const selected = state.selected && variant !== 'add';
  const active = state.pressed && !state.disabled;
  const fill = selected
    ? active
      ? colors.textBodySecondary
      : colors.text
    : active
      ? colors.surface
      : colors.background;
  const outline = selected ? fill : variant === 'plain' ? colors.border : colors.text;

  return {
    container: {
      minHeight: sizes.chipHeight,
      paddingHorizontal: sizes.chipPaddingHorizontal,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borders.radius.none,
      borderWidth: borders.hairline,
      borderColor: outline,
      borderStyle: variant === 'add' ? 'dashed' : 'solid',
      backgroundColor: fill,
      opacity: state.disabled ? theme.opacity.disabled : 1,
    },
    label: {
      ...chipLabelType(theme, variant, casing),
      color: selected ? colors.background : colors.text,
    },
    fill,
    boundary: selected || variant === 'plain' ? null : outline,
    hitSlop: hitSlopFor({ height: sizes.chipHeight }),
  };
}

/**
 * The text a chip shows: the add chip puts a "+" before its label, unless
 * `plus` is false (a dashed action that adds nothing, like "Edit colors").
 */
export function chipText(variant: ChipVariant, label: string, plus = true): string {
  return variant === 'add' && plus ? `+ ${label}` : label;
}

/**
 * Pressable chips are buttons that report `selected` (the add chip never
 * does); a chip without `onPress` is plain text to screen readers.
 */
export function chipAccessibility(
  variant: ChipVariant,
  label: string,
  { selected, disabled, interactive }: { selected: boolean; disabled: boolean; interactive: boolean },
) {
  if (!interactive) {
    return { accessible: true, accessibilityRole: 'text' as AccessibilityRole, accessibilityLabel: label };
  }
  return {
    accessible: true,
    accessibilityRole: 'button' as AccessibilityRole,
    // The "+" is decoration; the label itself names the action ("New tag").
    accessibilityLabel: label,
    accessibilityState: controlAccessibilityState(
      variant === 'add' ? { disabled } : { disabled, selected },
    ),
  };
}
