import { Pressable, Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { buttonAccessibility, buttonLook, type ButtonVariant } from './button-style';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Read instead of `label` when the visible text is not enough. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** For the dev gallery: draw the pressed state without a press. */
  forcePressed?: boolean;
}

/** Primary, outline or text button. Disabled buttons dim and ignore presses. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  forcePressed = false,
}: ButtonProps) {
  const theme = useTheme();
  const idle = buttonLook(theme, variant, { pressed: forcePressed, disabled });
  return (
    <Pressable
      {...buttonAccessibility(accessibilityLabel ?? label, disabled)}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={disabled}
      hitSlop={idle.hitSlop}
      style={({ pressed }) => buttonLook(theme, variant, { pressed: pressed || forcePressed, disabled }).container}>
      <Text style={idle.label}>{label}</Text>
    </Pressable>
  );
}
