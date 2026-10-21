import {
  CATEGORIES,
  COLOR_SOURCES,
  PHOTO_ROLES,
  SEASONS,
  type Category,
  type ClothingItem,
  type ColorSource,
  type ItemColor,
  type ItemPhoto,
  type Season,
} from './types';
import { MAX_ITEM_COLORS } from './color-selection';
import { isNormalizedHex, isPaletteId, normalizeHex, paletteColor } from './palette';
import { isPhotoRole, photoSetProblems } from './photo-set';
import { canonicalTagText, isNormalizedTag, MAX_TAGS_PER_ITEM, TAG_MAX_LENGTH } from './tags';

/** A photo for `createClothingItem`. Its `sortOrder` is its position in the input list. */
export type NewItemPhotoInput = Omit<ItemPhoto, 'sortOrder'>;

/** A color for `createClothingItem`. A missing `hex` means the palette's reference hex. */
export type NewItemColorInput = Omit<ItemColor, 'hex'> & { hex?: string };

export interface NewClothingItemInput {
  id: string;
  /** In display order. */
  photos: NewItemPhotoInput[];
  category: Category;
  /** Primary first. */
  colors: NewItemColorInput[];
  seasons: Season[];
  /** Raw tags; normalized by `createClothingItem`. Missing means no tags. */
  tags?: string[];
}

export type ValidationResult =
  | { ok: true; item: ClothingItem }
  | { ok: false; errors: string[] };

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

export function isColorSource(value: unknown): value is ColorSource {
  return typeof value === 'string' && (COLOR_SOURCES as readonly string[]).includes(value);
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
  errors.push(...validatePhotos(v.photos));
  if (!isCategory(v.category)) errors.push(`category must be one of: ${CATEGORIES.join(', ')}`);

  errors.push(...validateColors(v.colors));

  if (!Array.isArray(v.seasons) || v.seasons.length === 0) {
    errors.push('seasons must be a non-empty array');
  } else if (!v.seasons.every(isSeason)) {
    errors.push(`seasons must contain only: ${SEASONS.join(', ')}`);
  } else if (new Set(v.seasons).size !== v.seasons.length) {
    errors.push('seasons must not contain duplicates');
  }

  if (!Array.isArray(v.tags)) {
    errors.push('tags must be an array');
  } else if (!v.tags.every(isNormalizedTag)) {
    errors.push(`tags must be lowercase, trimmed, non-empty, and at most ${TAG_MAX_LENGTH} characters`);
  } else if (new Set(v.tags).size !== v.tags.length) {
    errors.push('tags must not contain duplicates');
  } else if (v.tags.length > MAX_TAGS_PER_ITEM) {
    errors.push(`tags must have at most ${MAX_TAGS_PER_ITEM} entries`);
  }

  if (!isIsoDate(v.createdAt)) errors.push('createdAt must be an ISO date string');
  if (!isIsoDate(v.updatedAt)) errors.push('updatedAt must be an ISO date string');

  return errors;
}

function colorProblem(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return 'must be an object';
  const c = value as Record<string, unknown>;
  if (!isPaletteId(c.paletteId)) return 'paletteId must be a palette color id';
  if (!isNormalizedHex(c.hex)) return 'hex must be an uppercase #RRGGBB string';
  if (!isColorSource(c.source)) return `source must be one of: ${COLOR_SOURCES.join(', ')}`;
  return null;
}

/** Problems with an item's `colors`, each starting with "colors". */
function validateColors(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return ['colors must be a non-empty array'];
  if (value.length > MAX_ITEM_COLORS) return [`colors must have at most ${MAX_ITEM_COLORS} entries`];
  for (const [index, color] of value.entries()) {
    const problem = colorProblem(color);
    if (problem) return [`colors[${index}] ${problem}`];
  }
  const ids = (value as ItemColor[]).map((c) => c.paletteId);
  return new Set(ids).size === ids.length ? [] : ['colors must not repeat a palette color'];
}

