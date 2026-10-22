import { router, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { confirmDelete } from '@/components/confirm-delete';
import { FormButton } from '@/components/form-button';
import { ItemFormFields } from '@/components/item-form-fields';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
import { KeyboardDismissArea } from '@/components/keyboard-dismiss-area';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { spacing } from '@/theme';
import type { ClothingItem } from '@/core';
import { useClosetItem } from '@/hooks/use-closet-item';
import { useEditItemForm } from '@/hooks/use-edit-item-form';
import { useIsMounted } from '@/hooks/use-is-mounted';

/** The edit form for one item (opened from the item screen's Edit). Restyled in slice 5. */
export default function EditItemScreen() {
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

/**
 * After a delete: back to the closet, past the item screen (which would only
 * say the item is gone). Replaces this screen if the closet is not below it.
 */
function leaveToCloset() {
  router.dismissTo('/');
}

function EditItem({ item }: { item: ClothingItem }) {
  const form = useEditItemForm(item);
  // The user may go back while a save or delete runs; it finishes, but must not navigate again.
  const isMounted = useIsMounted();
  // The screen sits below the stack header (Android keyboard padding needs this).
  const headerHeight = useHeaderHeight();

  async function onSave() {
    if ((await form.save()) && isMounted()) leaveScreen();
  }

  async function onDelete() {
    if ((await form.remove(() => confirmDelete(`this ${item.category}`))) && isMounted()) leaveToCloset();
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardVerticalOffset={headerHeight}>
        <ItemFormFields
          fields={form.fields}
          emptyPhotoHint="Add a photo of the front of the item"
          savedTags={form.savedTags}
          onDeleteSavedTag={form.deleteSavedTag}
          busy={form.busy}
        />
        <KeyboardDismissArea style={styles.buttons}>
          <FormButton
            label={form.busy ? 'Working...' : 'Save changes'}
            onPress={onSave}
            disabled={form.busy || form.fields.pickingPhoto}
          />
          <FormButton label="Delete item" variant="destructive" onPress={onDelete} disabled={form.busy} />
        </KeyboardDismissArea>
      </KeyboardAwareScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: spacing.jumbo, gap: spacing.lg },
  buttons: { gap: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg },
  message: { textAlign: 'center' },
  backButton: { alignSelf: 'stretch' },
});
