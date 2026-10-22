import { router } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormButton } from '@/components/form-button';
import { ItemFormFields } from '@/components/item-form-fields';
import { itemFormLook } from '@/components/item-form-style';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
import { KeyboardDismissArea } from '@/components/keyboard-dismiss-area';
import { ScreenHeader } from '@/components/ui';
import { useAddItemForm } from '@/hooks/use-add-item-form';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { useTheme } from '@/hooks/use-theme';

export default function AddItemScreen() {
  const theme = useTheme();
  const form = useAddItemForm();
  const isMounted = useIsMounted();
  const look = itemFormLook(theme);

  async function onSave() {
    if ((await form.save()) && isMounted()) router.navigate('/');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      {/* Under the tabs the screen starts at the top of the window: no offset. */}
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingBottom: theme.sizes.bottomTabInset + theme.spacing.xxl }}
        keyboardVerticalOffset={0}>
        <ScreenHeader variant="step" title="New piece" />
        <View style={look.body}>
          <ItemFormFields
            fields={form.fields}
            emptyPhotoHint="Add a photo of the front of the item"
            savedTags={form.savedTags}
            onDeleteSavedTag={form.deleteSavedTag}
            busy={form.busy}
          />
          <KeyboardDismissArea>
            <FormButton
              label={form.saving ? 'Saving...' : 'Save to closet'}
              onPress={onSave}
              disabled={form.busy || form.fields.pickingPhoto}
            />
          </KeyboardDismissArea>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
