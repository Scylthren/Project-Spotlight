import { Pressable, Text } from 'react-native';

import { buttonAccessibility, buttonLook, type ButtonLook } from '@/components/ui/button-style';
import { useTheme } from '@/hooks/use-theme';
import type { Theme } from '@/theme';

type FormButtonVariant = 'primary' | 'secondary' | 'destructive' | 'text';

interface FormButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /**
   * primary: ink fill; secondary: ink outline; destructive: outline in the
   * danger color; text: a bare label (README "Buttons").
   */
  variant?: FormButtonVariant;
  /** Read instead of `label` when the visible text is not enough. */
  accessibilityLabel?: string;
}

/** The shared button look per variant; destructive is the outline in `danger`. */
export function formButtonLook(theme: Theme, variant: FormButtonVariant, state: { pressed: boolean; disabled: boolean }): ButtonLook {
  if (variant === 'primary') return buttonLook(theme, 'primary', state);
  if (variant === 'text') return buttonLook(theme, 'text', state);
  const look = buttonLook(theme, 'outline', state);
  if (variant === 'secondary') return look;
  const { danger } = theme.colors;
  return {
    ...look,
    container: { ...look.container, borderColor: danger },
    label: { ...look.label, color: danger },
    boundary: danger,
  };
}

/**
 * Full-width form button. `disabled` dims the button and blocks presses
 * (Pressable ignores them). Handlers still guard themselves, because a press
 * can land before the disabled state renders.
 */
export function FormButton({ label, onPress, disabled = false, variant = 'primary', accessibilityLabel }: FormButtonProps) {
  const theme = useTheme();
  const idle = formButtonLook(theme, variant, { pressed: false, disabled });
  return (
    <Pressable
      {...buttonAccessibility(accessibilityLabel ?? label, disabled)}
      onPress={onPress}
      disabled={disabled}
      hitSlop={idle.hitSlop}
      style={({ pressed }) => formButtonLook(theme, variant, { pressed, disabled }).container}>
      <Text style={idle.label}>{label}</Text>
    </Pressable>
  );
}
