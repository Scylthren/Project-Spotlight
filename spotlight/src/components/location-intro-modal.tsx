import { Modal, Text, View } from 'react-native';

import { FormButton } from '@/components/form-button';
import { LOCATION_INTRO } from '@/data/weather-messages';
import type { LocationIntroState } from '@/hooks/use-style-prompt';
import { useTheme } from '@/hooks/use-theme';

import { cameraIntroLook } from './camera-intro-modal';

/**
 * Explains why Spotlight wants the location before the system prompt, in
 * the camera intro's style (Permission.dc.html). "Allow location" triggers
 * the real prompt; "Not now" goes on without it (the home city, if any).
 * There is deliberately no "Don't Allow" button (App Review).
 */
export function LocationIntroModal({ intro }: { intro: LocationIntroState }) {
  const theme = useTheme();
  const look = cameraIntroLook(theme);
  return (
    <Modal visible={intro.visible} transparent animationType="fade" onRequestClose={intro.notNow}>
      <View style={look.backdrop}>
        <View style={look.scrim} accessible={false} importantForAccessibility="no" />
        <View style={look.card} accessibilityViewIsModal>
          <Text style={look.title} accessibilityRole="header">
            {LOCATION_INTRO.title}
          </Text>
          <Text style={look.body}>{LOCATION_INTRO.body}</Text>
          <View style={look.buttons}>
            <FormButton label={intro.requesting ? 'Waiting...' : LOCATION_INTRO.allow} onPress={intro.allow} disabled={intro.requesting} />
            <FormButton label={LOCATION_INTRO.notNow} variant="text" onPress={intro.notNow} disabled={intro.requesting} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
