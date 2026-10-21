import { Linking, StyleSheet } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { ColorField } from '@/components/color-field';
import { FormButton } from '@/components/form-button';
import { KeyboardDismissArea } from '@/components/keyboard-dismiss-area';
import { PhotoSetField } from '@/components/photo-set-field';
import { TagField } from '@/components/tag-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { CATEGORIES, SEASONS, type TagSummary } from '@/core';
import type { ItemFormFields as Fields } from '@/hooks/use-item-form-fields';

interface ItemFormFieldsProps {
  fields: Fields;
  /** Text inside the empty photo area, before the front photo is added. */
  emptyPhotoHint: string;
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
 * Photos (see `PhotoSetField`), category, colors, seasons, tags, and errors.
 * Used by Add and Edit. Taps outside the tag area close the keyboard
 * (`KeyboardDismissArea`). The parent's content container uses the same gap
 * as `styles.section`, so the wrappers do not change the layout.
 */
export function ItemFormFields({
  fields,
  emptyPhotoHint,
  savedTags,
  onDeleteSavedTag,
  busy,
}: ItemFormFieldsProps) {
  const { values } = fields;

  return (
    <>
      <KeyboardDismissArea style={styles.section}>
        <PhotoSetField fields={fields} emptyHint={emptyPhotoHint} busy={busy} />

        <ThemedText type="smallBold">Category</ThemedText>
        <ChipGroup
          accessibilityLabel="Category"
          options={CATEGORIES}
          isSelected={(c) => c === values.category}
          onPress={fields.setCategory}
          disabled={busy}
        />

        <ColorField fields={fields} disabled={busy} />

        <ThemedText type="smallBold">Seasons</ThemedText>
        <ChipGroup
          accessibilityLabel="Seasons"
          options={SEASONS}
          isSelected={(s) => values.seasons.includes(s)}
          onPress={fields.toggleSeason}
          disabled={busy}
        />
      </KeyboardDismissArea>

      <TagField fields={fields} savedTags={savedTags} onDeleteSavedTag={onDeleteSavedTag} disabled={busy} />

      {fields.errors.length > 0 && (
        <KeyboardDismissArea>
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
        </KeyboardDismissArea>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Same gap as the screens' content containers.
  section: { gap: Spacing.three },
  errors: { gap: Spacing.one },
  errorText: { color: '#d93025' },
});
