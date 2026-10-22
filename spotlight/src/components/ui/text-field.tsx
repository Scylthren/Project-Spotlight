import { useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { textFieldAccessibility, textFieldLook, type TextFieldVariant } from './text-field-style';

type PassThrough = Pick<
  TextInputProps,
  | 'autoCapitalize'
  | 'autoCorrect'
  | 'autoFocus'
  | 'keyboardType'
  | 'maxLength'
  | 'onBlur'
  | 'onFocus'
  | 'onSubmitEditing'
  | 'placeholder'
  | 'returnKeyType'
  | 'submitBehavior'
>;

interface TextFieldProps extends PassThrough {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  variant?: TextFieldVariant;
  /** Shown under the field in the danger color; also read by screen readers. */
  error?: string;
  /** Shown under the field when there is no error. */
  hint?: string;
  disabled?: boolean;
}

/** A text input with its label above: underline (serif) or boxed. */
export function TextField({
  label,
  value,
  onChangeText,
  variant = 'boxed',
  error,
  hint,
  disabled = false,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const look = textFieldLook(theme, variant, { focused, disabled, error: Boolean(error) });
  const message = error || hint;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text style={look.label} accessible={false} importantForAccessibility="no">
        {label}
      </Text>
      <TextInput
        {...rest}
        {...textFieldAccessibility(label, { disabled, error, hint })}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        style={look.input}
        placeholderTextColor={look.placeholderColor}
        selectionColor={look.selectionColor}
        cursorColor={look.selectionColor}
        keyboardAppearance={theme.scheme}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
      {message ? (
        <Text style={look.message} accessible={false} importantForAccessibility="no">
          {message}
        </Text>
      ) : null}
    </View>
  );
}
