import { Image } from 'expo-image';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/ui';
import {
  lookNumberText,
  lookOfText,
  lookPiecesText,
  pieceText,
  primaryPhoto,
  REMOVED_PIECE_TEXT,
  splitLookPieces,
  type LookPiece,
} from '@/core';
import type { StyleLook } from '@/data/style-session';
import { useTheme } from '@/hooks/use-theme';

import { lookCardLook, lookPhotoHeight } from './style-look';

interface LookCardProps {
  look: StyleLook;
  /** 1-based position on the screen. */
  position: number;
  total: number;
  resolveImageUri: (ref: string) => string;
  onRestyle: () => void;
}

/**
 * One suggested look (Results.dc.html, without Save and Swap piece): "01"
 * and "Look one of three", the pieces' photos (main pieces large; shoes and
 * accessories in a smaller row; no mockup, slice 2 decision), the line
 * naming them, "Why it works", and Restyle with its own loading state and
 * message.
 */
export function LookCard({ look, position, total, resolveImageUri, onRestyle }: LookCardProps) {
  const theme = useTheme();
  const styles = lookCardLook(theme, { first: position === 1 });
  const { main, small } = splitLookPieces(look.pieces);
  const mainHeight = lookPhotoHeight(theme, main.length);
  const ofText = lookOfText(position, total);

  return (
    <View style={styles.card}>
      <View style={styles.numberRow} accessibilityRole="header" accessible accessibilityLabel={ofText}>
        <Text style={styles.number}>{lookNumberText(position)}</Text>
        <Text style={styles.of}>{ofText}</Text>
      </View>

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

      <Text style={styles.pieces}>{lookPiecesText(look.pieces)}</Text>
      <Text style={styles.rationale}>
        <Text style={styles.rationaleLead}>{'Why it works — '}</Text>
        {look.rationale}
      </Text>

      <Button
        variant="outline"
        label={look.restyling ? 'Restyling...' : 'Restyle'}
        accessibilityLabel={look.restyling ? `Restyling look ${position}` : `Restyle look ${position}`}
        accessibilityHint="Replaces this look with a different one for the same request"
        onPress={onRestyle}
        disabled={look.restyling}
      />
      {look.restyleNotice ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          {look.restyleNotice}
        </Text>
      ) : null}
    </View>
  );
}

function PieceTile({
  piece,
  style,
  resolveImageUri,
}: {
  piece: LookPiece;
  style: StyleProp<ViewStyle>;
  resolveImageUri: (ref: string) => string;
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
          <Text style={styles.removedText}>{REMOVED_PIECE_TEXT}</Text>
        </View>
      ) : null}
    </View>
  );
}
