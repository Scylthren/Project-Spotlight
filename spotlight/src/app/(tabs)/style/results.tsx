import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ResultsView } from '@/components/style/results-view';
import { useClosetServices } from '@/hooks/closet-services';
import { styleLookToSave } from '@/data/lookbook-store';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useLookbookSnapshot } from '@/hooks/use-lookbook';
import { useStyleResults } from '@/hooks/use-style-results';
import { useTheme } from '@/hooks/use-theme';

/** Results (Results.dc.html), pushed from Style. Leaving it aborts the request (`useStyleResults`). */
export default function ResultsScreen() {
  const theme = useTheme();
  const bottomInset = useBottomTabInset();
  const { imageStore } = useClosetServices();
  const { session, snapshot } = useStyleResults();
  const { lookbook, snapshot: saved } = useLookbookSnapshot();
  const request = snapshot?.request ?? '';

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/style');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <ResultsView
        snapshot={snapshot}
        resolveImageUri={(ref) => imageStore.resolveUri(ref)}
        bottomInset={bottomInset + theme.spacing.xxl}
        onBack={back}
        onCancel={() => {
          session?.cancel();
          back();
        }}
        onRetry={() => void session?.start()}
        onAddPiece={() => router.navigate('/add')}
        onOpenMe={() => router.navigate('/me')}
        onRestyle={(key) => void session?.restyle(key)}
        lookbook={saved}
        onSave={(look) => void lookbook.save(styleLookToSave(request, look))}
        onRate={(look, rating) => void lookbook.rateUnsavedOrSaved(styleLookToSave(request, look), rating)}
        onPickOccasion={(look, occasion) => void lookbook.toggleOccasion(look.id, occasion)}
      />
    </SafeAreaView>
  );
}