function photoProblem(value: unknown, index: number): string | null {
  if (typeof value !== 'object' || value === null) return 'must be an object';
  const p = value as Record<string, unknown>;
  if (!isTrimmedNonEmptyString(p.id)) return 'id must be a non-empty string with no surrounding whitespace';
  if (!isPhotoRole(p.role)) return `role must be one of: ${PHOTO_ROLES.join(', ')}`;
  if (!isTrimmedNonEmptyString(p.path)) return 'path must be a non-empty string with no surrounding whitespace';
  if (p.sortOrder !== index) return `sortOrder must be ${index} (its position in the list)`;
  if (typeof p.isPrimary !== 'boolean') return 'isPrimary must be a boolean';
  return null;
}

/** Problems with an item's `photos`, each starting with "photos". */
function validatePhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return ['photos must be an array'];
  for (const [index, photo] of value.entries()) {
    const problem = photoProblem(photo, index);
    if (problem) return [`photos[${index}] ${problem}`];
  }
  const photos = value as ItemPhoto[];
  if (new Set(photos.map((p) => p.id)).size !== photos.length) return ['photos must not repeat an id'];
  return photoSetProblems(photos);
}

export function isValidClothingItem(value: unknown): value is ClothingItem {
  return validateClothingItem(value).length === 0;
}

/**
 * Builds a ClothingItem from user input. Trims id and each photo's id and path, numbers the
 * photos' `sortOrder` by position, normalizes each color's hex to uppercase #RRGGBB (a
 * missing hex becomes the palette's reference hex), drops a repeated palette color
 * (keeping the first; more than MAX_ITEM_COLORS is rejected, not cut), normalizes tags (see `canonicalTagText`) and drops
 * blank and duplicate ones (too-long tags or too many tags are rejected, not cut), and
 * sets both timestamps to `now`.
 */
export function createClothingItem(
  input: NewClothingItemInput,
  now: Date = new Date(),
): ValidationResult {
  const timestamp = now.toISOString();
  const candidate = {
    id: typeof input.id === 'string' ? input.id.trim() : input.id,
    photos: normalizePhotoInput(input.photos),
    category: input.category,
    colors: normalizeColorInput(input.colors),
    seasons: input.seasons,
    tags: normalizeTagInput(input.tags),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const errors = validateClothingItem(candidate);
  return errors.length === 0
    ? { ok: true, item: candidate as ClothingItem }
    : { ok: false, errors };
}

function trimIfString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizePhotoInput(photos: unknown): unknown {
  if (!Array.isArray(photos)) return photos;
  return photos.map((p: unknown, index) =>
    typeof p === 'object' && p !== null
      ? {
          id: trimIfString((p as NewItemPhotoInput).id),
          role: (p as NewItemPhotoInput).role,
          path: trimIfString((p as NewItemPhotoInput).path),
          sortOrder: index,
          isPrimary: (p as NewItemPhotoInput).isPrimary,
        }
      : p,
  );
}

function normalizeColorInput(colors: unknown): unknown {
  if (!Array.isArray(colors)) return colors;
  const seen = new Set<unknown>();
  const result: unknown[] = [];
  for (const c of colors as unknown[]) {
    if (typeof c !== 'object' || c === null) {
      result.push(c);
      continue;
    }
    const { paletteId, hex, source } = c as Record<string, unknown>;
    if (seen.has(paletteId)) continue;
    seen.add(paletteId);
    const normalizedHex =
      hex === undefined && typeof paletteId === 'string'
        ? paletteColor(paletteId)?.hex
        : typeof hex === 'string'
          ? (normalizeHex(hex) ?? hex)
          : hex;
    result.push({ paletteId, hex: normalizedHex, source });
  }
  return result;
}

function normalizeTagInput(tags: unknown): unknown {
  if (tags === undefined) return [];
  if (!Array.isArray(tags)) return tags;
  return Array.from(
    new Set(
      tags
        .map((t) => (typeof t === 'string' ? canonicalTagText(t) : t))
        .filter((t) => t !== ''),
    ),
  );
}
