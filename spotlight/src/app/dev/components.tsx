import { Redirect, Stack, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Chip, ScreenHeader, SectionLabel, SegmentedControl, Swatch, TextField } from '@/components/ui';
import { BUTTON_VARIANTS } from '@/components/ui/button-style';
import { paletteColor } from '@/core/palette';
import { ThemeOverride } from '@/hooks/theme-override';
import { useTheme } from '@/hooks/use-theme';
import type { ColorScheme } from '@/theme';

const noop = () => {};

/**
 * Dev-only gallery of the shared components in every variant and state.
 * The Light/Dark switch previews the gallery in either scheme through a
 * local `ThemeOverride`; the saved Appearance setting is not touched.
 * Release builds redirect to the closet.
 */
export default function DevComponentsRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Gallery />;
}

function Gallery() {
  const outer = useTheme();
  const [scheme, setScheme] = useState<ColorScheme>(outer.scheme);
  return (
    <ThemeOverride scheme={scheme}>
      <Stack.Screen options={{ headerShown: false }} />
      <GalleryBody scheme={scheme} onSchemeChange={setScheme} />
    </ThemeOverride>
  );
}

function GalleryBody({
  scheme,
  onSchemeChange,
}: {
  scheme: ColorScheme;
  onSchemeChange: (scheme: ColorScheme) => void;
}) {
  const router = useRouter();
  const { colors, spacing, sizes } = useTheme();
  const [segment, setSegment] = useState<'one' | 'two' | 'three'>('one');
  const [chipOn, setChipOn] = useState(true);
  const [text, setText] = useState('');
  const black = paletteColor('black')!;
  const cream = paletteColor('cream')!;
  const red = paletteColor('red')!;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScreenHeader variant="step" title="Components" onBack={() => router.back()} step={{ current: 1, total: 1 }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: sizes.screenPadding, gap: spacing.xxxl }}>
        <Section title="Preview scheme">
          <SegmentedControl
            accessibilityLabel="Preview scheme"
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            value={scheme}
            onChange={onSchemeChange}
          />
        </Section>

        <Section title="Screen header">
          <ScreenHeader title="Closet" aside="24 pieces" />
          <ScreenHeader title="Me" />
          <ScreenHeader variant="step" title="New piece" onBack={noop} step={{ current: 1, total: 2 }} />
          <ScreenHeader variant="step" title="No back button" />
        </Section>

        <Section title="Buttons">
          {BUTTON_VARIANTS.map((variant) => (
            <View key={variant} style={{ gap: spacing.sm }}>
              <Button variant={variant} label={`${variant}`} onPress={noop} />
              <Button variant={variant} label={`${variant} pressed`} onPress={noop} forcePressed />
              <Button variant={variant} label={`${variant} disabled`} onPress={noop} disabled />
            </View>
          ))}
        </Section>

        <Section title="Chips">
          <Row>
            <Chip label="All" selected={chipOn} onPress={() => setChipOn((on) => !on)} />
            <Chip label="Tops" onPress={noop} />
            <Chip label="Pressed" onPress={noop} forcePressed />
            <Chip label="Sel pressed" selected onPress={noop} forcePressed />
            <Chip label="Disabled" onPress={noop} disabled />
            <Chip label="Static" />
          </Row>
          <Row>
            <Chip variant="styleTag" label="minimal" onPress={noop} />
            <Chip variant="styleTag" label="romantic" selected onPress={noop} />
            <Chip variant="styleTag" label="pressed" onPress={noop} forcePressed />
            <Chip variant="styleTag" label="disabled" onPress={noop} disabled />
            <Chip variant="styleTag" label="static" />
          </Row>
          <Row>
            <Chip variant="add" label="New tag" onPress={noop} />
            <Chip variant="add" label="Pressed" onPress={noop} forcePressed />
            <Chip variant="add" label="Disabled" onPress={noop} disabled />
          </Row>
          <Row>
            <Chip casing="sentence" label="Spring" onPress={noop} />
            <Chip casing="sentence" label="Autumn" selected onPress={noop} />
            <Chip casing="sentence" variant="add" label="Add" onPress={noop} />
          </Row>
        </Section>

        <Section title="Text fields">
          <TextField variant="underline" label="Name" placeholder="Black wool coat" value={text} onChangeText={setText} />
          <TextField label="Search your closet" labelHidden placeholder="Search by color, piece or vibe" value={text} onChangeText={setText} />
          <TextField label="With hint" hint="Up to 40 characters." value="" onChangeText={noop} />
          <TextField label="With error" error="Enter a name." value="" onChangeText={noop} />
          <TextField variant="underline" label="Underline error" error="Enter a name." value="" onChangeText={noop} />
          <TextField label="Disabled" value="Can't edit" onChangeText={noop} disabled />
        </Section>

        <Section title="Section label">
          <SectionLabel>Colors</SectionLabel>
        </Section>

        <Section title="Swatches">
          <Row>
            <Swatch hex={black.hex} name={black.name} />
            <Swatch hex={cream.hex} name={cream.name} />
          </Row>
          <Row>
            <Swatch hex={red.hex} name={red.name} onPress={noop} />
            <Swatch hex={black.hex} name={black.name} selected onPress={noop} />
            <Swatch hex={cream.hex} name={`${cream.name} pressed`} onPress={noop} forcePressed />
            <Swatch hex={red.hex} name={`${red.name} disabled`} onPress={noop} disabled />
          </Row>
        </Section>

        <Section title="Segmented control">
          <SegmentedControl
            accessibilityLabel="Example"
            options={[
              { value: 'one', label: 'One' },
              { value: 'two', label: 'Two' },
              { value: 'three', label: 'Three' },
            ]}
            value={segment}
            onChange={setSegment}
          />
          <SegmentedControl
            accessibilityLabel="Disabled example"
            options={[
              { value: 'one', label: 'Disabled' },
              { value: 'two', label: 'Group' },
            ]}
            value="one"
            onChange={noop}
            disabled
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <SectionLabel>{title}</SectionLabel>
      {children}
    </View>
  );
}

function Row({ children }: { children: ReactNode }) {
  const { spacing } = useTheme();
  return <View style={[styles.row, { gap: spacing.sm }]}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});
