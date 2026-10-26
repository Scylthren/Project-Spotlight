import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
import { LocationIntroModal } from '@/components/location-intro-modal';
import { StylePromptForm } from '@/components/style/style-prompt-form';
import { useStylePrompt } from '@/hooks/use-style-prompt';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useTheme } from '@/hooks/use-theme';

/**
 * The Style tab (StylePrompt.dc.html): describe the occasion (or match
 * today's weather), then "Get looks" opens Results. With the weather row on,
 * the location intro may come first.
 */
export default function StyleScreen() {
  const theme = useTheme();
  const bottomInset = useBottomTabInset();
  const prompt = useStylePrompt();

  async function onSubmit() {
    const session = prompt.matchWeather ? await prompt.submitWeather() : prompt.submit();
    if (session) router.push('/style/results');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      {/* Under the tabs the screen starts at the top of the window: no offset. */}
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingBottom: bottomInset + theme.spacing.xxl }}
        keyboardVerticalOffset={0}>
        <StylePromptForm
          text={prompt.text}
          onChangeText={prompt.setText}
          error={prompt.error}
          canSubmit={prompt.canSubmit}
          onSubmit={() => void onSubmit()}
          recents={prompt.recents}
          weather={{
            available: prompt.weatherAvailable,
            on: prompt.matchWeather,
            onChange: prompt.setMatchWeather,
            onOpenMe: () => router.navigate('/me'),
          }}
        />
      </KeyboardAwareScrollView>
      <LocationIntroModal intro={prompt.locationIntro} />
    </SafeAreaView>
  );
}
