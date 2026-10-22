import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppearanceControl } from '@/components/appearance-control';
import { useAppearance } from '@/hooks/appearance';
import { useTheme } from '@/hooks/use-theme';

/**
 * The Me tab (Profile.dc.html). For now only the Appearance setting;
 * account details, log out and delete account come in Gate 4.
 */
export default function MeScreen() {
  const { colors, typography, spacing, sizes, borders } = useTheme();
  const { preference, setPreference } = useAppearance();

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: sizes.screenPadding,
          paddingTop: spacing.xxl,
          paddingBottom: sizes.bottomTabInset + spacing.xxl,
          gap: spacing.xl,
        }}>
        <View
          style={{
            borderBottomWidth: borders.masthead,
            borderBottomColor: colors.text,
            paddingBottom: spacing.sm,
          }}>
          <Text accessibilityRole="header" style={[typography.display, { color: colors.text }]}>
            Me
          </Text>
        </View>

        <View style={{ gap: spacing.md }}>
          <Text accessibilityRole="header" style={[typography.label, { color: colors.text }]}>
            Appearance
          </Text>
          <AppearanceControl value={preference} onChange={setPreference} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
