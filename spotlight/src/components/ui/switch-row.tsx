import { Pressable, Switch, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { switchRowAccessibility, switchRowLook, type SwitchTone } from './switch-row-style';

interface SwitchRowProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Accent (the Me tab, Profile.dc.html) or ink (the Style screen, StylePrompt.dc.html). */
  tone?: SwitchTone;
  disabled?: boolean;
  accessibilityHint?: string;
}

/** A label and a switch; tapping anywhere on the row toggles it. */
export function SwitchRow({ label, value, onValueChange, tone = 'accent', disabled = false, accessibilityHint }: SwitchRowProps) {
  const theme = useTheme();
  const idle = switchRowLook(theme, tone, { pressed: false, disabled });
  return (
    <Pressable
      {...switchRowAccessibility(label, value, disabled)}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => switchRowLook(theme, tone, { pressed, disabled }).row}>
      <Text style={idle.label}>{label}</Text>
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: idle.trackOff, true: idle.trackOn }}
          thumbColor={idle.thumb}
          ios_backgroundColor={idle.trackOff}
        />
      </View>
    </Pressable>
  );
}
