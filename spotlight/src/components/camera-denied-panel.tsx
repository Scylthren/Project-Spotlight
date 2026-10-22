import { useEffect } from 'react';
import { AccessibilityInfo, Platform, Text, View } from 'react-native';

import { FormButton } from '@/components/form-button';
import { itemFormLook } from '@/components/item-form-style';
import { CAMERA_ACCESS_TEXT, deniedPanelAction } from '@/core';
import type { CameraAccess } from '@/hooks/use-camera-access';
import { useTheme } from '@/hooks/use-theme';

/**
 * Shown in the form when camera access is off. Offers Settings, or the real
 * prompt when the OS can still ask (Android after one refusal), plus the
 * photo library. Closes by itself when access is turned on (the permission
 * is re-checked when the app returns to the foreground).
 *
 * Screen readers: Android reads the panel through its live region; iOS has
 * no live regions, so the title and body are announced when it appears.
 */
export function CameraDeniedPanel({ camera, disabled }: { camera: CameraAccess; disabled: boolean }) {
  const theme = useTheme();
  const form = itemFormLook(theme);
  const shown = camera.state.surface === 'denied';
  const askAgain = deniedPanelAction(camera.state.permission) === 'ask-again';
  const body = askAgain ? CAMERA_ACCESS_TEXT.deniedBodyAskAgain : CAMERA_ACCESS_TEXT.deniedBodySettings;

  useEffect(() => {
    if (shown && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(`${CAMERA_ACCESS_TEXT.deniedTitle}. ${body}`);
    }
  }, [shown, body]);

  if (!shown) return null;
  const { requesting } = camera.state;

  return (
    <View style={form.panel} accessibilityLiveRegion="polite">
      <Text
        style={{ ...theme.typography.itemNameSmall, fontFamily: theme.fonts.serif.semiBold, color: theme.colors.text }}
        accessibilityRole="header">
        {CAMERA_ACCESS_TEXT.deniedTitle}
      </Text>
      <Text style={form.caption}>{body}</Text>
      <View style={form.buttons}>
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
        <FormButton label={CAMERA_ACCESS_TEXT.notNow} variant="text" onPress={camera.notNow} disabled={requesting} />
      </View>
    </View>
  );
}
