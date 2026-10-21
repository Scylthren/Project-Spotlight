import { Link, router } from 'expo-router';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClosetGrid } from '@/components/closet-grid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useClosetServices } from '@/hooks/closet-services';
import { useClosetItems } from '@/hooks/use-closet-items';

export default function ClosetScreen() {
  const { imageStore } = useClosetServices();
  const { items, loading, error } = useClosetItems();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        {loading ? (
          <ActivityIndicator style={styles.center} />
        ) : error ? (
          <ThemedText style={styles.message}>{error}</ThemedText>
        ) : items.length === 0 ? (
          <ThemedView style={styles.center}>
            <ThemedText style={styles.message}>Your closet is empty.</ThemedText>
            <Link href="/add">
              <ThemedText type="linkPrimary">Add your first item</ThemedText>
            </Link>
          </ThemedView>
        ) : (
          <ClosetGrid
            items={items}
            resolveImageUri={(ref) => imageStore.resolveUri(ref)}
            onPressItem={(item) => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
            header={
              <ThemedText type="subtitle">
                Closet ({items.length})
              </ThemedText>
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  message: { textAlign: 'center', padding: Spacing.four },
});
