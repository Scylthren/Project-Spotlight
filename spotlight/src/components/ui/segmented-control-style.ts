import type { AccessibilityRole, TextStyle, ViewStyle } from 'react-native';

import type { Theme } from '@/theme';

import type { ControlState } from './control-state';

/**
 * A bordered row of equal options; the selected one is ink-filled
 * (Profile.dc.html "Appearance"). A radio group to screen readers.
 */
export function segmentedGroupLook(theme: Theme): ViewStyle {
  return {
    flexDirection: 'row',
    borderWidth: theme.borders.hairline,
    borderColor: theme.colors.text,
    borderRadius: theme.borders.radius.none,
  };
}

export interface SegmentLook {
  container: ViewStyle;
  label: TextStyle;
  /** The color behind the label (for contrast checks). */
  fill: string;
}

export function segmentLook(
  theme: Theme,
  { selected, index, pressed, disabled }: ControlState & { selected: boolean; index: number },
): SegmentLook {
  const { colors, borders, sizes, spacing, typography } = theme;
  const active = pressed && !disabled;
  const fill = selected ? colors.text : active ? colors.surface : colors.background;
  return {
    container: {
      flex: 1,
      minHeight: sizes.minTouchTarget,
      paddingHorizontal: spacing.xs,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: fill,
      borderColor: colors.text,
      borderLeftWidth: index === 0 ? 0 : borders.hairline,
      opacity: disabled ? theme.opacity.disabled : 1,
    },
    label: { ...typography.segment, color: selected ? colors.background : colors.text },
    fill,
  };
}

export function segmentedGroupAccessibility(label: string) {
  return { accessibilityRole: 'radiogroup' as AccessibilityRole, accessibilityLabel: label };
}

export function segmentAccessibility(label: string, { selected, disabled }: { selected: boolean; disabled: boolean }) {
  return {
    accessible: true,
    accessibilityRole: 'radio' as AccessibilityRole,
    accessibilityLabel: label,
    accessibilityState: { checked: selected, selected, disabled },
  };
}
