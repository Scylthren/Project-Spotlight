import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { confirmDelete } from '@/components/confirm-delete';
import { FormButton } from '@/components/form-button';
import { ItemFormFields } from '@/components/item-form-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { ClothingItem } from '@/core';
import { useClosetItem } from '@/hooks/use-closet-item';
import { useEditItemForm } from '@/hooks/use-edit-item-form';
import { useIsMounted } from '@/hooks/use-is-mounted';

export default function ItemScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const state = useClosetItem(id ?? '');

  if (state.status === 'loading') return <ActivityIndicator style={styles.center} />;
  if (state.status !== 'ready') {
    return (
      <ThemedView style={styles.center}>
        <ThemedText style={styles.message}>
          {state.status === 'missing' ? 'This item is no longer in your closet.' : 'Could not load this item.'}
        </ThemedText>
        <View style={styles.backButton}>
          <FormButton label="Back to closet" variant="secondary" onPress={leaveScreen} />
        </View>
      </ThemedView>
    );
  }
  // Keyed so the form starts fresh from the stored item.
  return <EditItem key={state.item.id} item={state.item} />;
}

/** Back to the previous screen, or to the closet if this screen was opened directly (e.g. a deep link). */
function leaveScreen() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function EditItem({ item }: { item: ClothingItem }) {
  const form = useEditItemForm(item);
  // The user may go back while a save or delete runs; it finishes, but must not navigate again.
  const isMounted = useIsMounted();

  async function onSave() {
    if ((await form.save()) && isMounted()) leaveScreen();
  }

  async function onDelete() {
    if ((await form.remove(() => confirmDelete(`this ${item.category}`))) && isMounted()) leaveScreen();
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled">
        <ItemFormFields
          fields={form.fields}
          emptyPhotoHint="Add a photo of the front of the item"
          savedTags={form.savedTags}
          onDeleteSavedTag={form.deleteSavedTag}
          busy={form.busy}
        />
        <FormButton
          label={form.busy ? 'Working...' : 'Save changes'}
          onPress={onSave}
          disabled={form.busy || form.fields.pickingPhoto}
        />
        <FormButton label="Delete item" variant="destructive" onPress={onDelete} disabled={form.busy} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  message: { textAlign: 'center' },
  backButton: { alignSelf: 'stretch' },
});
