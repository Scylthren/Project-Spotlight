import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import {
  segmentAccessibility,
  segmentedGroupAccessibility,
  segmentedGroupLook,
  segmentLook,
} from './segmented-control-style';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** What screen readers read, when the visible label is shortened ("Smart" for "Smart casual"). */
  accessibilityLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  /** The selected option; null when none is (e.g. an attribute not set yet). */
  value: T | null;
  onChange: (value: T) => void;
  /** Names the group for screen readers ("Theme"). */
  accessibilityLabel: string;
  /** Read on the selected segment only (e.g. "Tap again to clear it" where a choice can be cleared). */
  selectedAccessibilityHint?: string;
  disabled?: boolean;
}

/** One choice out of a few, as a bordered row; a radio group to screen readers. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  selectedAccessibilityHint,
  disabled = false,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  return (
    <View {...segmentedGroupAccessibility(accessibilityLabel)} style={segmentedGroupLook(theme)}>
      {options.map((option, index) => {
        const selected = option.value === value;
        const idle = segmentLook(theme, { selected, index, pressed: false, disabled });
        return (
          <Pressable
            key={option.value}
            {...segmentAccessibility(option.accessibilityLabel ?? option.label, { selected, disabled })}
            accessibilityHint={selected ? selectedAccessibilityHint : undefined}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            style={({ pressed }) => segmentLook(theme, { selected, index, pressed, disabled }).container}>
            <Text style={idle.label}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
