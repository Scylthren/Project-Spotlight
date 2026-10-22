import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClosetFilterBar } from '@/components/closet/closet-filter-bar';
import { closetGridLook } from '@/components/closet/closet-grid-style';
import { ClosetGrid } from '@/components/closet-grid';
import { Button, ScreenHeader } from '@/components/ui';
import { filterCloset, NO_CLOSET_FILTER, noMatchesMessage, pieceCount, type ClosetFilter } from '@/core';
import { useClosetServices } from '@/hooks/closet-services';
import { useClosetItems } from '@/hooks/use-closet-items';
import { useTheme } from '@/hooks/use-theme';

export default function ClosetScreen() {
  const theme = useTheme();
  const { imageStore } = useClosetServices();
  const { items, loading, error } = useClosetItems();
  const [filter, setFilter] = useState<ClosetFilter>(NO_CLOSET_FILTER);
  const shown = useMemo(() => filterCloset(items, filter), [items, filter]);
  const message = closetGridLook(theme).message;
  const { sizes, spacing } = theme;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <View style={{ paddingHorizontal: sizes.screenPadding, paddingTop: spacing.xxl + spacing.xs, gap: spacing.md }}>
        <ScreenHeader title="Closet" aside={loading || error ? undefined : pieceCount(items.length)} />
        {!loading && !error && items.length > 0 ? <ClosetFilterBar filter={filter} onChange={setFilter} /> : null}
      </View>
      {loading ? (
        <ActivityIndicator color={theme.colors.text} style={{ flex: 1 }} />
      ) : error ? (
        <Text style={[message, { padding: spacing.xxl }]}>{error}</Text>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xxl }}>
          <Text style={message}>Your closet is empty.</Text>
          <Button variant="text" label="Add your first item" onPress={() => router.navigate('/add')} />
        </View>
      ) : (
        <ClosetGrid
          items={shown}
          resolveImageUri={(ref) => imageStore.resolveUri(ref)}
          onPressItem={(item) => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
          emptyMessage={noMatchesMessage(filter)}
        />
      )}
    </SafeAreaView>
  );
}
