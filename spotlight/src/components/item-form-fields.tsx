import { Image } from 'expo-image';
import { Linking, StyleSheet, TextInput, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { FormButton } from '@/components/form-button';
import { TagField } from '@/components/tag-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { CATEGORIES, SEASONS, type TagSummary } from '@/core';
import type { ItemFormFields as Fields } from '@/hooks/use-item-form-fields';
import { useTheme } from '@/hooks/use-theme';

interface ItemFormFieldsProps {
  fields: Fields;
  /** Photo to show: a newly picked one, or the item's stored photo. */
  photoUri: string | null;
  /** Short text under the photo (or inside the empty photo area). */
  photoHint: string;
  savedTags: { tags: TagSummary[]; error: string | null };
  onDeleteSavedTag: (summary: TagSummary, confirm: () => Promise<boolean>) => void;
  /**
   * True while the item is being saved or deleted, or a saved tag is being
   * deleted. Locks every input (photo buttons, category, colors, seasons,
   * tags), so a pick or edit made mid-save is not lost when the form resets.
   */
  busy: boolean;
}

/**
 * Photo (with Take photo / Choose from library), category, colors, seasons,
 * tags, and errors. Used by Add and Edit.
 */
export function ItemFormFields({
  fields,
  photoUri,
  photoHint,
  savedTags,
  onDeleteSavedTag,
  busy,
}: ItemFormFieldsProps) {
  const theme = useTheme();
  const { values } = fields;
  const photoLocked = fields.pickingPhoto || busy;

  return (
    <>
      <ThemedView type="backgroundElement" style={styles.photo}>
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={styles.photoImage}
            contentFit="cover"
            accessibilityLabel="Item photo"
          />
        ) : (
          <ThemedText themeColor="textSecondary">{photoHint}</ThemedText>
        )}
      </ThemedView>
      {photoUri && (
        <ThemedText type="small" themeColor="textSecondary">
          {photoHint}
        </ThemedText>
      )}
      <View style={styles.photoButtons}>
        <View style={styles.photoButton}>
          <FormButton
            label="Take photo"
            variant="secondary"
            onPress={() => fields.pickPhoto('camera')}
            disabled={photoLocked}
          />
        </View>
        <View style={styles.photoButton}>
          <FormButton
            label="Choose from library"
            variant="secondary"
            onPress={() => fields.pickPhoto('library')}
            disabled={photoLocked}
          />
        </View>
      </View>

      <ThemedText type="smallBold">Category</ThemedText>
      <ChipGroup
        accessibilityLabel="Category"
        options={CATEGORIES}
        isSelected={(c) => c === values.category}
        onPress={fields.setCategory}
        disabled={busy}
      />

      <ThemedText type="smallBold">Colors (comma separated)</ThemedText>
      <TextInput
        value={values.colorsText}
        onChangeText={fields.setColorsText}
        placeholder="navy, white"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        accessibilityLabel="Colors"
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />

      <ThemedText type="smallBold">Seasons</ThemedText>
      <ChipGroup
        accessibilityLabel="Seasons"
        options={SEASONS}
        isSelected={(s) => values.seasons.includes(s)}
        onPress={fields.toggleSeason}
        disabled={busy}
      />

      <TagField fields={fields} savedTags={savedTags} onDeleteSavedTag={onDeleteSavedTag} disabled={busy} />

      {fields.errors.length > 0 && (
        <ThemedView accessibilityLiveRegion="polite" style={styles.errors}>
          {fields.errors.map((e) => (
            <ThemedText key={e} type="small" style={styles.errorText}>
              {e}
            </ThemedText>
          ))}
          {fields.suggestSettings && (
            <FormButton label="Open Settings" variant="secondary" onPress={() => void Linking.openSettings()} />
          )}
        </ThemedView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  photo: {
    aspectRatio: 1,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: { width: '100%', height: '100%' },
  photoButtons: { flexDirection: 'row', gap: Spacing.two },
  photoButton: { flex: 1 },
  input: { borderRadius: Spacing.two, padding: Spacing.three, fontSize: 16 },
  errors: { gap: Spacing.one },
  errorText: { color: '#d93025' },
});
