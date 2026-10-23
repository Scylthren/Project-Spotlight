import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { ColorSwatch } from '@/components/color-swatch';
import { FormButton } from '@/components/form-button';
import {
  describeDraftHeadline,
  describeDraftStatus,
  describeMissing,
  isDraftAnalyzing,
  missingFields,
  type ImportDraft,
} from '@/data/import-session';
import { useTheme } from '@/hooks/use-theme';

import { importReviewLook } from './import-review-style';

interface ImportDraftRowProps {
  draft: ImportDraft;
  /** 1-based position in the list, and the list length. */
  position: number;
  total: number;
  onOpen: () => void;
  onRemove: () => void;
  /** True while the import saves: nothing can be opened or removed. */
  disabled: boolean;
  first: boolean;
}

/**
 * One photo of the import: its photo, what it will be saved as (name or
 * category, type and other details, colors), its own status (waiting,
 * getting suggestions, suggested, no suggestions, saving, not saved), and in
 * red what it still needs or why it could not be saved. Tapping the photo or
 * text, or "Edit", opens the draft's details.
 */
export function ImportDraftRow({ draft, position, total, onOpen, onRemove, disabled, first }: ImportDraftRowProps) {
  const theme = useTheme();
  const look = importReviewLook(theme);
  const headline = describeDraftHeadline(draft);
  const status = describeDraftStatus(draft);
  const needs = isDraftAnalyzing(draft) ? null : describeMissing(missingFields(draft));
  const errors = draft.save.status === 'failed' ? draft.save.errors : [];
  const spoken = [`Photo ${position} of ${total}`, headline.title, headline.details, headline.colors, status, needs, ...errors]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={look.row(first)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint="Opens the details to check or change them"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onOpen}
        style={({ pressed }) => look.rowButton(pressed && !disabled)}>
        <View style={look.thumbnail}>
          <Image source={{ uri: draft.photo.uri }} style={look.thumbnailImage} contentFit="cover" recyclingKey={draft.id} />
        </View>
        <View style={look.body}>
          <Text style={look.position}>{`Photo ${position} of ${total}`}</Text>
          <Text style={draft.categorySeason.category.value || draft.name.trim() ? look.title : look.titleMissing} numberOfLines={1}>
            {headline.title}
          </Text>
          {headline.details ? (
            <Text style={look.details} numberOfLines={2}>
              {headline.details}
            </Text>
          ) : null}
          {draft.colors.length > 0 ? (
            <View style={look.colorRow}>
              {draft.colors.map((c) => (
                <ColorSwatch key={c.paletteId} hex={c.hex} size={look.swatchSize} />
              ))}
              <Text style={look.colorNames} numberOfLines={1}>
                {headline.colors}
              </Text>
            </View>
          ) : null}
          <Text style={look.status}>{status}</Text>
          {needs ? <Text style={look.attention}>{needs}</Text> : null}
          {errors.map((e) => (
            <Text key={e} style={look.attention}>
              {e}
            </Text>
          ))}
        </View>
      </Pressable>
      <View style={look.rowActions}>
        <FormButton label="Edit" variant="text" onPress={onOpen} disabled={disabled} accessibilityLabel={`Edit photo ${position}`} />
        <FormButton
          label="Remove"
          variant="text"
          onPress={onRemove}
          disabled={disabled}
          accessibilityLabel={`Remove photo ${position} from the import`}
        />
      </View>
    </View>
  );
}
