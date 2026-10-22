import { ScrollView, View } from 'react-native';

import { Chip, TextField } from '@/components/ui';
import { CATEGORY_FILTERS, categoryFilterLabel, type ClosetFilter } from '@/core';
import { useTheme } from '@/hooks/use-theme';

interface ClosetFilterBarProps {
  filter: ClosetFilter;
  onChange: (filter: ClosetFilter) => void;
}

/** The closet search box and the category chips (All plus each category). Logic: `core/closet-filter.ts`. */
export function ClosetFilterBar({ filter, onChange }: ClosetFilterBarProps) {
  const { sizes, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <TextField
        label="Search your closet"
        labelHidden
        placeholder="Search by color, piece or vibe"
        value={filter.query}
        onChangeText={(query) => onChange({ ...filter, query })}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel="Category"
        // Full-bleed: the chips scroll to the screen edges, starting in line with the padding.
        style={{ marginHorizontal: -sizes.screenPadding }}
        contentContainerStyle={{ paddingHorizontal: sizes.screenPadding, paddingVertical: spacing.xs, gap: spacing.sm }}>
        {CATEGORY_FILTERS.map((category) => (
          <Chip
            key={category}
            label={categoryFilterLabel(category)}
            selected={filter.category === category}
            onPress={() => onChange({ ...filter, category })}
          />
        ))}
      </ScrollView>
    </View>
  );
}
