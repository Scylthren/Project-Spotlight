import { StyleSheet, TextInput, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { confirmDelete } from '@/components/confirm-delete';
import { FormButton } from '@/components/form-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { describeTagDeletion, filterTags, TAG_MAX_LENGTH, type TagSummary } from '@/core';
import type { ItemFormFields } from '@/hooks/use-item-form-fields';
import { useTheme } from '@/hooks/use-theme';

interface TagFieldProps {
  fields: ItemFormFields;
  savedTags: { tags: TagSummary[]; error: string | null };
  onDeleteSavedTag: (summary: TagSummary, confirm: () => Promise<boolean>) => void;
  disabled: boolean;
}

const asIs = (tag: string) => tag;

/**
 * The item's tags (tap to remove), a box to type a new one (Add or the return
 * key), and the saved tag list filtered by what is typed: tap to toggle a tag
 * on this item, long-press to delete it from the list after confirming.
 */
export function TagField({ fields, savedTags, onDeleteSavedTag, disabled }: TagFieldProps) {
  const theme = useTheme();
  const itemTags = fields.values.tags;
  const matches = filterTags(savedTags.tags, fields.tagText);
  const byName = new Map(savedTags.tags.map((t) => [t.name, t]));

  function askDelete(name: string) {
    const summary = byName.get(name);
    if (!summary) return;
    onDeleteSavedTag(summary, () => confirmDelete(`the tag "${name}"`, describeTagDeletion(summary)));
  }

  return (
    <>
      <ThemedText type="smallBold">Tags</ThemedText>
      {itemTags.length > 0 ? (
        <ChipGroup
          accessibilityLabel="Tags on this item"
          options={itemTags}
          isSelected={() => true}
          onPress={fields.removeTag}
          formatLabel={(tag) => `${tag}  ×`}
          chipAccessibilityHint="Removes the tag from this item"
          disabled={disabled}
        />
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          No tags yet. Add your own, like 90s or work.
        </ThemedText>
      )}
      <View style={styles.inputRow}>
        <TextInput
          value={fields.tagText}
          onChangeText={fields.setTagText}
          onSubmitEditing={fields.addTypedTag}
          submitBehavior="submit"
          returnKeyType="done"
          placeholder="New tag"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={TAG_MAX_LENGTH * 2}
          editable={!disabled}
          accessibilityLabel="New tag"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <View style={styles.addButton}>
          <FormButton label="Add" variant="secondary" onPress={fields.addTypedTag} disabled={disabled} />
        </View>
      </View>
      {fields.tagProblem && (
        <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">
          {fields.tagProblem}
        </ThemedText>
      )}
      {savedTags.error && (
        <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">
          {savedTags.error}
        </ThemedText>
      )}
      {savedTags.tags.length > 0 && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Your tags: tap to add or remove. Long-press to delete one from your list.
          </ThemedText>
          {matches.length > 0 ? (
            <ChipGroup
              accessibilityLabel="Your saved tags"
              options={matches.map((t) => t.name)}
              isSelected={(name) => itemTags.includes(name)}
              onPress={fields.toggleTag}
              onLongPress={askDelete}
              longPressLabel="Delete tag from your list"
              formatLabel={asIs}
              disabled={disabled}
            />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              No saved tag matches. Tap Add to create it.
            </ThemedText>
          )}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  input: { flex: 1, borderRadius: Spacing.two, padding: Spacing.three, fontSize: 16 },
  addButton: { width: 88 },
  errorText: { color: '#d93025' },
});
