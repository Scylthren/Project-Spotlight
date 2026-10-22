import { Linking, Text, View } from 'react-native';

import { AttributeFields } from '@/components/attribute-fields';
import { ChipGroup } from '@/components/chip-group';
import { ColorField } from '@/components/color-field';
import { FormButton } from '@/components/form-button';
import { itemFormLook } from '@/components/item-form-style';
import { KeyboardDismissArea } from '@/components/keyboard-dismiss-area';
import { PhotoSetField } from '@/components/photo-set-field';
import { TagField } from '@/components/tag-field';
import { SectionLabel, TextField } from '@/components/ui';
import { CATEGORIES, CATEGORY_LABELS, ITEM_NAME_MAX_LENGTH, SEASON_LABELS, SEASONS, type TagSummary } from '@/core';
import type { ItemFormFields as Fields } from '@/hooks/use-item-form-fields';
import { useTheme } from '@/hooks/use-theme';

interface ItemFormFieldsProps {
  fields: Fields;
  /** Text inside the empty photo area, before the front photo is added. */
  emptyPhotoHint: string;
  savedTags: { tags: TagSummary[]; error: string | null };
  onDeleteSavedTag: (summary: TagSummary, confirm: () => Promise<boolean>) => void;
  /**
   * True while the item is being saved or deleted, or a saved tag is being
   * deleted. Locks every input (photo buttons, name, category, colors,
   * seasons, tags), so a pick or edit made mid-save is not lost when the form
   * resets.
   */
  busy: boolean;
}

/**
 * Photos (see `PhotoSetField`), colors, name, category, attributes (type,
 * pattern, material, fit, formality; see `AttributeFields`), seasons, style
 * tags, and errors, in the order of SaveItem.dc.html. Used by Add and Edit. Taps
 * outside the name box and the tag area close the keyboard
 * (`KeyboardDismissArea`; the text boxes stay outside it, or a tap into one
 * would close the keyboard it just opened). The parent's content container
 * uses the same gap as `itemFormLook().body`, so the wrappers do not change
 * the layout.
 */
export function ItemFormFields({
  fields,
  emptyPhotoHint,
  savedTags,
  onDeleteSavedTag,
  busy,
}: ItemFormFieldsProps) {
  const theme = useTheme();
  const form = itemFormLook(theme);
  const { values } = fields;

  return (
    <>
      <KeyboardDismissArea style={{ gap: form.body.gap }}>
        <PhotoSetField fields={fields} emptyHint={emptyPhotoHint} busy={busy} />
        <ColorField fields={fields} disabled={busy} />
      </KeyboardDismissArea>

      <TextField
        variant="underline"
        label="Name"
        value={values.name ?? ''}
        onChangeText={fields.setName}
        placeholder="Optional, e.g. Black band hoodie"
        hint={`Up to ${ITEM_NAME_MAX_LENGTH} characters. Without a name, the category is shown.`}
        maxLength={ITEM_NAME_MAX_LENGTH}
        autoCapitalize="sentences"
        returnKeyType="done"
        disabled={busy}
      />

      <KeyboardDismissArea style={{ gap: form.body.gap }}>
        <View style={form.section}>
          <SectionLabel>Category</SectionLabel>
          <ChipGroup
            accessibilityLabel="Category"
            options={CATEGORIES}
            isSelected={(c) => c === values.category}
            onPress={fields.setCategory}
            formatLabel={(c) => CATEGORY_LABELS[c]}
            disabled={busy}
          />
        </View>

      </KeyboardDismissArea>

      <AttributeFields fields={fields} disabled={busy} />

      <KeyboardDismissArea style={{ gap: form.body.gap }}>
        <View style={form.section}>
          <SectionLabel>Seasons</SectionLabel>
          <ChipGroup
            accessibilityLabel="Seasons"
            options={SEASONS}
            isSelected={(s) => values.seasons.includes(s)}
            onPress={fields.toggleSeason}
            formatLabel={(s) => SEASON_LABELS[s]}
            disabled={busy}
          />
        </View>
      </KeyboardDismissArea>

      <TagField fields={fields} savedTags={savedTags} onDeleteSavedTag={onDeleteSavedTag} disabled={busy} />

      {fields.errors.length > 0 && (
        <KeyboardDismissArea>
          <View accessibilityLiveRegion="polite" style={form.section}>
            {fields.errors.map((e) => (
              <Text key={e} style={form.error}>
                {e}
              </Text>
            ))}
            {fields.suggestSettings && (
              <FormButton label="Open Settings" variant="secondary" onPress={() => void Linking.openSettings()} />
            )}
          </View>
        </KeyboardDismissArea>
      )}
    </>
  );
}
