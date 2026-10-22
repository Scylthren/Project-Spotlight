import { Text, View } from 'react-native';

import { connectionStatusMessage } from '@/ai';
import { Button, SectionLabel, TextField } from '@/components/ui';
import { useDevBackend, type DevBackendServices, type SavedTokenState } from '@/hooks/use-dev-backend';
import { useTheme } from '@/hooks/use-theme';

const SAVED_TEXT: Record<SavedTokenState, string> = {
  loading: 'Checking for a saved token…',
  saved: 'A token is saved on this device.',
  none: 'No token saved on this device.',
  unavailable: 'Secure storage is not available here.',
};

/**
 * Development builds only (the Me tab renders it under `__DEV__`): enter the
 * dev backend token and test the round trip to the tag-item function. The
 * saved token is never shown again; paste a new one to replace it.
 */
export function BackendSection({ services }: { services: DevBackendServices }) {
  const { colors, spacing, typography } = useTheme();
  const backend = useDevBackend(services);
  const canSave = !backend.busy && backend.draft.trim().length > 0;

  return (
    <View style={{ gap: spacing.md }}>
      <SectionLabel>Backend</SectionLabel>
      <Text style={{ ...typography.body, color: colors.textBodySecondary }}>{SAVED_TEXT[backend.saved]}</Text>
      <TextField
        label="Dev token"
        value={backend.draft}
        onChangeText={backend.changeDraft}
        placeholder={backend.saved === 'saved' ? 'Paste a new token to replace it' : 'Paste the token'}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="none"
        returnKeyType="done"
        onSubmitEditing={backend.save}
        error={backend.inputError}
        disabled={backend.busy}
      />
      <Button label="Save token" onPress={backend.save} disabled={!canSave} />
      {backend.saved === 'saved' ? (
        <Button variant="text" label="Clear token" onPress={backend.clear} disabled={backend.busy} />
      ) : null}
      <Button
        variant="outline"
        label={backend.busy && backend.status === null ? 'Working…' : 'Test connection'}
        onPress={backend.test}
        disabled={backend.busy}
      />
      {backend.status ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ ...typography.body, color: backend.status === 'ok' ? colors.text : colors.danger }}>
          {connectionStatusMessage(backend.status)}
        </Text>
      ) : null}
    </View>
  );
}
