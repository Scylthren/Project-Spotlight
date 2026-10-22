import { useRef } from 'react';
import { Text, View, type TextInput } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { confirmDelete } from '@/components/confirm-delete';
import { itemFormLook } from '@/components/item-form-style';
import { Chip, SectionLabel, TextField } from '@/components/ui';
import { describeTagDeletion, filterTags, TAG_MAX_LENGTH, tagReturnKeyAction, type TagSummary } from '@/core';
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
 * The item's style tags (SaveItem.dc.html "Style": italic serif chips, tap to
 * remove), a box to type a new one ("+ Add" or the return key), and the saved
 * tag list filtered by what is typed: tap to toggle a tag on this item,
 * long-press to delete it from the list after confirming.
 *
 * Keyboard: "Done" with text adds the tag and keeps the keyboard up for the
 * next one; "Done" on an empty box closes it (`tagReturnKeyAction`). Taps on
 * the chips and "Add" keep it up too; taps elsewhere in the form close it.
 */
export function TagField({ fields, savedTags, onDeleteSavedTag, disabled }: TagFieldProps) {
  const theme = useTheme();
  const form = itemFormLook(theme);
  const itemTags = fields.values.tags;
  const matches = filterTags(savedTags.tags, fields.tagText);
  const byName = new Map(savedTags.tags.map((t) => [t.name, t]));
  const input = useRef<TextInput>(null);

  function onReturnKey() {
    if (tagReturnKeyAction(fields.tagText) === 'close-keyboard') input.current?.blur();
    else fields.addTypedTag();
  }

  function askDelete(name: string) {
    const summary = byName.get(name);
    if (!summary) return;
    onDeleteSavedTag(summary, () => confirmDelete(`the tag "${name}"`, describeTagDeletion(summary)));
  }

  return (
    <View style={form.section}>
      <SectionLabel>Style tags</SectionLabel>
      {itemTags.length > 0 ? (
        <ChipGroup
          accessibilityLabel="Tags on this item"
          variant="styleTag"
          options={itemTags}
          isSelected={() => true}
          onPress={fields.removeTag}
          formatLabel={(tag) => `${tag}  ×`}
          formatAccessibilityLabel={asIs}
          chipAccessibilityHint="Removes the tag from this item"
          disabled={disabled}
        />
      ) : (
        <Text style={form.caption}>No tags yet. Add your own, like 90s or work.</Text>
      )}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <TextField
            ref={input}
            label="New tag"
            labelHidden
            value={fields.tagText}
            onChangeText={fields.setTagText}
            onSubmitEditing={onReturnKey}
            // Keep focus on return; `onReturnKey` blurs when the box is empty.
            submitBehavior="submit"
            returnKeyType="done"
            placeholder="New tag"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={TAG_MAX_LENGTH * 2}
            disabled={disabled}
          />
        </View>
        <Chip variant="add" casing="sentence" label="Add" onPress={fields.addTypedTag} disabled={disabled} />
      </View>
      {fields.tagProblem && (
        <Text style={form.error} accessibilityLiveRegion="polite">
          {fields.tagProblem}
        </Text>
      )}
      {savedTags.error && (
        <Text style={form.error} accessibilityLiveRegion="polite">
          {savedTags.error}
        </Text>
      )}
      {savedTags.tags.length > 0 && (
        <>
          <Text style={form.caption}>Your tags: tap to add or remove. Long-press to delete one from your list.</Text>
          {matches.length > 0 ? (
            <ChipGroup
              accessibilityLabel="Your saved tags"
              variant="styleTag"
              options={matches.map((t) => t.name)}
              isSelected={(name) => itemTags.includes(name)}
              onPress={fields.toggleTag}
              onLongPress={askDelete}
              longPressLabel="Delete tag from your list"
              formatLabel={asIs}
              disabled={disabled}
            />
          ) : (
            <Text style={form.caption}>No saved tag matches. Tap Add to create it.</Text>
          )}
        </>
      )}
    </View>
  );
}
