import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ResultsView } from '@/components/style/results-view';
import { useClosetServices } from '@/hooks/closet-services';
import { useStyleResults } from '@/hooks/use-style-results';
import { useTheme } from '@/hooks/use-theme';

/** Results (Results.dc.html), pushed from Style. Leaving it aborts the request (`useStyleResults`). */
export default function ResultsScreen() {
  const theme = useTheme();
  const { imageStore } = useClosetServices();
  const { session, snapshot } = useStyleResults();

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/style');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <ResultsView
        snapshot={snapshot}
        resolveImageUri={(ref) => imageStore.resolveUri(ref)}
        bottomInset={theme.sizes.bottomTabInset + theme.spacing.xxl}
        onBack={back}
        onCancel={() => {
          session?.cancel();
          back();
        }}
        onRetry={() => void session?.start()}
        onAddPiece={() => router.navigate('/add')}
        onRestyle={(key) => void session?.restyle(key)}
      />
    </SafeAreaView>
  );
}
