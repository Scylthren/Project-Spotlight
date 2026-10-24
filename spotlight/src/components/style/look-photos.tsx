import { Image } from 'expo-image';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { pieceText, primaryPhoto, REMOVED_PIECE_TEXT, splitLookPieces, type LookPiece } from '@/core';
import { useTheme } from '@/hooks/use-theme';

import { lookCardLook, lookPhotoHeight } from './style-look';

interface LookPhotosProps {
  pieces: readonly LookPiece[];
  resolveImageUri: (ref: string) => string;
}

/**
 * A look's photos (Results and a saved look): main pieces large in one row,
 * shoes and accessories in a smaller row; a deleted piece reads "Removed
 * from closet" (D5).
 */
export function LookPhotos({ pieces, resolveImageUri }: LookPhotosProps) {
  const theme = useTheme();
  const styles = lookCardLook(theme, { first: false });
  const { main, small } = splitLookPieces(pieces);
  const mainHeight = lookPhotoHeight(theme, main.length);
  return (
    <>
      {main.length > 0 ? (
        <View style={styles.mainRow}>
          {main.map((piece) => (
            <PieceTile key={piece.id} piece={piece} style={[styles.tile, { height: mainHeight }]} resolveImageUri={resolveImageUri} />
          ))}
        </View>
      ) : null}
      {small.length > 0 ? (
        <View style={styles.smallRow}>
          {small.map((piece) => (
            <PieceTile key={piece.id} piece={piece} style={styles.smallTile} resolveImageUri={resolveImageUri} />
          ))}
        </View>
      ) : null}
    </>
  );
}

/** One piece's primary photo, or "Removed from closet". */
export function PieceTile({
  piece,
  style,
  resolveImageUri,
  removedText = REMOVED_PIECE_TEXT,
}: {
  piece: LookPiece;
  style: StyleProp<ViewStyle>;
  resolveImageUri: (ref: string) => string;
  /** Shorter text for small tiles. */
  removedText?: string;
}) {
  const theme = useTheme();
  const styles = lookCardLook(theme, { first: false });
  const photo = piece.item ? primaryPhoto(piece.item.photos) : null;
  return (
    <View style={style} accessible accessibilityRole="image" accessibilityLabel={pieceText(piece)}>
      {photo ? (
        <Image source={{ uri: resolveImageUri(photo.path) }} style={{ flex: 1 }} contentFit="cover" />
      ) : piece.item === null ? (
        <View style={styles.removed}>
          <Text style={styles.removedText}>{removedText}</Text>
        </View>
      ) : null}
    </View>
  );
}
