/**
 * Saved looks (the Lookbook, Gate 3 slice 4): a look the user kept from
 * Results, with its request, rationale, an optional thumbs up or down (D6:
 * stored only) and an optional occasion the user picked (D11; no AI
 * occasion). Plain data and rules; storage is `OutfitRepository`.
 *
 * Pieces are closet item ids. Deleting a closet item keeps the look (D5):
 * the piece shows as "Removed from closet" (`REMOVED_PIECE_TEXT`), and a look
 * with no piece left in the closet is deleted (`looksWithNoPiecesLeft`).
 * Each piece also keeps the category it had when saved, so a removed piece
 * still sits in the right place in the photo grid.
 */
import { SEASON_LABELS } from './labels';
import type { LookPiece } from './look-display';
import { CATEGORIES, SEASONS, type Category, type ClothingItem, type Season } from './types';

/** Longest request kept, in characters; the outfit request limit (tested against the contract). */
export const SAVED_LOOK_REQUEST_MAX_LENGTH = 200;
/** Longest rationale, in characters; the contract's limit (tested). */
export const SAVED_LOOK_RATIONALE_MAX_LENGTH = 300;
/** Most pieces in one look; the contract's limit (tested). */
export const SAVED_LOOK_MAX_PIECES = 9;
/** Longest piece id; the contract's summary id limit (tested). */
export const SAVED_LOOK_ID_MAX_LENGTH = 64;
/** Longest model name kept. */
export const SAVED_LOOK_MODEL_MAX_LENGTH = 100;

export const LOOK_RATINGS = ['up', 'down'] as const;
export type LookRating = (typeof LOOK_RATINGS)[number];

/** The occasions a user can give a saved look (D11), in chip order. */
export const OCCASIONS = ['everyday', 'work', 'night-out', 'date', 'formal', 'active', 'travel'] as const;
export type Occasion = (typeof OCCASIONS)[number];

export const OCCASION_LABELS: Readonly<Record<Occasion, string>> = Object.freeze({
  everyday: 'Everyday',
  work: 'Work',
  'night-out': 'Night out',
  date: 'Date',
  formal: 'Formal',
  active: 'Active',
  travel: 'Travel',
});

/** One piece of a saved look: the closet item id and its category when the look was saved. */
export interface SavedLookPiece {
  itemId: string;
  category: Category;
}

export interface SavedLook {
  /** Stable unique id. */
  id: string;
  /** The request the look answered, as sent (0 to 200 characters; empty for future random modes). */
  request: string;
  /** "Why it works", 1 to 300 characters. */
  rationale: string;
  /** In look order, 1 to 9, no repeated item id. */
  pieces: SavedLookPiece[];
  rating: LookRating | null;
  occasion: Occasion | null;
  /** ISO 8601 timestamp of the save. */
  createdAt: string;
  /** The model that suggested the look ("claude-haiku-5-5"), "stub" for canned picks, or null when unknown. */
  model: string | null;
}

/** What a save needs; id and createdAt come from the caller's clock and id source. */
export type NewSavedLook = Omit<SavedLook, 'id' | 'createdAt' | 'rating' | 'occasion'> & {
  rating?: LookRating | null;
  occasion?: Occasion | null;
};

export function isLookRating(value: unknown): value is LookRating {
  return typeof value === 'string' && (LOOK_RATINGS as readonly string[]).includes(value);
}

export function isOccasion(value: unknown): value is Occasion {
  return typeof value === 'string' && (OCCASIONS as readonly string[]).includes(value);
}

function codePoints(text: string): number {
  return [...text].length;
}

function isIsoInstant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

