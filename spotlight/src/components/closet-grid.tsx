import { Image } from 'expo-image';
import { FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { closetCellWidth, closetGridLook, closetTileBackground, CLOSET_COLUMNS } from '@/components/closet/closet-grid-style';
import { describeClosetTile, primaryPhoto, type ClothingItem } from '@/core';
import { useTheme } from '@/hooks/use-theme';

interface ClosetGridProps {
  items: ClothingItem[];
  resolveImageUri: (ref: string) => string;
  onPressItem: (item: ClothingItem) => void;
  /** Shown instead of the grid when `items` is empty (e.g. no search results). */
  emptyMessage?: string;
  /** Extra space under the last row for whatever covers the bottom (the tab bar: `useBottomTabInset`). */
  bottomInset?: number;
}

/** Two columns of photo tiles with the category in serif and the colors underneath. */
export function ClosetGrid({ items, resolveImageUri, onPressItem, emptyMessage, bottomInset = 0 }: ClosetGridProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const look = closetGridLook(theme);
  const cellWidth = closetCellWidth(theme, width);

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      numColumns={CLOSET_COLUMNS}
      contentContainerStyle={[look.content, { paddingBottom: bottomInset + theme.spacing.xl }]}
      columnWrapperStyle={look.row}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        emptyMessage ? (
          <Text style={look.message} accessibilityRole="text">
            {emptyMessage}
          </Text>
        ) : undefined
      }
      renderItem={({ item, index }) => {
        const tile = describeClosetTile(item);
        return (
          <Pressable
            onPress={() => onPressItem(item)}
            accessibilityRole="button"
            accessibilityLabel={tile.accessibilityLabel}
            accessibilityHint="Shows the item's photos and details"
            style={({ pressed }) => [closetGridLook(theme, { pressed }).cell, { width: cellWidth }]}>
            <View style={[look.photo, { backgroundColor: closetTileBackground(theme, index) }]}>
              <PrimaryImage item={item} resolveImageUri={resolveImageUri} />
            </View>
            <Text style={look.name} numberOfLines={1}>
              {tile.name}
            </Text>
            <Text style={look.meta} numberOfLines={1}>
              {tile.meta}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

/** The item's primary photo (the one picked with "Make primary"; the front by default). */
function PrimaryImage({ item, resolveImageUri }: { item: ClothingItem; resolveImageUri: (ref: string) => string }) {
  const photo = primaryPhoto(item.photos);
  if (!photo) return null;
  return <Image source={{ uri: resolveImageUri(photo.path) }} style={{ flex: 1 }} contentFit="cover" />;
}
