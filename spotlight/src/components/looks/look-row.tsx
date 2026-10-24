import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PieceTile } from '@/components/style/look-photos';
import { savedLookMetaText, savedLookTitle, splitLookPieces, type LookbookEntry } from '@/core';
import { useTheme } from '@/hooks/use-theme';

import { lookbookLook } from './looks-style';

/** How many photos a row shows; the rest are counted ("+2"). */
export const ROW_PHOTO_LIMIT = 4;

interface LookRowProps {
  entry: LookbookEntry;
  now: Date;
  resolveImageUri: (ref: string) => string;
  onOpen: (id: string) => void;
}

/**
 * One saved look in the Lookbook: its photos side by side (main pieces
 * first, at most four), the request in italic serif, and the date, occasion
 * and rating. Memoized and light (no work beyond slicing the pieces) so long
 * lists stay smooth.
 */
export const LookRow = memo(function LookRow({ entry, now, resolveImageUri, onOpen }: LookRowProps) {
  const theme = useTheme();
  const styles = lookbookLook(theme);
  const { main, small } = splitLookPieces(entry.pieces);
  const ordered = [...main, ...small];
  const shown = ordered.slice(0, ROW_PHOTO_LIMIT);
  const more = ordered.length - shown.length;
  const title = savedLookTitle(entry.look);
  const meta = savedLookMetaText(entry.look, now);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta}`}
      accessibilityHint="Opens the look"
      onPress={() => onOpen(entry.look.id)}
      style={({ pressed }) => styles.row(pressed)}>
      <View style={styles.photos}>
        {shown.map((piece) => (
          <PieceTile key={piece.id} piece={piece} style={styles.photo} resolveImageUri={resolveImageUri} removedText="Removed" />
        ))}
        {more > 0 ? <Text style={[styles.meta, { alignSelf: 'center' }]}>{`+${more}`}</Text> : null}
      </View>
      <Text style={styles.request} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.meta}>{meta}</Text>
    </Pressable>
  );
});
