import { Image } from 'expo-image';
import { FlatList, Pressable, StyleSheet } from 'react-native';

import { capitalize } from '@/components/chip-group';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { sizes, spacing } from '@/theme';
import { describeItemColors, primaryPhoto, type ClothingItem } from '@/core';

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
          accessibilityLabel={`Edit ${describeItemColors(item.colors)} ${item.category}`}
          style={({ pressed }) => [styles.cell, pressed && styles.pressed]}>
          <ThemedView type="surface" style={styles.tile}>
            <PrimaryImage item={item} resolveImageUri={resolveImageUri} />
          </ThemedView>
          <ThemedText type="small" numberOfLines={1}>
            {capitalize(item.category)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {describeItemColors(item.colors)}
          </ThemedText>
        </Pressable>
      )}
    />
  );
}

/** The item's primary photo (the one picked with "Make primary"; the front by default). */
function PrimaryImage({ item, resolveImageUri }: { item: ClothingItem; resolveImageUri: (ref: string) => string }) {
  const photo = primaryPhoto(item.photos);
  if (!photo) return null;
  return <Image source={{ uri: resolveImageUri(photo.path) }} style={styles.image} contentFit="cover" />;
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: sizes.bottomTabInset + spacing.lg,
    gap: spacing.lg,
  },
  row: { gap: spacing.lg },
  // Fixed fraction keeps the last row's cells the same width as full rows.
  cell: { width: `${100 / COLUMNS - 4}%`, gap: spacing.xxs },
  tile: { aspectRatio: 1, borderRadius: spacing.sm, overflow: 'hidden' },
  image: { flex: 1 },
  pressed: { opacity: 0.7 },
});
