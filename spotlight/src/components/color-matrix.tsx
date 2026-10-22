import { useEffect } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ColorSwatch } from '@/components/color-swatch';
import { colorMatrixLook } from '@/components/color-matrix-style';
import { FormButton } from '@/components/form-button';
import { SectionLabel } from '@/components/ui';
import { chipLook } from '@/components/ui/chip-style';
import { COLOR_MATRIX_HELP, describeMatrix, paletteColor, type ItemColor, type SwatchDescription } from '@/core';
import { useTheme } from '@/hooks/use-theme';

interface ColorMatrixProps {
  visible: boolean;
  /** The item's colors, primary first. */
  colors: readonly ItemColor[];
  onToggle: (paletteId: string) => void;
  onMakePrimary: (paletteId: string) => void;
  onDone: () => void;
  /** Shown above the grid, e.g. why detection needs a check (slice 4). */
  notice?: string | null;
  /** The last refused tap (e.g. a fourth color). */
  problem?: string | null;
  disabled?: boolean;
}

/**
 * Sheet with every palette color (ColorMatrix.dc.html look). Tap a swatch to
 * select or deselect it; the first selected is the primary. Selected colors
 * are listed at the top in order, where a secondary can be made primary or
 * removed. State and rules come from the caller (core/color-selection.ts);
 * this only renders.
 */
export function ColorMatrix({
  visible,
  colors,
  onToggle,
  onMakePrimary,
  onDone,
  notice,
  problem,
  disabled = false,
}: ColorMatrixProps) {
  const theme = useTheme();
  const look = colorMatrixLook(theme);
  // Android reads the message through accessibilityLiveRegion below; iOS has
  // no live regions, so VoiceOver is told explicitly (platform-specific).
  useEffect(() => {
    if (visible && problem && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(problem);
  }, [visible, problem]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDone}>
      <SafeAreaView style={look.fill} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={look.content}>
          <Text accessibilityRole="header" style={look.title}>
            Pick colors
          </Text>
          {notice ? (
            <Text style={look.notice} accessibilityLiveRegion="polite">
              {notice}
            </Text>
          ) : null}
          <Text style={look.help}>{COLOR_MATRIX_HELP}</Text>
          {problem ? (
            <Text style={look.error} accessibilityLiveRegion="polite">
              {problem}
            </Text>
          ) : null}
          <SelectedColors colors={colors} onToggle={onToggle} onMakePrimary={onMakePrimary} disabled={disabled} />
          <View style={look.grid}>
            {describeMatrix(colors).map((swatch) => (
              <Swatch
                key={swatch.color.id}
                swatch={swatch}
                onToggle={onToggle}
                onMakePrimary={onMakePrimary}
                disabled={disabled}
              />
            ))}
          </View>
        </ScrollView>
        <View style={look.footer}>
          <FormButton label="Done" onPress={onDone} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

interface SwatchProps {
  swatch: SwatchDescription;
  onToggle: (paletteId: string) => void;
  onMakePrimary: (paletteId: string) => void;
  disabled: boolean;
}

/** One grid cell: swatch, name, and a "Primary"/"Secondary" badge when selected. */
function Swatch({ swatch, onToggle, onMakePrimary, disabled }: SwatchProps) {
  const theme = useTheme();
  const look = colorMatrixLook(theme);
  const { color, selected, primary, badge, accessibilityLabel } = swatch;
  const canMakePrimary = selected && !primary;
  return (
    <Pressable
      onPress={() => onToggle(color.id)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      accessibilityHint={selected ? 'Removes this color' : 'Adds this color'}
      accessibilityActions={canMakePrimary ? [{ name: 'makePrimary', label: 'Make primary' }] : undefined}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'makePrimary' && canMakePrimary) onMakePrimary(color.id);
      }}
      style={({ pressed }) => look.cell({ pressed, disabled })}>
      <View style={look.ring(selected)}>
        <ColorSwatch hex={color.hex} size={theme.sizes.matrixSwatchSize} />
      </View>
      <Text style={look.cellName(selected)} numberOfLines={2}>
        {color.name}
      </Text>
      <Text style={look.badge(primary)} numberOfLines={1}>
        {badge ?? ' '}
      </Text>
    </Pressable>
  );
}

interface SelectedColorsProps {
  colors: readonly ItemColor[];
  onToggle: (paletteId: string) => void;
  onMakePrimary: (paletteId: string) => void;
  disabled: boolean;
}

/** The chosen colors in order, with "Make primary" and "Remove". */
function SelectedColors({ colors, onToggle, onMakePrimary, disabled }: SelectedColorsProps) {
  const theme = useTheme();
  const look = colorMatrixLook(theme);
  if (colors.length === 0) return <Text style={look.help}>No colors chosen yet.</Text>;
  return (
    <View style={look.selectedList}>
      <SectionLabel>Chosen colors</SectionLabel>
      {colors.map((c, rank) => {
        const name = paletteColor(c.paletteId)?.name ?? c.paletteId;
        return (
          <View key={c.paletteId} style={look.selectedRow}>
            <ColorSwatch hex={c.hex} size={theme.sizes.chosenSwatchSize} />
            <Text style={look.selectedName}>
              {name}
              <Text style={look.selectedRank}>{rank === 0 ? '  Primary' : '  Secondary'}</Text>
            </Text>
            {rank > 0 && (
              <SmallButton
                label="Make primary"
                accessibilityLabel={`Make ${name} the primary color`}
                onPress={() => onMakePrimary(c.paletteId)}
                disabled={disabled}
              />
            )}
            <SmallButton
              label="Remove"
              accessibilityLabel={`Remove ${name}`}
              onPress={() => onToggle(c.paletteId)}
              disabled={disabled}
            />
          </View>
        );
      })}
    </View>
  );
}

/** A small outlined action (the plain chip look), grown to 44 pt by hit slop. */
function SmallButton(props: { label: string; accessibilityLabel: string; onPress: () => void; disabled: boolean }) {
  const theme = useTheme();
  const idle = chipLook(theme, 'plain', { selected: false, pressed: false, disabled: props.disabled }, 'sentence');
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={{ disabled: props.disabled }}
      hitSlop={idle.hitSlop}
      style={({ pressed }) =>
        chipLook(theme, 'plain', { selected: false, pressed, disabled: props.disabled }, 'sentence').container
      }>
      <Text style={idle.label}>{props.label}</Text>
    </Pressable>
  );
}
