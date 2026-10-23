import { router, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { Text, View } from 'react-native';

import { FormButton } from '@/components/form-button';
import { ImportDraftForm } from '@/components/import/import-draft-form';
import { importReviewLook } from '@/components/import/import-review-style';
import { itemFormLook } from '@/components/item-form-style';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
import { KeyboardDismissArea } from '@/components/keyboard-dismiss-area';
import type { TagSummary } from '@/core';
import type { ImportDraft, ImportSession } from '@/data/import-session';
import { useImportDraftFields } from '@/hooks/use-import-draft-fields';
import { useImportSession } from '@/hooks/use-import-session';
import { useSavedTags } from '@/hooks/use-saved-tags';
import { useTheme } from '@/hooks/use-theme';

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/add');
}

/**
 * One import draft's details, opened from the review list. Changes apply to
 * the draft at once (nothing is saved to the closet here); "Done" goes back
 * to the list. Removing the draft drops it from the import.
 */
export default function ImportDraftScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ draftId: string }>();
  const draftId = Array.isArray(params.draftId) ? params.draftId[0] : params.draftId;
  const { session, snapshot } = useImportSession();
  const draft = snapshot?.drafts.find((d) => d.id === draftId) ?? null;

  if (!session || !snapshot || !draft) {
    const look = importReviewLook(theme);
    return (
      <View style={look.empty}>
        <Text style={look.emptyText}>This photo is no longer in the import.</Text>
        <View style={{ alignSelf: 'stretch' }}>
          <FormButton label="Back" variant="secondary" onPress={leave} />
        </View>
      </View>
    );
  }
  return <DraftEditor key={draft.id} session={session} draft={draft} saving={snapshot.saving} />;
}

function DraftEditor({ session, draft, saving }: { session: ImportSession; draft: ImportDraft; saving: boolean }) {
  const theme = useTheme();
  const look = itemFormLook(theme);
  const fields = useImportDraftFields(session, draft);
  const savedTags = useSavedTags();
  const headerHeight = useHeaderHeight();

  async function deleteSavedTag(summary: TagSummary, confirm: () => Promise<boolean>) {
    if (await savedTags.remove(summary, confirm)) fields.removeTag(summary.name);
  }

  async function onRemove() {
    await session.remove(draft.id);
    leave();
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAwareScrollView
        contentContainerStyle={[look.body, { paddingBottom: theme.spacing.jumbo }]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardVerticalOffset={headerHeight}>
        <ImportDraftForm
          draft={draft}
          fields={fields}
          savedTags={savedTags}
          onDeleteSavedTag={(summary, confirm) => void deleteSavedTag(summary, confirm)}
          disabled={saving || savedTags.deleting}
        />
        <KeyboardDismissArea style={look.buttons}>
          <FormButton label="Done" onPress={leave} />
          <FormButton label="Remove from import" variant="destructive" onPress={() => void onRemove()} disabled={saving} />
        </KeyboardDismissArea>
      </KeyboardAwareScrollView>
    </View>
  );
}
