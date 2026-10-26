import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppearanceControl } from '@/components/appearance-control';
import { BackendSection } from '@/components/backend-section';
import { Button, ScreenHeader, SectionLabel } from '@/components/ui';
import { WeatherSettingsSection } from '@/components/weather-settings-section';
import { useAppearance } from '@/hooks/appearance';
import { devBackendServices } from '@/hooks/dev-backend-services';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useTheme } from '@/hooks/use-theme';
import { useWeatherSettings } from '@/hooks/use-weather-settings';

/**
 * The Me tab (Profile.dc.html). The Appearance setting and, since Gate 3
 * slice 5a, Weather ("Use local weather" and the home city);
 * account details, log out and delete account come in Gate 4. Development
 * builds also link to the component gallery and have the Backend section
 * (dev token and connection test, Gate 2).
 */
export default function MeScreen() {
  const { colors, spacing, sizes } = useTheme();
  const { preference, setPreference } = useAppearance();
  const router = useRouter();
  const bottomInset = useBottomTabInset();
  const weather = useWeatherSettings();

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: sizes.screenPadding,
          paddingTop: spacing.xxl,
          paddingBottom: bottomInset + spacing.xxl,
          gap: spacing.xl,
        }}>
        <ScreenHeader title="Me" />

        <View style={{ gap: spacing.md }}>
          <SectionLabel>Appearance</SectionLabel>
          <AppearanceControl value={preference} onChange={setPreference} />
        </View>

        <WeatherSettingsSection
          settings={weather.settings}
          onToggle={(on) => void weather.setUseLocalWeather(on)}
          cityText={weather.cityText}
          onChangeCity={weather.changeCity}
          onSaveCity={() => void weather.saveCity()}
          cityError={weather.cityError}
          saveError={weather.saveError}
        />

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
