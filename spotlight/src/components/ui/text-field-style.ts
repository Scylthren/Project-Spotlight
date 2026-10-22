import type { TextStyle } from 'react-native';

import type { Theme } from '@/theme';

/**
 * Labeled text inputs (SaveItem.dc.html):
 * - underline: a 1 pt ink rule under large serif text (item name);
 * - boxed: a 1 pt outline around UI text (search, tags). The outline is the
 *   input's only edge, so it uses `inputBorder` (>= 3:1), and turns ink
 *   while focused.
 * Errors turn the edge `danger` and show the message under the field.
 */
export const TEXT_FIELD_VARIANTS = ['underline', 'boxed'] as const;
export type TextFieldVariant = (typeof TEXT_FIELD_VARIANTS)[number];

export interface TextFieldState {
  focused: boolean;
  disabled: boolean;
  error: boolean;
}

export interface TextFieldLook {
  input: TextStyle;
  label: TextStyle;
  message: TextStyle;
  placeholderColor: string;
  selectionColor: string;
  /** The input's visible edge (the underline or the outline). */
  boundary: string;
  /** The color behind the typed text (for contrast checks). */
  fill: string;
}

export function textFieldLook(
  theme: Theme,
  variant: TextFieldVariant,
  { focused, disabled, error }: TextFieldState,
): TextFieldLook {
  const { colors, borders, sizes, spacing, typography } = theme;
  const boundary = error
    ? colors.danger
    : variant === 'underline' || focused
      ? colors.text
      : colors.inputBorder;
  const common: TextStyle = {
    minHeight: sizes.minTouchTarget,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: borders.radius.none,
    opacity: disabled ? theme.opacity.disabled : 1,
  };
  const input: TextStyle =
    variant === 'underline'
      ? {
          ...typography.inputSerif,
          ...common,
          paddingHorizontal: 0,
          paddingVertical: spacing.xs,
          borderBottomWidth: borders.hairline,
          borderBottomColor: boundary,
        }
      : {
          ...typography.body,
          ...common,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderWidth: borders.hairline,
          borderColor: boundary,
        };
  return {
    input,
    label: { ...typography.label, color: colors.text },
    message: { ...typography.caption, color: error ? colors.danger : colors.textSecondary },
    placeholderColor: colors.textSecondary,
    selectionColor: colors.accent,
    boundary,
    fill: colors.background,
  };
}

/**
 * The input carries the field's name; the visible label is hidden from
 * screen readers so it isn't read twice. An error is part of the name
 * ("Name, error: Enter a name."), so it is read whenever the field is, not
 * only as a hint (which users can turn off). The hint is read only when
 * there is no error, matching what is shown under the field.
 */
export function textFieldAccessibility(
  label: string,
  { disabled, error, hint }: { disabled: boolean; error?: string; hint?: string },
) {
  return {
    accessibilityLabel: error ? textFieldErrorAnnouncement(label, error) : label,
    accessibilityHint: error ? undefined : hint,
    accessibilityState: { disabled },
  };
}

/** What is announced when an error appears, and the field's name while it shows. */
export function textFieldErrorAnnouncement(label: string, error: string): string {
  return `${label}, error: ${error}`;
}

/**
 * Announce only when an error appears or changes, not on every render and
 * not when it clears.
 */
export function shouldAnnounceError(previous: string | undefined, next: string | undefined): next is string {
  return Boolean(next) && next !== previous;
}
