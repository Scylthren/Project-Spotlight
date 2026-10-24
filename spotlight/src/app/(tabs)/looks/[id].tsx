import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { confirmDelete } from '@/components/confirm-delete';
import { DELETE_LOOK_DETAIL } from '@/components/looks/delete-look-text';
import { SavedLookView } from '@/components/looks/saved-look-view';
import { lookKeyOf } from '@/data/lookbook-store';
import { useClosetServices } from '@/hooks/closet-services';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useLookbookEntries } from '@/hooks/use-lookbook';
import { useTheme } from '@/hooks/use-theme';

/** One saved look, pushed from the Lookbook: rate, pick an occasion, delete. */
export default function SavedLookScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const theme = useTheme();
  const bottomInset = useBottomTabInset();
  const { imageStore } = useClosetServices();
  const { status, entries, lookbook, error } = useLookbookEntries();
  const entry = entries.find((e) => e.look.id === id) ?? null;

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/looks');
  }

  async function remove() {
    if (!entry) return;
    if (!(await confirmDelete('this look', DELETE_LOOK_DETAIL))) return;
    if (await lookbook.remove(entry.look.id)) back();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <SavedLookView
        status={status}
        entry={entry}
        now={new Date()}
        resolveImageUri={(ref) => imageStore.resolveUri(ref)}
        onBack={back}
        onRate={(rating) => void lookbook.rate(id, rating)}
        onPickOccasion={(occasion) => void lookbook.toggleOccasion(id, occasion)}
        onDelete={() => void remove()}
        error={entry && error?.key === lookKeyOf(entry.look) ? error.text : null}
        bottomInset={bottomInset + theme.spacing.xxl}
      />
    </SafeAreaView>
  );
}
