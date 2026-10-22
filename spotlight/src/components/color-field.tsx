import { Pressable, Text, View } from 'react-native';

import { ColorMatrix } from '@/components/color-matrix';
import { ColorSwatch } from '@/components/color-swatch';
import { itemFormLook } from '@/components/item-form-style';
import { Chip, SectionLabel } from '@/components/ui';
import { swatchLook } from '@/components/ui/swatch-style';
import { paletteName, type ItemColor } from '@/core';
import type { ItemFormFields } from '@/hooks/use-item-form-fields';
import { useTheme } from '@/hooks/use-theme';

interface ColorFieldProps {
  fields: ItemFormFields;
  disabled: boolean;
}

/**
 * The item's colors as chips (SaveItem.dc.html: swatch, name, and "Primary"
 * on the first, which has the heavier outline). Tapping a chip or the dashed
 * "Choose colors" / "Edit colors" chip opens the color matrix. While the
 * front photo's colors are being detected, a hint says so; detected colors
 * show as the same editable chips, with a note that they came from the photo.
 */
export function ColorField({ fields, disabled }: ColorFieldProps) {
  const theme = useTheme();
  const form = itemFormLook(theme);
  const { colors } = fields.values;
  const open = () => fields.openColorMatrix();
  const detected = colors.some((c) => c.source === 'auto');

  return (
    <View style={form.section}>
      <View style={form.labelRow}>
        <SectionLabel>Colors</SectionLabel>
        {colors.length > 0 && detected ? <Text style={form.note}>Detected from the photo</Text> : null}
      </View>
      {fields.detectingColors ? (
        <Text style={form.caption} accessibilityLiveRegion="polite">
          Detecting colors from the photo...
        </Text>
      ) : null}
      <View style={form.chipRow}>
        {colors.map((c, rank) => (
          <ColorChip key={c.paletteId} color={c} primary={rank === 0} onPress={open} disabled={disabled} />
        ))}
        <Chip
          variant="add"
          casing="sentence"
          plus={colors.length === 0}
          label={colors.length > 0 ? 'Edit colors' : 'Choose colors'}
          onPress={open}
          disabled={disabled}
        />
      </View>
      {colors.length > 0 && detected ? (
        <Text style={form.caption}>Tap a color to change it.</Text>
      ) : null}
      {colors.length > 0 ? null : (
        <Text style={form.caption}>No colors yet. Choose the main color first, then up to two more.</Text>
      )}
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
    </View>
  );
}

/** One of the item's colors: the primary gets the 2 pt ink outline and a "Primary" tag. */
function ColorChip({
  color,
  primary,
  onPress,
  disabled,
}: {
  color: ItemColor;
  primary: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  const name = paletteName(color.paletteId);
  const idle = swatchLook(theme, { interactive: true, selected: primary, pressed: false, disabled });
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${primary ? 'primary color' : 'secondary color'}${color.source === 'auto' ? ', detected' : ''}`}
      accessibilityHint="Opens the color chooser"
      accessibilityState={{ disabled }}
      hitSlop={idle.hitSlop}
      style={({ pressed }) =>
        swatchLook(theme, { interactive: true, selected: primary, pressed, disabled }).container
      }>
      <ColorSwatch hex={color.hex} size={theme.sizes.formSwatchSize} />
      <Text style={idle.label}>{name}</Text>
      {primary ? (
        <Text style={{ ...theme.typography.label, fontFamily: theme.fonts.sans.semiBold, color: theme.colors.textSecondary }}>
          Primary
        </Text>
      ) : null}
    </Pressable>
  );
}
