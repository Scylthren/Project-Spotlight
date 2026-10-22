import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { chipAccessibility, chipLook, chipText, type ChipVariant } from './chip-style';

interface ChipProps {
  label: string;
  variant?: ChipVariant;
  selected?: boolean;
  /** Without it the chip is a static tag (plain text to screen readers). */
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
  /** For the dev gallery: draw the pressed state without a press. */
  forcePressed?: boolean;
}

/** A square chip: filter, tag, style tag or the dashed "add" chip. */
export function Chip({
  label,
  variant = 'plain',
  selected = false,
  onPress,
  onLongPress,
  disabled = false,
  accessibilityHint,
  forcePressed = false,
}: ChipProps) {
  const theme = useTheme();
  const interactive = onPress !== undefined;
  const a11y = chipAccessibility(variant, label, { selected, disabled, interactive });
  const idle = chipLook(theme, variant, { selected, disabled, pressed: forcePressed });
  const text = <Text style={idle.label}>{chipText(variant, label)}</Text>;

  if (!interactive) {
    return (
      <View {...a11y} style={idle.container}>
        {text}
      </View>
    );
  }
  return (
    <Pressable
      {...a11y}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={idle.hitSlop}
      style={({ pressed }) =>
        chipLook(theme, variant, { selected, disabled, pressed: pressed || forcePressed }).container
      }>
      {text}
    </Pressable>
  );
}
