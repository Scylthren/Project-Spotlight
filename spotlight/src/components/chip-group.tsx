import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { spacing } from '@/theme';

interface ChipGroupProps<T extends string> {
  options: readonly T[];
  isSelected: (option: T) => boolean;
  onPress: (option: T) => void;
  accessibilityLabel: string;
  /** Chip text. Defaults to `capitalize`. */
  formatLabel?: (option: T) => string;
  /** Optional secondary action, also offered to screen readers as a named action. */
  onLongPress?: (option: T) => void;
  /** Screen reader name for the long-press action, e.g. "Delete tag". */
  longPressLabel?: string;
  /** Hint read for every chip, e.g. "Removes the tag". */
  chipAccessibilityHint?: string;
  disabled?: boolean;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A wrapping row of selectable chips. Works for single or multi select. */
export function ChipGroup<T extends string>({
  options,
  isSelected,
  onPress,
  accessibilityLabel,
  formatLabel = capitalize,
  onLongPress,
  longPressLabel = 'More options',
  chipAccessibilityHint,
  disabled = false,
}: ChipGroupProps<T>) {
  return (
    <View style={styles.row} accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = isSelected(option);
        return (
          <Pressable
            key={option}
            onPress={() => onPress(option)}
            onLongPress={onLongPress && (() => onLongPress(option))}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            accessibilityHint={chipAccessibilityHint}
            accessibilityActions={onLongPress ? [{ name: 'longpress', label: longPressLabel }] : undefined}
            onAccessibilityAction={
              onLongPress &&
              ((event) => {
                if (event.nativeEvent.actionName === 'longpress') onLongPress(option);
              })
            }
            style={({ pressed }) => (pressed || disabled) && styles.pressed}>
            <ThemedView
              type={selected ? 'hairline' : 'surface'}
              style={[styles.chip, selected && styles.selected]}>
              <ThemedText type={selected ? 'smallBold' : 'small'}>{formatLabel(option)}</ThemedText>
            </ThemedView>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.xxl,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selected: { borderColor: '#3c87f7' },
  pressed: { opacity: 0.7 },
});
