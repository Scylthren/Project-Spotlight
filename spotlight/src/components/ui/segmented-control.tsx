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
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers ("Theme"). */
  accessibilityLabel: string;
  disabled?: boolean;
}

/** One choice out of a few, as a bordered row; a radio group to screen readers. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
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
            {...segmentAccessibility(option.label, { selected, disabled })}
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
