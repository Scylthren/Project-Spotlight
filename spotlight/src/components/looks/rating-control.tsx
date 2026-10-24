import { SymbolView } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';

import { RATING_TEXT, type LookRating } from '@/core';
import { useTheme } from '@/hooks/use-theme';

import { lookActionsLook, ratingButtonLook } from './looks-style';

/** SF Symbols on iOS, Material Symbols on Android and web (same pairing as the tab icons). */
const ICONS = {
  up: { ios: 'hand.thumbsup', android: 'thumb_up', web: 'thumb_up' },
  down: { ios: 'hand.thumbsdown', android: 'thumb_down', web: 'thumb_down' },
} as const;

export const RATING_LABELS: Readonly<Record<LookRating, string>> = { up: 'Thumbs up', down: 'Thumbs down' };

interface RatingControlProps {
  value: LookRating | null;
  onRate: (rating: LookRating) => void;
  /** Names the look for screen readers ("look 1"). */
  subject: string;
  /** Read as the hint on an unsaved look: rating it saves it. */
  savesLook?: boolean;
}

/** Thumbs up and down. The selected one is ink-filled; tapping it again clears it (D6: stored only). */
export function RatingControl({ value, onRate, subject, savesLook = false }: RatingControlProps) {
  const theme = useTheme();
  const styles = lookActionsLook(theme);
  return (
    <View style={styles.ratingRow}>
      <Text style={styles.ratingLabel}>{value ? RATING_TEXT[value] : 'Rate this look'}</Text>
      {(['up', 'down'] as const).map((rating) => {
        const selected = value === rating;
        const idle = ratingButtonLook(theme, { selected, pressed: false });
        return (
          <Pressable
            key={rating}
            accessibilityRole="button"
            accessibilityLabel={`${RATING_LABELS[rating]} for ${subject}`}
            accessibilityState={{ selected }}
            accessibilityHint={selected ? 'Clears the rating' : savesLook ? 'Saves the look to your Lookbook with this rating' : undefined}
            onPress={() => onRate(rating)}
            style={({ pressed }) => ratingButtonLook(theme, { selected, pressed }).container}>
            <SymbolView
              name={ICONS[rating]}
              size={theme.sizes.ratingIconSize}
              tintColor={idle.iconColor}
              fallback={<Text style={{ ...theme.typography.chip, color: idle.iconColor }}>{rating === 'up' ? 'Up' : 'Down'}</Text>}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
