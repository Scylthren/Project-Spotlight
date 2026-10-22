import { useEffect } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';

import { FormButton } from '@/components/form-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { spacing } from '@/theme';
import { CAMERA_ACCESS_TEXT } from '@/core';
import type { CameraAccess } from '@/hooks/use-camera-access';

/**
 * Explains why Spotlight wants the camera before the system prompt. One
 * button triggers the real prompt; "Not now" and the library are the other
 * ways out. There is deliberately no "Don't Allow" button (App Review).
 */
export function CameraIntroModal({ camera }: { camera: CameraAccess }) {
  const visible = camera.state.surface === 'intro';
  const { requesting } = camera.state;
  const { introClosed } = camera;

  // iOS reports the end of the closing animation through `onDismiss` (a
  // picker cannot be presented before it). Android has no `onDismiss` and
  // needs no wait, so it reports at once (platform-specific).
  useEffect(() => {
    if (!visible && Platform.OS !== 'ios') introClosed();
  }, [visible, introClosed]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={camera.notNow}
      onDismiss={introClosed}>
      <View style={styles.backdrop}>
        <ThemedView style={styles.card} accessibilityViewIsModal>
          <ThemedText type="subtitle" accessibilityRole="header">
            {CAMERA_ACCESS_TEXT.introTitle}
          </ThemedText>
          <ThemedText>{CAMERA_ACCESS_TEXT.introBody}</ThemedText>
          <FormButton
            label={requesting ? 'Waiting...' : CAMERA_ACCESS_TEXT.introAllow}
            onPress={camera.allow}
            disabled={requesting}
          />
          <FormButton
            label={CAMERA_ACCESS_TEXT.library}
            variant="secondary"
            onPress={camera.chooseLibrary}
            disabled={requesting}
          />
          <FormButton label={CAMERA_ACCESS_TEXT.notNow} variant="secondary" onPress={camera.notNow} disabled={requesting} />
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  card: { borderRadius: spacing.lg, padding: spacing.xxl, gap: spacing.lg },
});
