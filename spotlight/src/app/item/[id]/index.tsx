import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ItemDetailView } from '@/components/item-detail/item-detail-view';
import { itemDetailLook } from '@/components/item-detail/item-detail-style';
import { Button } from '@/components/ui';
import { useClosetServices } from '@/hooks/closet-services';
import { useClosetItemOnFocus } from '@/hooks/use-closet-item';
import { useTheme } from '@/hooks/use-theme';

/** The read-only item screen. Edit opens the form at `item/[id]/edit`. */
export default function ItemScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const state = useClosetItemOnFocus(id);
  const { imageStore } = useClosetServices();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  if (state.status === 'ready') {
    return (
      <ItemDetailView
        item={state.item}
        resolveImageUri={(ref) => imageStore.resolveUri(ref)}
        onBack={leaveScreen}
        onEdit={() => router.push({ pathname: '/item/[id]/edit', params: { id: state.item.id } })}
        topInset={insets.top}
        bottomInset={insets.bottom}
      />
    );
  }

  const center = {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xxl,
    gap: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  } as const;
  if (state.status === 'loading') {
    return (
      <View style={center}>
        <ActivityIndicator color={theme.colors.text} />
      </View>
    );
  }
  return (
    <View style={center}>
      <Text style={itemDetailLook(theme, insets.top).message}>
        {state.status === 'missing' ? 'This item is no longer in your closet.' : 'Could not load this item.'}
      </Text>
      <View style={{ alignSelf: 'stretch' }}>
        <Button label="Back to closet" variant="outline" onPress={leaveScreen} />
      </View>
    </View>
  );
}

/** Back to the previous screen, or to the closet if this screen was opened directly (e.g. a deep link). */
function leaveScreen() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
