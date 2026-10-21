import { sameColors } from './color-selection';
import { sameTagSet } from './tags';
import type { Category, ClothingItem, ItemColor, Season } from './types';

/** Adds `season` if absent, removes it if present. Preserves insertion order. */
export function toggleSeason(selected: readonly Season[], season: Season): Season[] {
  return selected.includes(season)
    ? selected.filter((s) => s !== season)
    : [...selected, season];
}

/** The editable fields of the item form (add and edit share these). */
export interface ItemFormValues {
  category: Category | null;
  /** Chosen in the color matrix, primary first (rules in color-selection.ts). Empty until chosen. */
  colors: ItemColor[];
  seasons: Season[];
  /** Normalized tags (see tags.ts). */
  tags: string[];
}

export const EMPTY_ITEM_FORM: Readonly<ItemFormValues> = Object.freeze({
  category: null,
  colors: [],
  seasons: [],
  tags: [],
});

/** Prefills the form from a stored item. Returns copies; editing them does not change `item`. */
export function itemToFormValues(item: ClothingItem): ItemFormValues {
  return {
    category: item.category,
    colors: item.colors.map((c) => ({ ...c })),
    seasons: [...item.seasons],
    tags: [...item.tags],
  };
}

/**
 * True if `draft` differs from `existing` in a field the edit form controls:
 * category, colors (order matters, since the first is the primary color; a
 * changed hex or source counts too, e.g. the user confirming a detected
 * color), seasons, or tags (both compared as sets; order carries no meaning). Photos
 * (see `hasPhotoChanges`), id, and timestamps are not compared. Pass a
 * validated (normalized) draft.
 */
export function hasDetailChanges(existing: ClothingItem, draft: ClothingItem): boolean {
  if (existing.category !== draft.category) return true;
  if (!sameColors(existing.colors, draft.colors)) return true;
  const before = new Set(existing.seasons);
  const after = new Set(draft.seasons);
  if (before.size !== after.size || [...after].some((s) => !before.has(s))) return true;
  return !sameTagSet(existing.tags, draft.tags);
}
