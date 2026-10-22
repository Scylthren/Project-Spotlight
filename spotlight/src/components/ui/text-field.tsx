import { useEffect, useRef, useState, type Ref } from 'react';
import { AccessibilityInfo, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import {
  shouldAnnounceError,
  textFieldAccessibility,
  textFieldErrorAnnouncement,
  textFieldLook,
  type TextFieldVariant,
} from './text-field-style';

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
  /** The underlying input (e.g. to blur it from a return-key handler). */
  ref?: Ref<TextInput>;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  variant?: TextFieldVariant;
  /**
   * Shown under the field in the danger color. Screen readers read it as part
   * of the field's name and announce it when it appears or changes.
   */
  error?: string;
  /** Shown under the field when there is no error. */
  hint?: string;
  disabled?: boolean;
  /**
   * Hide the visible label (the mockup's search box has none). The input is
   * still named by `label`; use a placeholder that says what to type.
   */
  labelHidden?: boolean;
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
  labelHidden = false,
  onFocus,
  onBlur,
  ref,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const look = textFieldLook(theme, variant, { focused, disabled, error: Boolean(error) });
  const message = error || hint;
  useErrorAnnouncement(label, error);

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {labelHidden ? null : (
        <Text style={look.label} accessible={false} importantForAccessibility="no">
          {label}
        </Text>
      )}
      <TextInput
        {...rest}
        ref={ref}
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

/** Announces the error when it appears or changes (iOS and Android). */
function useErrorAnnouncement(label: string, error: string | undefined) {
  const announced = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (shouldAnnounceError(announced.current, error)) {
      AccessibilityInfo.announceForAccessibility(textFieldErrorAnnouncement(label, error));
    }
    announced.current = error || undefined;
  }, [label, error]);
}
