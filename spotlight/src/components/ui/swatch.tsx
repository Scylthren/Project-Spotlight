import { Pressable, Text, View } from 'react-native';

import { ColorSwatch } from '@/components/color-swatch';
import { useTheme } from '@/hooks/use-theme';

import { SWATCH_CIRCLE_SIZE, swatchAccessibility, swatchLook } from './swatch-style';

interface SwatchProps {
  /** Uppercase #RRGGBB, usually from `core/palette.ts`. */
  hex: string;
  /** The color's name, always shown next to the circle. */
  name: string;
  selected?: boolean;
  /** Without it the swatch is static (circle and name). */
  onPress?: () => void;
  disabled?: boolean;
  /** For the dev gallery: draw the pressed state without a press. */
  forcePressed?: boolean;
}

/** A color circle with its name; pressable swatches are outlined chips. */
export function Swatch({
  hex,
  name,
  selected = false,
  onPress,
  disabled = false,
  forcePressed = false,
}: SwatchProps) {
  const theme = useTheme();
  const interactive = onPress !== undefined;
  const a11y = swatchAccessibility(name, { interactive, selected, disabled });
  const idle = swatchLook(theme, { interactive, selected, disabled, pressed: forcePressed });
  const content = (
    <>
      <ColorSwatch hex={hex} size={SWATCH_CIRCLE_SIZE} />
      <Text style={idle.label}>{name}</Text>
    </>
  );

  if (!interactive) {
    return (
      <View {...a11y} style={idle.container}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      {...a11y}
      onPress={onPress}
      disabled={disabled}
      hitSlop={idle.hitSlop}
      style={({ pressed }) =>
        swatchLook(theme, { interactive, selected, disabled, pressed: pressed || forcePressed }).container
      }>
      {content}
    </Pressable>
  );
}
