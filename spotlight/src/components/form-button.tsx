import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

interface FormButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'destructive';
}

/**
 * Full-width form button. `disabled` dims the button and blocks presses
 * (Pressable ignores them). Handlers still guard themselves, because a press
 * can land before the disabled state renders.
 */
export function FormButton({ label, onPress, disabled = false, variant = 'primary' }: FormButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        (pressed || disabled) && styles.pressed,
      ]}>
      <ThemedText style={TEXT_STYLES[variant]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: Spacing.three, paddingVertical: Spacing.three, alignItems: 'center' },
  primary: { backgroundColor: '#3c87f7' },
  primaryText: { color: '#ffffff' },
  secondary: { borderWidth: 1, borderColor: '#3c87f7' },
  secondaryText: { color: '#3c87f7' },
  destructive: { borderWidth: 1, borderColor: '#d93025' },
  destructiveText: { color: '#d93025' },
  pressed: { opacity: 0.6 },
});

const TEXT_STYLES = {
  primary: styles.primaryText,
  secondary: styles.secondaryText,
  destructive: styles.destructiveText,
} as const;
