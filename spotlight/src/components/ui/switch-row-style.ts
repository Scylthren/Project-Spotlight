import type { TextStyle, ViewStyle } from 'react-native';

import type { Theme } from '@/theme';

export type SwitchTone = 'accent' | 'ink';

/** A settings row: the label left, a switch right, hairline rules (Profile.dc.html, StylePrompt.dc.html). */
export function switchRowLook(theme: Theme, tone: SwitchTone, { pressed, disabled }: { pressed: boolean; disabled: boolean }) {
  const { colors, spacing, typography, borders, sizes, opacity } = theme;
  return {
    row: {
      minHeight: sizes.switchRowMinHeight,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.hairline,
      backgroundColor: pressed ? colors.surface : colors.background,
      opacity: disabled ? opacity.disabled : 1,
    } satisfies ViewStyle,
    label: { ...typography.bodyLarge, color: colors.text, flexShrink: 1 } satisfies TextStyle,
    trackOff: colors.inputBorder,
    trackOn: tone === 'accent' ? colors.accent : colors.text,
    thumb: colors.background,
  };
}

/** The whole row is the switch for screen readers (a 50 pt target), with its checked state. */
export function switchRowAccessibility(label: string, value: boolean, disabled: boolean) {
  return {
    accessible: true,
    accessibilityRole: 'switch' as const,
    accessibilityLabel: label,
    accessibilityState: { checked: value, disabled },
  };
}
