import { Text, View } from 'react-native';

import { OccasionPicker } from '@/components/looks/occasion-picker';
import { RatingControl } from '@/components/looks/rating-control';
import { lookActionsLook } from '@/components/looks/looks-style';
import { Button } from '@/components/ui';
import { lookNumberText, lookOfText, lookPiecesText, type LookRating, type Occasion, type SavedLook } from '@/core';
import type { StyleLook } from '@/data/style-session';
import { useTheme } from '@/hooks/use-theme';

import { LookPhotos } from './look-photos';
import { lookCardLook } from './style-look';

/** Save, thumbs and occasion for one look on Results (slice 4). */
export interface LookSaveProps {
  /** The saved entry with these pieces, or null when the look is not saved. */
  saved: SavedLook | null;
  onSave: () => void;
  /** Rating an unsaved look saves it (human decision 2026-10-24). */
  onRate: (rating: LookRating) => void;
  onPickOccasion: (occasion: Occasion) => void;
  /** A failed save or change for this look, else null. */
  saveError: string | null;
}

interface LookCardProps extends LookSaveProps {
  look: StyleLook;
  /** 1-based position on the screen. */
  position: number;
  total: number;
  resolveImageUri: (ref: string) => string;
  onRestyle: () => void;
}

/**
 * One suggested look (Results.dc.html, without Swap piece): "01" and "Look
 * one of three", the pieces' photos (main pieces large; shoes and
 * accessories in a smaller row; slice 2 decision), the line naming them,
 * "Why it works", Save (then "Saved") and Restyle side by side, thumbs up
 * and down, and, once saved, the optional occasion.
 */
export function LookCard({
  look,
  position,
  total,
  resolveImageUri,
  onRestyle,
  saved,
  onSave,
  onRate,
  onPickOccasion,
  saveError,
}: LookCardProps) {
  const theme = useTheme();
  const styles = lookCardLook(theme, { first: position === 1 });
  const actions = lookActionsLook(theme);
  const ofText = lookOfText(position, total);

  return (
    <View style={styles.card}>
      <View style={styles.numberRow} accessibilityRole="header" accessible accessibilityLabel={ofText}>
        <Text style={styles.number}>{lookNumberText(position)}</Text>
        <Text style={styles.of}>{ofText}</Text>
      </View>

      <LookPhotos pieces={look.pieces} resolveImageUri={resolveImageUri} />

      <Text style={styles.pieces}>{lookPiecesText(look.pieces)}</Text>
      <Text style={styles.rationale}>
        <Text style={styles.rationaleLead}>{'Why it works — '}</Text>
        {look.rationale}
      </Text>

      <View style={actions.actions}>
        <View style={actions.action}>
          <Button
            variant={saved ? 'outline' : 'primary'}
            label={saved ? 'Saved' : 'Save'}
            accessibilityLabel={saved ? `Look ${position} saved` : `Save look ${position}`}
            accessibilityHint={saved ? 'This look is in your Lookbook' : 'Adds this look to your Lookbook'}
            onPress={onSave}
          />
        </View>
        <View style={actions.action}>
          <Button
            variant="outline"
            label={look.restyling ? 'Restyling...' : 'Restyle'}
            accessibilityLabel={look.restyling ? `Restyling look ${position}` : `Restyle look ${position}`}
            accessibilityHint="Replaces this look with a different one for the same request"
            onPress={onRestyle}
            disabled={look.restyling}
          />
        </View>
      </View>
      {look.restyleNotice ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          {look.restyleNotice}
        </Text>
      ) : null}

      <RatingControl value={saved?.rating ?? null} onRate={onRate} subject={`look ${position}`} savesLook={!saved} />
      {saved ? <OccasionPicker value={saved.occasion} onPick={onPickOccasion} /> : null}
      {saveError ? (
        <Text style={actions.error} accessibilityLiveRegion="polite">
          {saveError}
        </Text>
      ) : null}
    </View>
  );
}
