import { Pressable, Text, View } from 'react-native';

import { chipAccessibility, chipLook, chipText, type ChipCasing, type ChipVariant } from '@/components/ui/chip-style';
import { useTheme } from '@/hooks/use-theme';

interface ChipGroupProps<T extends string> {
  options: readonly T[];
  isSelected: (option: T) => boolean;
  onPress: (option: T) => void;
  accessibilityLabel: string;
  /** Chip text. Defaults to `capitalize`. */
  formatLabel?: (option: T) => string;
  /** What screen readers read for a chip. Defaults to the chip text. */
  formatAccessibilityLabel?: (option: T) => string;
  /** Optional secondary action, also offered to screen readers as a named action. */
  onLongPress?: (option: T) => void;
  /** Screen reader name for the long-press action, e.g. "Delete tag". */
  longPressLabel?: string;
  /** Hint read for every chip, e.g. "Removes the tag". */
  chipAccessibilityHint?: string;
  disabled?: boolean;
  /** `plain` (default) or `styleTag` (italic serif, for style tags). */
  variant?: Extract<ChipVariant, 'plain' | 'styleTag'>;
  /** Label casing of plain chips (SaveItem.dc.html uses sentence case). */
  casing?: ChipCasing;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A wrapping row of selectable chips (the shared Chip look, SaveItem.dc.html).
 * Works for single or multi select. Selected chips are ink-filled.
 */
export function ChipGroup<T extends string>({
  options,
  isSelected,
  onPress,
  accessibilityLabel,
  formatLabel = capitalize,
  formatAccessibilityLabel,
  onLongPress,
  longPressLabel = 'More options',
  chipAccessibilityHint,
  disabled = false,
  variant = 'plain',
  casing = 'sentence',
}: ChipGroupProps<T>) {
  const theme = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}
      accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = isSelected(option);
        const label = formatLabel(option);
        const idle = chipLook(theme, variant, { selected, disabled, pressed: false }, casing);
        return (
          <Pressable
            key={option}
            {...chipAccessibility(variant, formatAccessibilityLabel?.(option) ?? label, {
              selected,
              disabled,
              interactive: true,
            })}
            onPress={() => onPress(option)}
            onLongPress={onLongPress && (() => onLongPress(option))}
            disabled={disabled}
            hitSlop={idle.hitSlop}
            accessibilityHint={chipAccessibilityHint}
            accessibilityActions={onLongPress ? [{ name: 'longpress', label: longPressLabel }] : undefined}
            onAccessibilityAction={
              onLongPress &&
              ((event) => {
                if (event.nativeEvent.actionName === 'longpress') onLongPress(option);
              })
            }
            style={({ pressed }) => chipLook(theme, variant, { selected, disabled, pressed }, casing).container}>
            <Text style={idle.label}>{chipText(variant, label)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
