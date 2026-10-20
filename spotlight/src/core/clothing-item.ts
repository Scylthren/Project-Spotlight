import {
  CATEGORIES,
  SEASONS,
  type Category,
  type ClothingItem,
  type Season,
} from './types';

export interface NewClothingItemInput {
  id: string;
  imageUri: string;
  category: Category;
  colors: string[];
  seasons: Season[];
}

export type ValidationResult =
  | { ok: true; item: ClothingItem }
  | { ok: false; errors: string[] };

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

export function isSeason(value: unknown): value is Season {
  return typeof value === 'string' && (SEASONS as readonly string[]).includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Non-empty after trimming, with no leading or trailing whitespace. */
function isTrimmedNonEmptyString(value: unknown): value is string {
  return isNonEmptyString(value) && value.trim() === value;
}

/**
 * Strict ISO 8601 timestamp: YYYY-MM-DDTHH:mm:ss, optional fractional
 * seconds, and a required `Z` or `±HH:MM` offset. Must also be a real
 * calendar date and time (no Feb 30, no hour 25).
 */
const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = ISO_TIMESTAMP.exec(value);
  if (!m) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return false;
  if (m[9] !== undefined && (Number(m[9]) > 23 || Number(m[10]) > 59)) return false;
  return !Number.isNaN(Date.parse(value));
}

/** Returns a list of problems with `value` as a ClothingItem. Empty means valid. */
export function validateClothingItem(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) {
    return ['item must be an object'];
  }
  const v = value as Record<string, unknown>;
  const errors: string[] = [];

  if (!isNonEmptyString(v.id)) errors.push('id must be a non-empty string');
  else if (!isTrimmedNonEmptyString(v.id)) errors.push('id must not have leading or trailing whitespace');
  if (!isNonEmptyString(v.imageUri)) errors.push('imageUri must be a non-empty string');
  else if (!isTrimmedNonEmptyString(v.imageUri)) {
    errors.push('imageUri must not have leading or trailing whitespace');
  }
  if (!isCategory(v.category)) errors.push(`category must be one of: ${CATEGORIES.join(', ')}`);

  if (!Array.isArray(v.colors) || v.colors.length === 0) {
    errors.push('colors must be a non-empty array');
  } else if (!v.colors.every(isNonEmptyString)) {
    errors.push('colors must contain only non-empty strings');
  }

  if (!Array.isArray(v.seasons) || v.seasons.length === 0) {
    errors.push('seasons must be a non-empty array');
  } else if (!v.seasons.every(isSeason)) {
    errors.push(`seasons must contain only: ${SEASONS.join(', ')}`);
  } else if (new Set(v.seasons).size !== v.seasons.length) {
    errors.push('seasons must not contain duplicates');
  }

  if (!isIsoDate(v.createdAt)) errors.push('createdAt must be an ISO date string');
  if (!isIsoDate(v.updatedAt)) errors.push('updatedAt must be an ISO date string');

  return errors;
}

export function isValidClothingItem(value: unknown): value is ClothingItem {
  return validateClothingItem(value).length === 0;
}

/**
 * Builds a ClothingItem from user input. Trims id and imageUri, trims and lowercases colors,
 * drops empty and duplicate colors, and sets both timestamps to `now`.
 */
export function createClothingItem(
  input: NewClothingItemInput,
  now: Date = new Date(),
): ValidationResult {
  const timestamp = now.toISOString();
  const colors = Array.isArray(input.colors)
    ? Array.from(
        new Set(
          input.colors
            .filter((c): c is string => typeof c === 'string')
            .map((c) => c.trim().toLowerCase())
            .filter((c) => c.length > 0),
        ),
      )
    : input.colors;

  const candidate = {
    id: typeof input.id === 'string' ? input.id.trim() : input.id,
    imageUri: typeof input.imageUri === 'string' ? input.imageUri.trim() : input.imageUri,
    category: input.category,
    colors,
    seasons: input.seasons,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const errors = validateClothingItem(candidate);
  return errors.length === 0
    ? { ok: true, item: candidate as ClothingItem }
    : { ok: false, errors };
}
