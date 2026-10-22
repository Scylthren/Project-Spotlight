import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppearanceControl } from '@/components/appearance-control';
import { BackendSection } from '@/components/backend-section';
import { Button, ScreenHeader, SectionLabel } from '@/components/ui';
import { useAppearance } from '@/hooks/appearance';
import { devBackendServices } from '@/hooks/dev-backend-services';
import { useTheme } from '@/hooks/use-theme';

/**
 * The Me tab (Profile.dc.html). For now only the Appearance setting;
 * account details, log out and delete account come in Gate 4. Development
 * builds also link to the component gallery and have the Backend section
 * (dev token and connection test, Gate 2).
 */
export default function MeScreen() {
  const { colors, spacing, sizes } = useTheme();
  const { preference, setPreference } = useAppearance();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: sizes.screenPadding,
          paddingTop: spacing.xxl,
          paddingBottom: sizes.bottomTabInset + spacing.xxl,
          gap: spacing.xl,
        }}>
        <ScreenHeader title="Me" />

        <View style={{ gap: spacing.md }}>
          <SectionLabel>Appearance</SectionLabel>
          <AppearanceControl value={preference} onChange={setPreference} />
        </View>

        {__DEV__ ? <BackendSection services={devBackendServices()} /> : null}

        {__DEV__ ? (
          <View style={{ gap: spacing.md }}>
            <SectionLabel>Developer</SectionLabel>
            <Button variant="outline" label="Component gallery" onPress={() => router.push('/dev/components')} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
