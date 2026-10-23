import { router, useNavigation, usePreventRemove, type NavigationAction } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormButton } from '@/components/form-button';
import { confirmDiscardImport } from '@/components/import/confirm-discard-import';
import { ImportDraftRow } from '@/components/import/import-draft-row';
import { importReviewLook } from '@/components/import/import-review-style';
import { describeNotReady, describeSaveReport, saveButtonLabel, summarizeDrafts } from '@/data/import-session';
import { useClosetServices } from '@/hooks/closet-services';
import { useImportSession } from '@/hooks/use-import-session';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { useTheme } from '@/hooks/use-theme';

/**
 * The import review (Gate 2 slice 6): every picked photo as a draft with its
 * own status. Nothing is saved until "Save"; it saves the ready drafts only
 * and leaves the rest here. Leaving (Discard, or the system back) asks
 * first and then drops the unsaved drafts and their temporary photos. The
 * screen has no header back button and no swipe-back (see the root layout),
 * so leaving is always a choice. Logic lives in ImportSession.
 */
/** After the import ends: the blocked navigation, the closet (all saved), or back to Add (discarded). */
type Exit = { kind: 'action'; action: NavigationAction } | { kind: 'closet' } | { kind: 'add' };

export default function ImportReviewScreen() {
  const theme = useTheme();
  const look = importReviewLook(theme);
  const { importSessions } = useClosetServices();
  const { session, snapshot } = useImportSession();
  const navigation = useNavigation();
  const isMounted = useIsMounted();
  /**
   * Where to go once the import has ended. Navigating waits for the next
   * render, so the back guard below has been switched off by then.
   */
  const [exit, setExit] = useState<Exit | null>(null);

  const drafts = snapshot?.drafts ?? [];
  const hasUnsaved = Boolean(session && snapshot && !snapshot.closed && drafts.length > 0);

  // The system back (Android button) asks before dropping unsaved photos; ignored while saving.
  usePreventRemove(hasUnsaved && exit === null, ({ data }) => {
    if (!session || session.getSnapshot().saving) return;
    void confirmDiscardImport(drafts.length).then(async (discard) => {
      if (!discard) return;
      await importSessions.end(session);
      if (isMounted()) setExit({ kind: 'action', action: data.action });
    });
  });
  useEffect(() => {
    if (!exit) return;
    if (exit.kind === 'action') navigation.dispatch(exit.action);
    else router.dismissTo(exit.kind === 'closet' ? '/' : '/add');
  }, [exit, navigation]);

  if (!session || !snapshot) {
    return (
      <View style={look.empty}>
        <Text style={look.emptyText}>There is no import to review. Start one from Add.</Text>
        <View style={{ alignSelf: 'stretch' }}>
          <FormButton label="Back" variant="secondary" onPress={() => router.dismissTo('/add')} />
        </View>
      </View>
    );
  }

  const summary = summarizeDrafts(drafts);
  const notReady = describeNotReady(summary);
  const busy = snapshot.saving;

  async function onSave() {
    if (!session) return;
    const report = await session.saveReady();
    if (!report || !isMounted()) return;
    if (session.getSnapshot().drafts.length === 0) {
      await importSessions.end(session);
      if (isMounted()) setExit({ kind: 'closet' });
    }
  }

  async function onDiscard() {
    if (!session || busy) return;
    if (drafts.length > 0 && !(await confirmDiscardImport(drafts.length))) return;
    await importSessions.end(session);
    if (isMounted()) setExit({ kind: snapshot && snapshot.savedCount > 0 ? 'closet' : 'add' });
  }

  return (
    <View style={look.screen}>
      <FlatList
        data={drafts}
        keyExtractor={(d) => d.id}
        contentContainerStyle={look.list}
        ListHeaderComponent={
          <View style={look.intro}>
            <Text style={look.caption}>
              Nothing is saved until you tap Save. Each photo becomes one piece. Tap a piece to check or change its details.
            </Text>
            {snapshot.notices.length > 0 || snapshot.lastSave ? (
              <View style={look.notice} accessibilityLiveRegion="polite">
                {snapshot.lastSave ? <Text style={look.noticeText}>{describeSaveReport(snapshot.lastSave)}</Text> : null}
                {snapshot.notices.map((n) => (
                  <Text key={n} style={look.noticeText}>
                    {n}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={look.caption}>No photos left to review. Tap Done to go back.</Text>
        }
        renderItem={({ item, index }) => (
          <ImportDraftRow
            draft={item}
            position={index + 1}
            total={drafts.length}
            first={index === 0}
            disabled={busy}
            onOpen={() => router.push({ pathname: '/import/[draftId]', params: { draftId: item.id } })}
            onRemove={() => void session.remove(item.id)}
          />
        )}
      />
      <SafeAreaView edges={['bottom']} style={look.footer}>
        {notReady ? (
          <Text style={look.caption} accessibilityLiveRegion="polite">
            {notReady}
          </Text>
        ) : null}
        <FormButton
          label={busy ? 'Saving...' : saveButtonLabel(summary)}
          onPress={() => void onSave()}
          disabled={busy || summary.ready === 0}
        />
        <FormButton
          label={drafts.length === 0 ? 'Done' : 'Discard import'}
          variant="text"
          onPress={() => void onDiscard()}
          disabled={busy}
        />
      </SafeAreaView>
    </View>
  );
}
