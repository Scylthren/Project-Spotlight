import { useEffect } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ColorSwatch } from '@/components/color-swatch';
import { FormButton } from '@/components/form-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { COLOR_MATRIX_HELP, describeMatrix, paletteColor, type ItemColor, type SwatchDescription } from '@/core';
import { useTheme } from '@/hooks/use-theme';

const ACCENT = '#3c87f7';

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
 * Sheet with every palette color. Tap a swatch to select or deselect it; the
 * first selected is the primary. Selected colors are listed at the top in
 * order, where a secondary can be made primary or removed. State and rules
 * come from the caller (core/color-selection.ts); this only renders.
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
  // Android reads the message through accessibilityLiveRegion below; iOS has
  // no live regions, so VoiceOver is told explicitly (platform-specific).
  useEffect(() => {
    if (visible && problem && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(problem);
  }, [visible, problem]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDone}>
      <ThemedView style={styles.fill}>
        <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <ThemedText type="subtitle" accessibilityRole="header" style={styles.title}>
              Colors
            </ThemedText>
            <View style={styles.done}>
              <FormButton label="Done" onPress={onDone} />
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {notice ? (
              <ThemedView type="backgroundSelected" style={styles.notice} accessibilityLiveRegion="polite">
                <ThemedText type="smallBold">{notice}</ThemedText>
              </ThemedView>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary">
              {COLOR_MATRIX_HELP}
            </ThemedText>
            {problem ? (
              <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">
                {problem}
              </ThemedText>
            ) : null}
            <SelectedColors colors={colors} onToggle={onToggle} onMakePrimary={onMakePrimary} disabled={disabled} />
            <View style={styles.grid}>
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
        </SafeAreaView>
      </ThemedView>
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
      style={({ pressed }) => [styles.cell, (pressed || disabled) && styles.pressed]}>
      <View style={[styles.ring, selected && styles.ringSelected]}>
        <ColorSwatch hex={color.hex} size={44} />
      </View>
      <ThemedText type={selected ? 'smallBold' : 'small'} numberOfLines={2} style={styles.cellText}>
        {color.name}
      </ThemedText>
      <ThemedText type="small" style={[styles.cellText, styles.badge]} numberOfLines={1}>
        {badge ?? ' '}
      </ThemedText>
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
  if (colors.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        No colors chosen yet.
      </ThemedText>
    );
  }
  return (
    <View style={styles.selectedList}>
      <ThemedText type="smallBold" accessibilityRole="header">
        Chosen colors
      </ThemedText>
      {colors.map((c, rank) => {
        const name = paletteColor(c.paletteId)?.name ?? c.paletteId;
        return (
          <ThemedView key={c.paletteId} type="backgroundElement" style={styles.selectedRow}>
            <ColorSwatch hex={c.hex} size={28} backgroundHex={theme.backgroundElement} />
            <ThemedText type="smallBold" style={styles.selectedName}>
              {name}
              <ThemedText type="small" themeColor="textSecondary">
                {rank === 0 ? '  Primary' : '  Secondary'}
              </ThemedText>
            </ThemedText>
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
          </ThemedView>
        );
      })}
    </View>
  );
}

function SmallButton(props: { label: string; accessibilityLabel: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={{ disabled: props.disabled }}
      hitSlop={6}
      style={({ pressed }) => [styles.smallButton, (pressed || props.disabled) && styles.pressed]}>
      <ThemedText type="small" style={styles.smallButtonText}>
        {props.label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  title: { flex: 1 },
  done: { width: 96 },
  content: { padding: Spacing.four, gap: Spacing.three },
  notice: { borderRadius: Spacing.two, padding: Spacing.three },
  errorText: { color: '#d93025' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.three },
  cell: { width: '25%', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.half },
  ring: { padding: 3, borderRadius: 30, borderWidth: 2, borderColor: 'transparent' },
  ringSelected: { borderColor: ACCENT },
  cellText: { textAlign: 'center' },
  badge: { color: ACCENT, fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.6 },
  selectedList: { gap: Spacing.two },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  selectedName: { flex: 1 },
  smallButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: ACCENT,
  },
  smallButtonText: { color: ACCENT },
});
