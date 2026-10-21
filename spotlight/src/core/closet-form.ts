import { sameTagSet } from './tags';
import type { Category, ClothingItem, Season } from './types';

/**
 * Splits free-text color input ("navy, white") into a list. Normalization
 * (trim, lowercase, dedupe) happens in `createClothingItem`; this only splits.
 */
export function parseColors(text: string): string[] {
  return text.split(',');
}

/** Adds `season` if absent, removes it if present. Preserves insertion order. */
export function toggleSeason(selected: readonly Season[], season: Season): Season[] {
  return selected.includes(season)
    ? selected.filter((s) => s !== season)
    : [...selected, season];
}

/** The editable fields of the item form (add and edit share these). */
export interface ItemFormValues {
  category: Category | null;
  /** Free text, comma separated. */
  colorsText: string;
  seasons: Season[];
  /** Normalized tags (see tags.ts). */
  tags: string[];
}

export const EMPTY_ITEM_FORM: Readonly<ItemFormValues> = Object.freeze({
  category: null,
  colorsText: '',
  seasons: [],
  tags: [],
});

/** Prefills the form from a stored item. `parseColors` on the result gives the colors back. */
export function itemToFormValues(item: ClothingItem): ItemFormValues {
  return {
    category: item.category,
    colorsText: item.colors.join(', '),
    seasons: [...item.seasons],
    tags: [...item.tags],
  };
}

/**
 * True if `draft` differs from `existing` in a field the edit form controls:
 * category, colors (order matters, since the first is the primary color),
 * seasons, or tags (both compared as sets; order carries no meaning). Photo, id, and
 * timestamps are not compared. Pass a validated (normalized) draft.
 */
export function hasDetailChanges(existing: ClothingItem, draft: ClothingItem): boolean {
  if (existing.category !== draft.category) return true;
  if (existing.colors.length !== draft.colors.length) return true;
  if (existing.colors.some((c, i) => c !== draft.colors[i])) return true;
  const before = new Set(existing.seasons);
  const after = new Set(draft.seasons);
  if (before.size !== after.size || [...after].some((s) => !before.has(s))) return true;
  return !sameTagSet(existing.tags, draft.tags);
}
