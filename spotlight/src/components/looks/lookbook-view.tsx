import { router } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, FlatList, ScrollView, Text, View } from 'react-native';

import { Button, Chip, ScreenHeader } from '@/components/ui';
import {
  effectiveLookbookFilter,
  lookbookFilterKey,
  lookbookFilterLabel,
  lookbookFilters,
  matchesLookbookFilter,
  savedCountText,
  type LookbookEntry,
  type LookbookFilter,
} from '@/core';
import { useTheme } from '@/hooks/use-theme';

import { LookRow } from './look-row';
import { lookbookLook } from './looks-style';

interface LookbookViewProps {
  status: 'loading' | 'ready' | 'failed';
  entries: readonly LookbookEntry[];
  /** The chip the user picked; falls back to All when it has no looks left. */
  filter: LookbookFilter;
  onFilter: (filter: LookbookFilter) => void;
  onOpen: (id: string) => void;
  /** Opens the Style tab (empty Lookbook). */
  onGetLooks?: () => void;
  resolveImageUri: (ref: string) => string;
  /** Space under the list (the tab bar). */
  bottomInset: number;
  now: Date;
}

/** The Lookbook (Lookbook.dc.html): "Lookbook", "N saved", filter chips, one row per saved look. */
export function LookbookView({
  status,
  entries,
  filter,
  onFilter,
  onOpen,
  onGetLooks = () => router.navigate('/style'),
  resolveImageUri,
  bottomInset,
  now,
}: LookbookViewProps) {
  const theme = useTheme();
  const styles = lookbookLook(theme);
  const filters = useMemo(() => lookbookFilters(entries), [entries]);
  const active = effectiveLookbookFilter(filter, filters);
  // Forget a filter whose last look went (deleted, or a season edit), so it does not come back by itself.
  const stale = lookbookFilterKey(active) !== lookbookFilterKey(filter);
  useEffect(() => {
    if (stale && status === 'ready') onFilter(active);
  }, [stale, status, active, onFilter]);
  const shown = useMemo(() => entries.filter((e) => matchesLookbookFilter(e, active)), [entries, active]);
  const renderItem = useCallback(
    ({ item }: { item: LookbookEntry }) => <LookRow entry={item} now={now} resolveImageUri={resolveImageUri} onOpen={onOpen} />,
    [now, resolveImageUri, onOpen],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.top}>
        <ScreenHeader title="Lookbook" aside={status === 'ready' ? savedCountText(entries.length) : undefined} />
        {status === 'ready' && filters.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityLabel="Filter looks"
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsContent}>
            {filters.map((f) => (
              <Chip
                key={lookbookFilterKey(f)}
                label={lookbookFilterLabel(f)}
                selected={lookbookFilterKey(f) === lookbookFilterKey(active)}
                onPress={() => onFilter(f)}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>
      {status === 'loading' ? (
        <ActivityIndicator color={styles.spinnerColor} style={{ flex: 1 }} accessibilityLabel="Loading saved looks" />
      ) : status === 'failed' ? (
        <View style={[styles.list, styles.empty]}>
          <Text style={styles.message}>Could not load your saved looks.</Text>
        </View>
      ) : entries.length === 0 ? (
        <View style={[styles.list, styles.empty]}>
          <Text style={styles.emptyTitle} accessibilityRole="header">
            No saved looks yet
          </Text>
          <Text style={styles.message}>Save a look from your results, or rate one, and it shows up here.</Text>
          <Button variant="outline" label="Get looks" onPress={onGetLooks} />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(entry) => entry.look.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset + theme.spacing.xl }]}
          initialNumToRender={8}
          windowSize={7}
        />
      )}
    </View>
  );
}
