import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Chip, Swatch } from '@/components/ui';
import { backChevronLook } from '@/components/ui/screen-header-style';
import { describeItemDetail, photoAngles, selectedAngle, type ClothingItem } from '@/core';
import { useTheme } from '@/hooks/use-theme';

import { angleTabAccessibility, angleTabLook, itemDetailLook } from './item-detail-style';

interface ItemDetailViewProps {
  item: ClothingItem;
  resolveImageUri: (ref: string) => string;
  onBack: () => void;
  onEdit: () => void;
  /** Safe-area insets: the photo runs under the status bar. */
  topInset: number;
  bottomInset: number;
}

/** Read-only item screen (Gate 1 fields): photos by angle, colors, style tags, seasons. */
export function ItemDetailView({ item, resolveImageUri, onBack, onEdit, topInset, bottomInset }: ItemDetailViewProps) {
  const theme = useTheme();
  const look = itemDetailLook(theme, topInset);
  const detail = describeItemDetail(item);
  const angles = photoAngles(item.photos);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const angle = selectedAngle(angles, selectedId, item.photos);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingBottom: bottomInset + theme.spacing.xxl }}>
      <View style={look.photoArea}>
        {angle ? (
          <Image
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${angle.label} photo of the ${detail.title.toLowerCase()}`}
            source={{ uri: resolveImageUri(angle.path) }}
            style={look.photo}
            contentFit="contain"
          />
        ) : null}
        <View style={look.overlayRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            style={({ pressed }) => (pressed ? look.overlayButtonPressed : look.overlayButton)}>
            <View style={backChevronLook(theme)} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit item"
            onPress={onEdit}
            style={({ pressed }) => (pressed ? look.overlayButtonPressed : look.overlayButton)}>
            <Text style={look.editLabel}>Edit</Text>
          </Pressable>
        </View>
        {angles.length > 1 ? (
          <View style={look.angleRow} accessibilityRole="tablist" accessibilityLabel="Photo angle">
            {angles.map((a) => {
              const selected = a.photoId === angle?.photoId;
              const tab = angleTabLook(theme, selected);
              return (
                <Pressable
                  key={a.photoId}
                  {...angleTabAccessibility(a.label, selected)}
                  onPress={() => setSelectedId(a.photoId)}
                  hitSlop={tab.hitSlop}
                  style={tab.container}>
                  <View style={tab.underline}>
                    <Text style={tab.label}>{a.label}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
      <View style={look.body}>
        <Text accessibilityRole="header" style={look.title}>
          {detail.title}
        </Text>
        {detail.subtitle ? <Text style={look.subtitle}>{detail.subtitle}</Text> : null}
        <View style={look.row} accessible accessibilityLabel={detail.colorsAccessibilityLabel}>
          {detail.colors.map((c) => (
            <Swatch key={c.paletteId} hex={c.hex} name={c.name} />
          ))}
        </View>
        <View style={look.row}>
          {detail.tags.map((tag) => (
            <Chip key={tag} variant="styleTag" label={tag} />
          ))}
          <View style={look.seasons} accessible accessibilityLabel={detail.seasonsAccessibilityLabel}>
            <Text style={look.seasonsText}>{detail.seasonsText}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
