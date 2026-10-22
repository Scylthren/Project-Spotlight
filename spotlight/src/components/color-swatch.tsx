import { StyleSheet, View } from 'react-native';

import { needsSwatchOutline } from '@/core';
import { useTheme } from '@/hooks/use-theme';

interface ColorSwatchProps {
  hex: string;
  size: number;
  /** The color behind the swatch (defaults to the screen background), to decide on a strong outline. */
  backgroundHex?: string;
}

/**
 * A round color sample. Always has a hairline border; swatches that blend
 * into the background (white or cream in light mode, black or navy in dark
 * mode) get a strong one. Decorative: callers always show the color's name
 * as text next to it.
 */
export function ColorSwatch({ hex, size, backgroundHex }: ColorSwatchProps) {
  const theme = useTheme();
  const strong = needsSwatchOutline(hex, backgroundHex ?? theme.colors.background);
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={[
        styles.swatch,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: hex,
          borderColor: strong ? theme.colors.text : theme.colors.textSecondary,
          borderWidth: strong ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  swatch: { flexShrink: 0 },
});
