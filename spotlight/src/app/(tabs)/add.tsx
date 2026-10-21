import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormButton } from '@/components/form-button';
import { ItemFormFields } from '@/components/item-form-fields';
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Add item</ThemedText>
          <ItemFormFields
            fields={form.fields}
            photoUri={form.photoUri}
            photoHint={form.photoUri ? 'Take or choose another photo to change it' : 'Add a photo of the item'}
            savedTags={form.savedTags}
            onDeleteSavedTag={form.deleteSavedTag}
            busy={form.busy}
          />
          <FormButton
            label={form.saving ? 'Saving...' : 'Save item'}
            onPress={onSave}
            disabled={form.busy || form.fields.pickingPhoto}
          />
        </ScrollView>
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
