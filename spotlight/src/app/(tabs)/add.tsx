import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormButton } from '@/components/form-button';
import { ItemFormFields } from '@/components/item-form-fields';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
import { KeyboardDismissArea } from '@/components/keyboard-dismiss-area';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useAddItemForm } from '@/hooks/use-add-item-form';
import { useIsMounted } from '@/hooks/use-is-mounted';

export default function AddItemScreen() {
  const form = useAddItemForm();
  const isMounted = useIsMounted();

  async function onSave() {
    if ((await form.save()) && isMounted()) router.navigate('/');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Under the tabs the screen starts at the top of the window: no offset. */}
        <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardVerticalOffset={0}>
          <ThemedText type="subtitle">Add item</ThemedText>
          <ItemFormFields
            fields={form.fields}
            emptyPhotoHint="Add a photo of the front of the item"
            savedTags={form.savedTags}
            onDeleteSavedTag={form.deleteSavedTag}
            busy={form.busy}
          />
          <KeyboardDismissArea>
            <FormButton
              label={form.saving ? 'Saving...' : 'Save item'}
              onPress={onSave}
              disabled={form.busy || form.fields.pickingPhoto}
            />
          </KeyboardDismissArea>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
});
