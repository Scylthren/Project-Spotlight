import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { ResultsHeader } from '@/components/style/results-view';
import { LookPhotos } from '@/components/style/look-photos';
import { lookCardLook } from '@/components/style/style-look';
import { Button } from '@/components/ui';
import {
  lookPiecesText,
  savedDateText,
  savedLookTitle,
  SEASON_LABELS,
  type LookbookEntry,
  type LookRating,
  type Occasion,
} from '@/core';
import { useTheme } from '@/hooks/use-theme';

import { lookActionsLook, savedLookLook } from './looks-style';
import { OccasionPicker } from './occasion-picker';
import { RatingControl } from './rating-control';

interface SavedLookViewProps {
  status: 'loading' | 'ready' | 'failed';
  /** Null once the look is gone (deleted, or no piece left). */
  entry: LookbookEntry | null;
  now: Date;
  resolveImageUri: (ref: string) => string;
  onBack: () => void;
  onRate: (rating: LookRating) => void;
  onPickOccasion: (occasion: Occasion) => void;
  /** Asks first, then deletes. */
  onDelete: () => void;
  /** A failed change for this look, else null. */
  error: string | null;
  bottomInset: number;
}

/** One saved look: its photos, the pieces line, why it works, thumbs, occasion and Delete. */
export function SavedLookView({
  status,
  entry,
  now,
  resolveImageUri,
  onBack,
  onRate,
  onPickOccasion,
  onDelete,
  error,
  bottomInset,
}: SavedLookViewProps) {
  const theme = useTheme();
  const styles = savedLookLook(theme);
  const card = lookCardLook(theme, { first: true });
  const actions = lookActionsLook(theme);

  if (!entry) {
    return (
      <View style={{ flex: 1 }}>
        <ResultsHeader title="Saved look" subtitle={null} onBack={onBack} backLabel="Back to Lookbook" />
        <View style={styles.state}>
          {status === 'loading' ? (
            <ActivityIndicator color={styles.spinnerColor} accessibilityLabel="Loading the look" />
          ) : (
            <Text style={styles.message}>
              {status === 'failed' ? 'Could not load this look.' : 'This look is no longer in your Lookbook.'}
            </Text>
          )}
        </View>
      </View>
    );
  }

  const { look, pieces, seasons } = entry;
  const subtitle = [`Saved ${savedDateText(look.createdAt, now)}`, ...seasons.map((s) => SEASON_LABELS[s])].join(' · ');
  return (
    <View style={{ flex: 1 }}>
      <ResultsHeader title={savedLookTitle(look)} subtitle={subtitle} onBack={onBack} backLabel="Back to Lookbook" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: bottomInset }]}>
        <LookPhotos pieces={pieces} resolveImageUri={resolveImageUri} />
        <Text style={card.pieces}>{lookPiecesText(pieces)}</Text>
        <Text style={card.rationale}>
          <Text style={card.rationaleLead}>{'Why it works — '}</Text>
          {look.rationale}
        </Text>
        <RatingControl value={look.rating} onRate={onRate} subject="this look" />
        <OccasionPicker value={look.occasion} onPick={onPickOccasion} />
        {error ? (
          <Text style={actions.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <View style={styles.deleteBlock}>
          <Button variant="outline" label="Delete look" accessibilityHint="Asks first. Your pieces stay in your closet." onPress={onDelete} />
        </View>
      </ScrollView>
    </View>
  );
}
