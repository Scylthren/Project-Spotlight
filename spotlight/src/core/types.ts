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
  /** Local or remote URI of the item's photo. */
  imageUri: string;
  category: Category;
  /** Free-form color names, primary color first. At least one. */
  colors: string[];
  /** Seasons the item suits. At least one, no duplicates. */
  seasons: Season[];
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}
