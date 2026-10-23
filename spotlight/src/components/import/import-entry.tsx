import { Linking, Text, View } from 'react-native';

import { FormButton } from '@/components/form-button';
import { itemFormLook } from '@/components/item-form-style';
import { SectionLabel } from '@/components/ui';
import { IMPORT_PHOTO_LIMIT } from '@/core';
import type { PickProblem } from '@/data/photo-picker';
import { useTheme } from '@/hooks/use-theme';

interface ImportEntryProps {
  onImport: () => void;
  disabled: boolean;
  problem: PickProblem | null;
}

/** "Several pieces?" on the Add screen: starts a multi-select import (Gate 2 slice 6). */
export function ImportEntry({ onImport, disabled, problem }: ImportEntryProps) {
  const theme = useTheme();
  const form = itemFormLook(theme);
  return (
    <View style={form.panel}>
      <SectionLabel>Several pieces?</SectionLabel>
      <Text style={form.caption}>
        {`Choose up to ${IMPORT_PHOTO_LIMIT} photos from your library. Each photo becomes one piece, and you check them all before anything is saved.`}
      </Text>
      <FormButton label="Import from library" variant="secondary" onPress={onImport} disabled={disabled} />
      {problem ? (
        <View accessibilityLiveRegion="polite" style={form.section}>
          <Text style={form.error}>{problem.message}</Text>
          {problem.suggestSettings ? (
            <FormButton label="Open Settings" variant="text" onPress={() => void Linking.openSettings()} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
