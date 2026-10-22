/**
 * Display labels for categories and seasons. Plain data; the stored values
 * (`Category`, `Season`) never change, only how they read.
 */
import type { Category, Season } from './types';

/** One item: "Top", "Shoes". */
export const CATEGORY_LABELS: Readonly<Record<Category, string>> = Object.freeze({
  top: 'Top',
  bottom: 'Bottom',
  dress: 'Dress',
  outerwear: 'Outerwear',
  shoes: 'Shoes',
  accessory: 'Accessory',
});

/** A group of items, as on the closet filter chips: "Tops", "Shoes". */
export const CATEGORY_PLURAL_LABELS: Readonly<Record<Category, string>> = Object.freeze({
  top: 'Tops',
  bottom: 'Bottoms',
  dress: 'Dresses',
  outerwear: 'Outerwear',
  shoes: 'Shoes',
  accessory: 'Accessories',
});

/** Season names. The value and label stay "autumn" (ROADMAP, Gate 1.5 answers). */
export const SEASON_LABELS: Readonly<Record<Season, string>> = Object.freeze({
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
});
