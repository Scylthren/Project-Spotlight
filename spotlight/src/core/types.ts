/**
 * Core domain types. Plain TypeScript, no React or Expo imports.
 */
import type { PaletteId } from './palette';

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

/**
 * Which angle a photo shows: the front (required), the back, or a close-up
 * detail (a label, a print, a texture). Rules for combining them are in
 * photo-set.ts.
 */
export const PHOTO_ROLES = ['front', 'back', 'detail'] as const;
export type PhotoRole = (typeof PHOTO_ROLES)[number];

/** One photo of an item. */
export interface ItemPhoto {
  /** Unique across the whole closet, not just within the item. */
  id: string;
  role: PhotoRole;
  /**
   * Stored reference relative to app storage (e.g.
   * `closet-images/<itemId>-<suffix>.jpg`, resolved by `ImageStore.resolveUri`)
   * or an absolute URI.
   */
  path: string;
  /** Display position within the item: 0, 1, 2, ... matching the array index. */
  sortOrder: number;
  /** The photo shown in the grid. Exactly one per item; any role may be primary. */
  isPrimary: boolean;
}

/**
 * Where an item color came from: chosen by the user in the color matrix, or
 * detected from the photo (slice 4). Any color the user picks or changes is
 * 'user'.
 */
export const COLOR_SOURCES = ['auto', 'user'] as const;
export type ColorSource = (typeof COLOR_SOURCES)[number];

/** One of an item's colors (rules in color-selection.ts). */
export interface ItemColor {
  /** A palette color id (palette.ts). Unique within the item. */
  paletteId: PaletteId;
  /**
   * Uppercase `#RRGGBB`. The palette's reference hex for a color the user
   * picked; the measured hex for a detected one (or a legacy hex value).
   */
  hex: string;
  source: ColorSource;
}

/** A single garment in the user's closet. */
export interface ClothingItem {
  /** Stable unique ID. Outfits reference items by this ID. */
  id: string;
  /**
   * What the user calls the item ("Black band hoodie"). Optional: absent
   * when the user gave none (never an empty string). Trimmed, at most
   * ITEM_NAME_MAX_LENGTH characters (item-name.ts). Screens fall back to the
   * category (`itemDisplayName`).
   */
  name?: string;
  /**
   * The item's photos in display order (see photo-set.ts for the rules:
   * exactly one front, at most one back, at most two details, at most four
   * in total, exactly one primary).
   */
  photos: ItemPhoto[];
  category: Category;
  /**
   * Palette colors, primary first, then up to two secondaries in order
   * (1 to MAX_ITEM_COLORS entries, unique palette ids).
   */
  colors: ItemColor[];
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
