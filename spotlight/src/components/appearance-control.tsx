import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  APPEARANCE_LABELS,
  APPEARANCE_PREFERENCES,
  type AppearancePreference,
} from '@/core/appearance';
import { useTheme } from '@/hooks/use-theme';

/**
 * Light / Dark / System as one bordered row of three options
 * (Profile.dc.html, "Appearance"). The selected option is ink-filled.
 * A radio group for screen readers. Slice 3's SegmentedControl replaces it.
 */
export function AppearanceControl({
  value,
  onChange,
}: {
  value: AppearancePreference;
  onChange: (preference: AppearancePreference) => void;
}) {
  const { colors, typography, borders, sizes } = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Theme"
      style={[styles.group, { borderColor: colors.text, borderWidth: borders.hairline }]}>
      {APPEARANCE_PREFERENCES.map((preference, index) => {
        const selected = preference === value;
        return (
          <Pressable
            key={preference}
            accessibilityRole="radio"
            accessibilityLabel={APPEARANCE_LABELS[preference]}
            accessibilityState={{ checked: selected, selected }}
            onPress={() => onChange(preference)}
            style={[
              styles.option,
              {
                minHeight: sizes.minTouchTarget,
                backgroundColor: selected ? colors.text : colors.background,
                borderColor: colors.text,
                borderLeftWidth: index === 0 ? 0 : borders.hairline,
              },
            ]}>
            <Text
              style={[typography.segment, { color: selected ? colors.background : colors.text }]}>
              {APPEARANCE_LABELS[preference]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row' },
  option: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
