import { useEffect } from 'react';
import { Modal, Platform, Text, View } from 'react-native';

import { FormButton } from '@/components/form-button';
import { CAMERA_ACCESS_TEXT } from '@/core';
import type { CameraAccess } from '@/hooks/use-camera-access';
import { useTheme } from '@/hooks/use-theme';
import type { Theme } from '@/theme';

/** Permission.dc.html: a square card over a dimmed backdrop, serif title, three ways out. */
export function cameraIntroLook(theme: Theme) {
  const { colors, fonts, opacity, sizes, spacing, typography } = theme;
  return {
    backdrop: { flex: 1, justifyContent: 'center', padding: sizes.screenPadding } as const,
    scrim: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: colors.scrim,
      opacity: opacity.scrim,
    } as const,
    card: {
      backgroundColor: colors.background,
      paddingTop: spacing.xxl + spacing.xs,
      paddingHorizontal: spacing.xxl,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    } as const,
    title: { ...typography.headline, fontFamily: fonts.serif.semiBold, color: colors.text },
    body: { ...typography.bodyLarge, color: colors.textBodySecondary },
    buttons: { gap: spacing.sm, marginTop: spacing.sm } as const,
  };
}

/**
 * Explains why Spotlight wants the camera before the system prompt. One
 * button triggers the real prompt; "Not now" and the library are the other
 * ways out. There is deliberately no "Don't Allow" button (App Review).
 */
export function CameraIntroModal({ camera }: { camera: CameraAccess }) {
  const theme = useTheme();
  const look = cameraIntroLook(theme);
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
      <View style={look.backdrop}>
        <View style={look.scrim} accessible={false} importantForAccessibility="no" />
        <View style={look.card} accessibilityViewIsModal>
          <Text style={look.title} accessibilityRole="header">
            {CAMERA_ACCESS_TEXT.introTitle}
          </Text>
          <Text style={look.body}>{CAMERA_ACCESS_TEXT.introBody}</Text>
          <View style={look.buttons}>
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
            <FormButton label={CAMERA_ACCESS_TEXT.notNow} variant="text" onPress={camera.notNow} disabled={requesting} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
