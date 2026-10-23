import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { AttributeFields } from '@/components/attribute-fields';
import { ChipGroup } from '@/components/chip-group';
import { ColorField } from '@/components/color-field';
import { itemFormLook, photoSetLook } from '@/components/item-form-style';
import { KeyboardDismissArea } from '@/components/keyboard-dismiss-area';
import { TagField } from '@/components/tag-field';
import { SectionLabel, TextField } from '@/components/ui';
import { CATEGORIES, CATEGORY_LABELS, ITEM_NAME_MAX_LENGTH, SEASON_LABELS, SEASONS, type TagSummary } from '@/core';
import { describeMissing, isDraftAnalyzing, missingFields, type ImportDraft } from '@/data/import-session';
import type { ImportDraftFields } from '@/hooks/use-import-draft-fields';
import { useTheme } from '@/hooks/use-theme';

interface ImportDraftFormProps {
  draft: ImportDraft;
  fields: ImportDraftFields;
  savedTags: { tags: TagSummary[]; error: string | null };
  onDeleteSavedTag: (summary: TagSummary, confirm: () => Promise<boolean>) => void;
  disabled: boolean;
}

/**
 * The details of one import draft, with the Add form's pieces in its order
 * (SaveItem.dc.html): the photo (fixed: one photo per item, D9; other angles
 * are added later through Edit), colors, name, category, attributes,
 * seasons, style tags. What the draft still needs is said at the top, in red.
 */
export function ImportDraftForm({ draft, fields, savedTags, onDeleteSavedTag, disabled }: ImportDraftFormProps) {
  const theme = useTheme();
  const form = itemFormLook(theme);
  const photo = photoSetLook(theme);
  const { values } = fields;
  const needs = isDraftAnalyzing(draft) ? null : describeMissing(missingFields(draft));

  return (
    <>
      <KeyboardDismissArea style={{ gap: form.body.gap }}>
        <View style={form.section}>
          <SectionLabel>Photo</SectionLabel>
          <View style={photo.preview}>
            <Image source={{ uri: draft.photo.uri }} style={photo.previewImage} contentFit="contain" accessibilityLabel="Front photo" />
          </View>
          <Text style={form.caption}>One photo per piece. Add other angles later from the piece’s Edit screen.</Text>
          {needs ? (
            <Text style={form.error} accessibilityLiveRegion="polite">
              {`${needs} before it can be saved.`}
            </Text>
          ) : null}
          {draft.save.status === 'failed'
            ? draft.save.errors.map((e) => (
                <Text key={e} style={form.error}>
                  {e}
                </Text>
              ))
            : null}
        </View>
        <ColorField fields={fields} disabled={disabled} />
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
        disabled={disabled}
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
            disabled={disabled}
          />
          {fields.categorySuggested ? <Text style={form.note}>Suggested</Text> : null}
        </View>
      </KeyboardDismissArea>

      <AttributeFields fields={fields} disabled={disabled} />

      <KeyboardDismissArea style={{ gap: form.body.gap }}>
        <View style={form.section}>
          <SectionLabel>Seasons</SectionLabel>
          <ChipGroup
            accessibilityLabel="Seasons"
            options={SEASONS}
            isSelected={(s) => values.seasons.includes(s)}
            onPress={fields.toggleSeason}
            formatLabel={(s) => SEASON_LABELS[s]}
            disabled={disabled}
          />
          {fields.seasonsSuggested ? <Text style={form.note}>Suggested</Text> : null}
        </View>
      </KeyboardDismissArea>

      <TagField fields={fields} savedTags={savedTags} onDeleteSavedTag={onDeleteSavedTag} disabled={disabled} />
    </>
  );
}
