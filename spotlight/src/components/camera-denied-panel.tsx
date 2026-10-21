import { StyleSheet } from 'react-native';

import { FormButton } from '@/components/form-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { CAMERA_ACCESS_TEXT, deniedPanelAction } from '@/core';
import type { CameraAccess } from '@/hooks/use-camera-access';

/**
 * Shown in the form when camera access is off. Offers Settings, or the real
 * prompt when the OS can still ask (Android after one refusal), plus the
 * photo library. Closes by itself when access is turned on (the permission
 * is re-checked when the app returns to the foreground).
 */
export function CameraDeniedPanel({ camera, disabled }: { camera: CameraAccess; disabled: boolean }) {
  if (camera.state.surface !== 'denied') return null;
  const askAgain = deniedPanelAction(camera.state.permission) === 'ask-again';
  const { requesting } = camera.state;

  return (
    <ThemedView type="backgroundElement" style={styles.panel} accessibilityLiveRegion="polite">
      <ThemedText type="smallBold" accessibilityRole="header">
        {CAMERA_ACCESS_TEXT.deniedTitle}
      </ThemedText>
      <ThemedText type="small">
        {askAgain ? CAMERA_ACCESS_TEXT.deniedBodyAskAgain : CAMERA_ACCESS_TEXT.deniedBodySettings}
      </ThemedText>
      <FormButton
        label={askAgain ? CAMERA_ACCESS_TEXT.askAgain : CAMERA_ACCESS_TEXT.openSettings}
        onPress={askAgain ? camera.allow : camera.openSettings}
        disabled={disabled || requesting}
      />
      <FormButton
        label={CAMERA_ACCESS_TEXT.library}
        variant="secondary"
        onPress={camera.chooseLibrary}
        disabled={disabled || requesting}
      />
      <FormButton label={CAMERA_ACCESS_TEXT.notNow} variant="secondary" onPress={camera.notNow} disabled={requesting} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
});