/** Problems with a saved look; empty when it is valid. */
export function validateSavedLook(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return ['look must be an object'];
  const look = value as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof look.id !== 'string' || look.id.length === 0) errors.push('id must be a non-empty string');
  if (typeof look.request !== 'string' || codePoints(look.request) > SAVED_LOOK_REQUEST_MAX_LENGTH) {
    errors.push(`request must be text of at most ${SAVED_LOOK_REQUEST_MAX_LENGTH} characters`);
  }
  if (
    typeof look.rationale !== 'string' ||
    look.rationale.trim().length === 0 ||
    codePoints(look.rationale) > SAVED_LOOK_RATIONALE_MAX_LENGTH
  ) {
    errors.push(`rationale must be 1 to ${SAVED_LOOK_RATIONALE_MAX_LENGTH} characters`);
  }
  if (!Array.isArray(look.pieces) || look.pieces.length === 0 || look.pieces.length > SAVED_LOOK_MAX_PIECES) {
    errors.push(`pieces must hold 1 to ${SAVED_LOOK_MAX_PIECES} entries`);
  } else {
    const seen = new Set<string>();
    for (const piece of look.pieces as unknown[]) {
      const p = piece as Partial<SavedLookPiece> | null;
      if (
        typeof p !== 'object' ||
        p === null ||
        typeof p.itemId !== 'string' ||
        p.itemId.length === 0 ||
        p.itemId.length > SAVED_LOOK_ID_MAX_LENGTH
      ) {
        errors.push('every piece needs an item id');
        continue;
      }
      if (!(CATEGORIES as readonly unknown[]).includes(p.category)) errors.push(`piece ${p.itemId} has an unknown category`);
      if (seen.has(p.itemId)) errors.push(`piece ${p.itemId} appears twice`);
      seen.add(p.itemId);
    }
  }
  if (look.rating !== null && !isLookRating(look.rating)) errors.push('rating must be up, down or null');
  if (look.occasion !== null && !isOccasion(look.occasion)) errors.push('occasion must be one of the list or null');
  if (!isIsoInstant(look.createdAt)) errors.push('createdAt must be an ISO timestamp');
  if (
    look.model !== null &&
    (typeof look.model !== 'string' || look.model.length === 0 || look.model.length > SAVED_LOOK_MODEL_MAX_LENGTH)
  ) {
    errors.push('model must be a short text or null');
  }
  return errors;
}

/**
 * Identifies a look by its set of pieces (order and request ignored): saving
 * the same set twice keeps one entry. Same encoding as the contract's
 * `outfitKey` (tested).
 */
export function savedLookKey(itemIds: readonly string[]): string {
  return JSON.stringify([...itemIds].sort());
}

export function cloneSavedLook(look: SavedLook): SavedLook {
  return { ...look, pieces: look.pieces.map((p) => ({ ...p })) };
}

