/**
 * Core domain types. Plain TypeScript, no React or Expo imports.
 */

export const CATEGORIES = [
  'top',
  'bottom',
  'dress',
  'outerwear',
  'shoes',
  'accessory',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

/** A single garment in the user's closet. */
export interface ClothingItem {
  /** Stable unique ID. Outfits reference items by this ID. */
  id: string;
  /**
   * The item's photo: either a stored reference relative to app storage
   * (e.g. `closet-images/<id>-<suffix>.jpg`, resolved by `ImageStore.resolveUri`) or
   * an absolute URI.
   */
  imageUri: string;
  category: Category;
  /** Free-form color names, primary color first. At least one. */
  colors: string[];
  /** Seasons the item suits. At least one, no duplicates. */
  seasons: Season[];
  /**
   * User-defined style tags ("90s", "emo"), normalized (see `normalizeTag` in
   * tags.ts): lowercase, trimmed, unique, at most MAX_TAGS_PER_ITEM. Order is
   * the order the user added them and carries no meaning. May be empty.
   */
  tags: string[];
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}
