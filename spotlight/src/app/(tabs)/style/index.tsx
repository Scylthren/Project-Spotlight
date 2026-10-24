import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
import { StylePromptForm } from '@/components/style/style-prompt-form';
import { useStylePrompt } from '@/hooks/use-style-prompt';
import { useTheme } from '@/hooks/use-theme';

/** The Style tab (StylePrompt.dc.html): describe the occasion, then "Get looks" opens Results. */
export default function StyleScreen() {
  const theme = useTheme();
  const prompt = useStylePrompt();

  function onSubmit() {
    if (prompt.submit()) router.push('/style/results');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      {/* Under the tabs the screen starts at the top of the window: no offset. */}
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingBottom: theme.sizes.bottomTabInset + theme.spacing.xxl }}
        keyboardVerticalOffset={0}>
        <StylePromptForm
          text={prompt.text}
          onChangeText={prompt.setText}
          error={prompt.error}
          canSubmit={prompt.canSubmit}
          onSubmit={onSubmit}
          recents={prompt.recents}
        />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