/** Newest first by the instant in createdAt, ties by id ascending (deterministic). */
export function compareSavedLooksNewestFirst(a: SavedLook, b: SavedLook): number {
  const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Thumbs up/down: tapping the current rating clears it, the other one replaces it. */
export function nextRating(current: LookRating | null, tapped: LookRating): LookRating | null {
  return current === tapped ? null : tapped;
}

/** Same for the occasion chips. */
export function nextOccasion(current: Occasion | null, tapped: Occasion): Occasion | null {
  return current === tapped ? null : tapped;
}

/** A saved look's pieces against the closet now; `item` is null for a piece no longer in it. */
export function savedLookPieces(look: SavedLook, closet: ReadonlyMap<string, ClothingItem>): LookPiece[] {
  return look.pieces.map((piece) => {
    const item = closet.get(piece.itemId) ?? null;
    return { id: piece.itemId, category: item?.category ?? piece.category, item };
  });
}

/** The ids of looks with no piece left in the closet (D5: they are deleted). */
export function looksWithNoPiecesLeft(looks: readonly SavedLook[], closetIds: ReadonlySet<string>): string[] {
  return looks.filter((look) => !look.pieces.some((p) => closetIds.has(p.itemId))).map((look) => look.id);
}

/**
 * Seasons a look is in: the ones every piece still in the closet has, in
 * season order. Follows item edits because it reads the items now. Empty
 * when no piece is left.
 */
export function lookSeasons(pieces: readonly LookPiece[]): Season[] {
  const items = pieces.flatMap((p) => (p.item ? [p.item] : []));
  if (items.length === 0) return [];
  return SEASONS.filter((season) => items.every((item) => item.seasons.includes(season)));
}

/** A saved look with its pieces resolved, as the Lookbook shows it. */
export interface LookbookEntry {
  look: SavedLook;
  pieces: LookPiece[];
  seasons: Season[];
}

export function lookbookEntries(looks: readonly SavedLook[], closet: ReadonlyMap<string, ClothingItem>): LookbookEntry[] {
  return looks.map((look) => {
    const pieces = savedLookPieces(look, closet);
    return { look, pieces, seasons: lookSeasons(pieces) };
  });
}

// --- Filters (Lookbook.dc.html chips) ---

export type LookbookFilter =
  | { readonly kind: 'all' }
  | { readonly kind: 'occasion'; readonly occasion: Occasion }
  | { readonly kind: 'season'; readonly season: Season };

export const ALL_LOOKS_FILTER: LookbookFilter = Object.freeze({ kind: 'all' });

export function lookbookFilterKey(filter: LookbookFilter): string {
  return filter.kind === 'all' ? 'all' : filter.kind === 'occasion' ? `occasion:${filter.occasion}` : `season:${filter.season}`;
}

export function lookbookFilterLabel(filter: LookbookFilter): string {
  if (filter.kind === 'all') return 'All';
  return filter.kind === 'occasion' ? OCCASION_LABELS[filter.occasion] : SEASON_LABELS[filter.season];
}

/** The chips: All, then the occasions in use (list order), then the seasons some look is in (season order). */
export function lookbookFilters(entries: readonly LookbookEntry[]): LookbookFilter[] {
  const occasions = OCCASIONS.filter((occasion) => entries.some((e) => e.look.occasion === occasion));
  const seasons = SEASONS.filter((season) => entries.some((e) => e.seasons.includes(season)));
  return [
    ALL_LOOKS_FILTER,
    ...occasions.map((occasion) => ({ kind: 'occasion' as const, occasion })),
    ...seasons.map((season) => ({ kind: 'season' as const, season })),
  ];
}

export function matchesLookbookFilter(entry: LookbookEntry, filter: LookbookFilter): boolean {
  if (filter.kind === 'all') return true;
  if (filter.kind === 'occasion') return entry.look.occasion === filter.occasion;
  return entry.seasons.includes(filter.season);
}

/**
 * The filter to apply: the chosen one while it still has a chip, else All
 * (say its last look was deleted, or a season edit moved every look out).
 */
export function effectiveLookbookFilter(filter: LookbookFilter, available: readonly LookbookFilter[]): LookbookFilter {
  const key = lookbookFilterKey(filter);
  return available.find((f) => lookbookFilterKey(f) === key) ?? ALL_LOOKS_FILTER;
}

// --- Text ---

/** The masthead aside: "4 saved". */
export function savedCountText(count: number): string {
  return `${count} saved`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The save date in local time: "Oct 24", with the year when it is not this year ("Oct 24, 2025"). */
export function savedDateText(createdAt: string, now: Date): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  const day = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day}, ${date.getFullYear()}`;
}

/** How a rating reads in text (rows and screen readers). */
export const RATING_TEXT: Readonly<Record<LookRating, string>> = Object.freeze({
  up: 'Liked',
  down: 'Not for me',
});

/** A row's meta line: "Oct 24 · Night out · Liked" (occasion and rating only when set). */
export function savedLookMetaText(look: SavedLook, now: Date): string {
  return [
    savedDateText(look.createdAt, now),
    look.occasion ? OCCASION_LABELS[look.occasion] : null,
    look.rating ? RATING_TEXT[look.rating] : null,
  ]
    .filter((part): part is string => !!part)
    .join(' · ');
}

/** The request as a title: “Emo vibes”, or "Saved look" when it was empty. */
export function savedLookTitle(look: Pick<SavedLook, 'request'>): string {
  return look.request.trim().length > 0 ? `“${look.request}”` : 'Saved look';
}

