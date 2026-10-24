import { Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { OCCASIONS, OCCASION_LABELS, type Occasion } from '@/core';
import { useTheme } from '@/hooks/use-theme';

import { lookActionsLook } from './looks-style';

interface OccasionPickerProps {
  value: Occasion | null;
  onPick: (occasion: Occasion) => void;
}

/** The fixed occasions (D11) as chips; one at most, tapping the chosen one clears it. Optional. */
export function OccasionPicker({ value, onPick }: OccasionPickerProps) {
  const theme = useTheme();
  const styles = lookActionsLook(theme);
  return (
    <View style={styles.occasionBlock}>
      <Text style={styles.occasionLabel} accessibilityRole="header">
        Occasion
      </Text>
      <Text style={styles.occasionHint}>Optional. Helps you filter your Lookbook.</Text>
      <View style={styles.chips} accessibilityLabel="Occasion">
        {OCCASIONS.map((occasion) => (
          <Chip
            key={occasion}
            label={OCCASION_LABELS[occasion]}
            casing="sentence"
            selected={value === occasion}
            onPress={() => onPick(occasion)}
            accessibilityHint={value === occasion ? 'Clears the occasion' : undefined}
          />
        ))}
      </View>
    </View>
  );
}
