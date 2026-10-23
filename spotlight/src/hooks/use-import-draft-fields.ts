import { useState } from 'react';

import {
  addTag,
  COLOR_MESSAGES,
  isSuggestedValue,
  makePrimaryColor,
  removeTag,
  TAG_MESSAGES,
  toggleColor,
  toggleTag,
  type AttributeValueMap,
  type Category,
  type ChoiceAttributeName,
  type ColorSelectionResult,
  type ItemColor,
  type Season,
  type TagListResult,
} from '@/core';
import { draftValues, type ImportDraft, type ImportSession } from '@/data/import-session';

/**
 * The fields of one import draft in the shape the shared form pieces take
 * (`ColorField`, `AttributeFields`, `TagField`, plus category and seasons).
 * Every change goes straight to the session, which marks it as the user's;
 * only view state (the open color matrix, the tag box) lives here. The rules
 * are the item form's (core/color-selection.ts, core/tags.ts).
 */
export function useImportDraftFields(session: ImportSession, draft: ImportDraft) {
  const id = draft.id;
  const [colorMatrix, setColorMatrix] = useState<{ notice: string | null } | null>(null);
  const [colorProblem, setColorProblem] = useState<string | null>(null);
  const [tagText, setTagTextState] = useState('');
  const [tagProblem, setTagProblem] = useState<string | null>(null);

  function applyColors(change: (current: ItemColor[]) => ColorSelectionResult) {
    const refused: ColorSelectionResult | null = session.changeColors(id, change);
    setColorProblem(refused && !refused.ok ? COLOR_MESSAGES[refused.problem] : null);
  }

  function applyTags(change: (current: string[]) => TagListResult): boolean {
    const result: TagListResult | null = session.changeTags(id, change);
    if (result && !result.ok) {
      setTagProblem(TAG_MESSAGES[result.problem]);
      return false;
    }
    setTagProblem(null);
    return result !== null;
  }

  return {
    values: { ...draftValues(draft), name: draft.name },
    setName: (name: string) => session.setName(id, name),
    setCategory: (category: Category | null) => session.setCategory(id, category),
    categorySuggested: isSuggestedValue(draft.categorySeason.category),
    toggleSeason: (season: Season) => session.toggleSeason(id, season),
    seasonsSuggested: isSuggestedValue(draft.categorySeason.seasons),
    // Colors (ColorField).
    detectingColors: draft.detectingColors,
    colorMatrix,
    colorProblem,
    openColorMatrix: (notice: string | null = null) => setColorMatrix({ notice }),
    closeColorMatrix: () => {
      setColorMatrix(null);
      setColorProblem(null);
    },
    toggleColor: (paletteId: string) => applyColors((current) => toggleColor(current, paletteId)),
    makePrimaryColor: (paletteId: string) => applyColors((current) => makePrimaryColor(current, paletteId)),
    // Attributes (AttributeFields).
    suggestingTags: draft.suggestion === 'waiting' || draft.suggestion === 'tagging',
    noSuggestions: draft.suggestion === 'no-suggestions',
    setItemType: (text: string) => session.setItemType(id, text),
    toggleAttribute: <K extends ChoiceAttributeName>(name: K, value: AttributeValueMap[K]) =>
      session.toggleAttribute(id, name, value),
    // Style tags (TagField).
    tagText,
    setTagText: (text: string) => {
      setTagTextState(text);
      setTagProblem(null);
    },
    tagProblem,
    addTypedTag: () => {
      if (applyTags((current) => addTag(current, tagText))) setTagTextState('');
    },
    toggleTag: (tag: string) => void applyTags((current) => toggleTag(current, tag)),
    removeTag: (tag: string) => void applyTags((current) => ({ ok: true, tags: removeTag(current, tag) })),
  };
}

export type ImportDraftFields = ReturnType<typeof useImportDraftFields>;
