import { toggleSeason } from './closet-form';
import { CATEGORIES, SEASONS, type Category, type ColorSource, type Season } from './types';

/**
 * Category and seasons in the item form, with where each came from (Gate 2
 * slice 3 rule: the AI suggests them under the same auto/user rule as the D6
 * attributes). `source` 'user' means the user touched the field (picked a
 * category, or toggled any season); suggestions leave it alone. 'auto' means
 * untouched: empty, or filled by a suggestion for the current front photo.
 *
 * The source is form state only; it is not stored. A value loaded from a
 * saved item counts as the user's (the user saved it), so Edit never
 * replaces a stored category or non-empty seasons. Empty seasons on a saved
 * item are untouched and can be suggested again when the front photo is
 * retaken (as with a cleared D6 attribute).
 */
export interface CategorySeasonFields {
  category: { value: Category | null; source: ColorSource };
  seasons: { value: Season[]; source: ColorSource };
}

/** The fields for values loaded into the form (a saved item, or a blank form). */
export function categorySeasonFields(category: Category | null, seasons: readonly Season[]): CategorySeasonFields {
  return {
    category: { value: category, source: category === null ? 'auto' : 'user' },
    seasons: { value: [...seasons], source: seasons.length === 0 ? 'auto' : 'user' },
  };
}

/** The user picks a category. */
export function pickCategory(fields: CategorySeasonFields, category: Category | null): CategorySeasonFields {
  return { ...fields, category: { value: category, source: 'user' } };
}

/** The user toggles a season; all seasons become the user's. */
export function toggleFormSeason(fields: CategorySeasonFields, season: Season): CategorySeasonFields {
  return { ...fields, seasons: { value: toggleSeason(fields.seasons.value, season), source: 'user' } };
}

/** Suggested category and seasons; anything missing, unknown or out of list is dropped. */
export interface CategorySeasonSuggestions {
  category?: unknown;
  seasons?: unknown;
}

function cleanSeasons(value: unknown): Season[] {
  if (!Array.isArray(value)) return [];
  return SEASONS.filter((season) => value.includes(season));
}

/**
 * Applies suggestions for the current front photo: each field the user has
 * not touched takes the suggestion as 'auto' (or becomes empty when there is
 * none). Fields the user touched never change.
 */
export function applyCategorySeasonSuggestions(
  fields: CategorySeasonFields,
  suggestions: CategorySeasonSuggestions,
): CategorySeasonFields {
  const category = (CATEGORIES as readonly unknown[]).includes(suggestions.category)
    ? (suggestions.category as Category)
    : null;
  return {
    category: fields.category.source === 'user' ? fields.category : { value: category, source: 'auto' },
    seasons: fields.seasons.source === 'user' ? fields.seasons : { value: cleanSeasons(suggestions.seasons), source: 'auto' },
  };
}

/** The front photo the suggestions came from is gone: untouched values are cleared. */
export function clearSuggestedCategorySeason(fields: CategorySeasonFields): CategorySeasonFields {
  return applyCategorySeasonSuggestions(fields, {});
}

/** True when the field holds a value suggested from the photo (shown as "Suggested"). */
export function isSuggestedValue(field: { value: unknown; source: ColorSource }): boolean {
  if (field.source !== 'auto') return false;
  return Array.isArray(field.value) ? field.value.length > 0 : field.value !== null;
}
