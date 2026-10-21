import { Image } from 'expo-image';
import { FlatList, Pressable, StyleSheet } from 'react-native';

import { capitalize } from '@/components/chip-group';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import type { ClothingItem } from '@/core';

const COLUMNS = 3;

interface ClosetGridProps {
  items: ClothingItem[];
  resolveImageUri: (ref: string) => string;
  onPressItem: (item: ClothingItem) => void;
  header?: React.ReactElement;
}

export function ClosetGrid({ items, resolveImageUri, onPressItem, header }: ClosetGridProps) {
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      numColumns={COLUMNS}
      ListHeaderComponent={header}
      contentContainerStyle={styles.content}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onPressItem(item)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${item.colors.join(' ')} ${item.category}`}
          style={({ pressed }) => [styles.cell, pressed && styles.pressed]}>
          <ThemedView type="backgroundElement" style={styles.tile}>
            <Image
              source={{ uri: resolveImageUri(item.imageUri) }}
              style={styles.image}
              contentFit="cover"
            />
          </ThemedView>
          <ThemedText type="small" numberOfLines={1}>
            {capitalize(item.category)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {item.colors.join(', ')}
          </ThemedText>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  row: { gap: Spacing.three },
  // Fixed fraction keeps the last row's cells the same width as full rows.
  cell: { width: `${100 / COLUMNS - 4}%`, gap: Spacing.half },
  tile: { aspectRatio: 1, borderRadius: Spacing.two, overflow: 'hidden' },
  image: { flex: 1 },
  pressed: { opacity: 0.7 },
});
