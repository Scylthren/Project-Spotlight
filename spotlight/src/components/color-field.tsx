import { Pressable, StyleSheet, View } from 'react-native';

import { ColorMatrix } from '@/components/color-matrix';
import { ColorSwatch } from '@/components/color-swatch';
import { FormButton } from '@/components/form-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { paletteName } from '@/core';
import type { ItemFormFields } from '@/hooks/use-item-form-fields';
import { useTheme } from '@/hooks/use-theme';

interface ColorFieldProps {
  fields: ItemFormFields;
  disabled: boolean;
}

/**
 * The item's colors as chips (swatch, name, and "Primary" on the first).
 * Tapping a chip or "Choose colors" opens the color matrix. While the front
 * photo's colors are being detected, a hint says so; detected colors show
 * as the same editable chips, with a note that they came from the photo.
 */
export function ColorField({ fields, disabled }: ColorFieldProps) {
  const theme = useTheme();
  const { colors } = fields.values;
  const open = () => fields.openColorMatrix();
  const detected = colors.some((c) => c.source === 'auto');

  return (
    <>
      <ThemedText type="smallBold" accessibilityRole="header">
        Colors
      </ThemedText>
      {fields.detectingColors ? (
        <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
          Detecting colors from the photo...
        </ThemedText>
      ) : null}
      {colors.length > 0 ? (
        <View style={styles.row}>
          {colors.map((c, rank) => {
            const name = paletteName(c.paletteId);
            return (
              <Pressable
                key={c.paletteId}
                onPress={open}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${rank === 0 ? 'primary color' : 'secondary color'}${c.source === 'auto' ? ', detected' : ''}`}
                accessibilityHint="Opens the color chooser"
                style={({ pressed }) => (pressed || disabled) && styles.pressed}>
                <ThemedView type="backgroundElement" style={[styles.chip, rank === 0 && styles.primaryChip]}>
                  <ColorSwatch hex={c.hex} size={18} backgroundHex={theme.backgroundElement} />
                  <ThemedText type={rank === 0 ? 'smallBold' : 'small'}>{name}</ThemedText>
                  {rank === 0 && (
                    <ThemedText type="small" themeColor="textSecondary">
                      Primary
                    </ThemedText>
                  )}
                </ThemedView>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {colors.length > 0 && detected ? (
        <ThemedText type="small" themeColor="textSecondary">
          Detected from the photo. Tap a color to change it.
        </ThemedText>
      ) : null}
      {colors.length > 0 ? null : (
        <ThemedText type="small" themeColor="textSecondary">
          No colors yet. Choose the main color first, then up to two more.
        </ThemedText>
      )}
      <FormButton
        label={colors.length > 0 ? 'Change colors' : 'Choose colors'}
        variant="secondary"
        onPress={open}
        disabled={disabled}
      />
      <ColorMatrix
        visible={fields.colorMatrix !== null}
        colors={colors}
        notice={fields.colorMatrix?.notice}
        problem={fields.colorProblem}
        onToggle={fields.toggleColor}
        onMakePrimary={fields.makePrimaryColor}
        onDone={fields.closeColorMatrix}
        disabled={disabled}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primaryChip: { borderColor: '#3c87f7' },
  pressed: { opacity: 0.7 },
});
