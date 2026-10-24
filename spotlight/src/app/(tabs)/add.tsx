import { router } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormButton } from '@/components/form-button';
import { ImportEntry } from '@/components/import/import-entry';
import { ItemFormFields } from '@/components/item-form-fields';
import { itemFormLook } from '@/components/item-form-style';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
import { KeyboardDismissArea } from '@/components/keyboard-dismiss-area';
import { ScreenHeader } from '@/components/ui';
import { useAddItemForm } from '@/hooks/use-add-item-form';
import { useImportEntry } from '@/hooks/use-import-entry';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useTheme } from '@/hooks/use-theme';

export default function AddItemScreen() {
  const theme = useTheme();
  const bottomInset = useBottomTabInset();
  const form = useAddItemForm();
  const isMounted = useIsMounted();
  const look = itemFormLook(theme);
  const importer = useImportEntry();
  // One system picker at a time, and no import while the form saves.
  const locked = form.busy || importer.picking;

  async function onSave() {
    if ((await form.save()) && isMounted()) router.navigate('/');
  }

  async function onImport() {
    if ((await importer.start()) && isMounted()) router.push('/import');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      {/* Under the tabs the screen starts at the top of the window: no offset. */}
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingBottom: bottomInset + theme.spacing.xxl }}
        keyboardVerticalOffset={0}>
        <ScreenHeader variant="step" title="New piece" />
        <View style={look.body}>
          {form.fields.photos.length === 0 ? (
            <ImportEntry
              onImport={() => void onImport()}
              disabled={locked || form.fields.pickingPhoto}
              problem={importer.problem}
            />
          ) : null}
          <ItemFormFields
            fields={form.fields}
            emptyPhotoHint="Add a photo of the front of the item"
            savedTags={form.savedTags}
            onDeleteSavedTag={form.deleteSavedTag}
            busy={locked}
          />
          <KeyboardDismissArea>
            <FormButton
              label={form.saving ? 'Saving...' : 'Save to closet'}
              onPress={onSave}
              disabled={locked || form.fields.pickingPhoto}
            />
          </KeyboardDismissArea>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
