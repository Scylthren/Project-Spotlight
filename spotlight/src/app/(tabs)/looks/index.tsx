import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LookbookView } from '@/components/looks/lookbook-view';
import { ALL_LOOKS_FILTER, type LookbookFilter } from '@/core';
import { useClosetServices } from '@/hooks/closet-services';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useLookbookEntries } from '@/hooks/use-lookbook';
import { useTheme } from '@/hooks/use-theme';

/** The Lookbook (Lookbook.dc.html): saved looks, filters, open a look. */
export default function LookbookScreen() {
  const theme = useTheme();
  const bottomInset = useBottomTabInset();
  const { imageStore } = useClosetServices();
  const { status, entries } = useLookbookEntries();
  const [filter, setFilter] = useState<LookbookFilter>(ALL_LOOKS_FILTER);
  // Fixed per visit so memoized rows do not re-render each time (dates only need the day).
  const [now] = useState(() => new Date());
  const resolveImageUri = useCallback((ref: string) => imageStore.resolveUri(ref), [imageStore]);
  const open = useCallback((id: string) => router.push({ pathname: '/looks/[id]', params: { id } }), []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <LookbookView
        status={status}
        entries={entries}
        filter={filter}
        onFilter={setFilter}
        onOpen={open}
        resolveImageUri={resolveImageUri}
        bottomInset={bottomInset}
        now={now}
      />
    </SafeAreaView>
  );
}
