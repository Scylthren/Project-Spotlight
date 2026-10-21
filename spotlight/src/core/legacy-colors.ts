/**
 * Maps the free-text colors stored before migration 5 ("Navy Blue",
 * "off white", "#1a2b3c") to palette colors. Pure; migration 5 calls
 * `legacyColorsToItemColors` for every item.
 *
 * A name always maps to some palette color (the human's decision: keep every
 * item readable, the user can fix colors afterwards). In order:
 * 1. A CSS hex string (`#RGB` / `#RRGGBB`): the nearest palette color by
 *    CIEDE2000, keeping the original hex (uppercased).
 * 2. Exact palette name or id, ignoring case, spaces, and punctuation
 *    ("Light-Grey" is light grey).
 * 3. The synonym table below ("navy blue" -> navy, "gray" -> grey).
 * 4. Fuzzy, against palette names and synonyms: first a substring match
 *    (the longest name inside the text, e.g. "dark navy blue" -> "navy blue";
 *    else the shortest name containing the text, e.g. "burg" -> burgundy),
 *    then the smallest edit distance. Ties go to the earlier candidate
 *    (palette order, then synonym order), so the result is deterministic.
 *
 * Everything but a hex gets the palette's reference hex. All results are
 * source 'user' (the user typed them).
 *
 * Migration 5 depends on this mapping. Changing it (or the palette) changes
 * how not-yet-upgraded databases migrate, so prefer adding synonyms to
 * changing the rules.
 */
import { nearestPaletteColor } from './color-science';
import { MAX_ITEM_COLORS } from './color-selection';
import { normalizeHex, PALETTE, paletteColor, type PaletteColor, type PaletteId } from './palette';
import type { ItemColor } from './types';

/** Common names that are not palette names, in natural form. Keys must not repeat a palette name. */
export const COLOR_SYNONYMS: Readonly<Record<string, PaletteId>> = Object.freeze({
  // neutrals
  gray: 'grey',
  'mid grey': 'grey',
  'mid gray': 'grey',
  ash: 'grey',
  'heather grey': 'grey',
  'heather gray': 'grey',
  'light gray': 'light-grey',
  'pale grey': 'light-grey',
  'pale gray': 'light-grey',
  silver: 'light-grey',
  'dark grey': 'charcoal',
  'dark gray': 'charcoal',
  slate: 'charcoal',
  graphite: 'charcoal',
  gunmetal: 'charcoal',
  jet: 'black',
  'jet black': 'black',
  ebony: 'black',
  onyx: 'black',
  'off white': 'cream',
  ivory: 'cream',
  ecru: 'cream',
  eggshell: 'cream',
  'bright white': 'white',
  'optic white': 'white',
  snow: 'white',
  sand: 'beige',
  stone: 'beige',
  nude: 'beige',
  oatmeal: 'beige',
  taupe: 'beige',
  khaki: 'tan',
  biscuit: 'tan',
  cognac: 'camel',
  caramel: 'camel',
  chocolate: 'brown',
  coffee: 'brown',
  chestnut: 'brown',
  mocha: 'brown',
  'dark brown': 'brown',
  // blues
  'navy blue': 'navy',
  'dark blue': 'navy',
  midnight: 'navy',
  'midnight blue': 'navy',
  denim: 'denim-blue',
  jeans: 'denim-blue',
  'jean blue': 'denim-blue',
  indigo: 'denim-blue',
  'royal blue': 'blue',
  cobalt: 'blue',
  'cobalt blue': 'blue',
  'light blue': 'sky-blue',
  'baby blue': 'sky-blue',
  'pale blue': 'sky-blue',
  'powder blue': 'sky-blue',
  turquoise: 'teal',
  aqua: 'teal',
  petrol: 'teal',
  // greens
  'kelly green': 'green',
  emerald: 'green',
  'bright green': 'green',
  'dark green': 'forest-green',
  'bottle green': 'forest-green',
  'hunter green': 'forest-green',
  'army green': 'olive',
  'khaki green': 'olive',
  'olive green': 'olive',
  'military green': 'olive',
  mint: 'sage',
  'sage green': 'sage',
  // warm
  lemon: 'yellow',
  'pale yellow': 'yellow',
  gold: 'mustard',
  ochre: 'mustard',
  'mustard yellow': 'mustard',
  rust: 'orange',
  peach: 'orange',
  coral: 'orange',
  apricot: 'orange',
  terracotta: 'orange',
  crimson: 'red',
  scarlet: 'red',
  cherry: 'red',
  'bright red': 'red',
  maroon: 'burgundy',
  wine: 'burgundy',
  oxblood: 'burgundy',
  bordeaux: 'burgundy',
  'dark red': 'burgundy',
  // pinks and purples
  rose: 'pink',
  blush: 'pink',
  'hot pink': 'pink',
  fuchsia: 'pink',
  magenta: 'pink',
  'baby pink': 'pink',
  'light pink': 'pink',
  violet: 'purple',
  plum: 'purple',
  eggplant: 'purple',
  aubergine: 'purple',
  'dark purple': 'purple',
  lilac: 'lavender',
  mauve: 'lavender',
  'light purple': 'lavender',
});

export type LegacyMatchKind = 'hex' | 'exact' | 'synonym' | 'substring' | 'edit-distance';

export interface LegacyColorMatch {
  color: PaletteColor;
  /** The original hex for a hex value, else the palette's reference hex. Uppercase #RRGGBB. */
  hex: string;
  kind: LegacyMatchKind;
}

/** Lowercase letters and digits only: "Off-White " -> "offwhite". */
function compact(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface Candidate {
  key: string;
  color: PaletteColor;
}

const PALETTE_CANDIDATES: readonly Candidate[] = PALETTE.map((color) => ({ key: compact(color.name), color }));
const SYNONYM_CANDIDATES: readonly Candidate[] = Object.entries(COLOR_SYNONYMS).map(([name, id]) => ({
  key: compact(name),
  color: paletteColor(id)!,
}));
const ALL_CANDIDATES: readonly Candidate[] = [...PALETTE_CANDIDATES, ...SYNONYM_CANDIDATES];

/** Levenshtein distance (insert, delete, substitute; each costs 1). */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min(previous[j] + 1, current[j - 1] + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length];
}

/** The first candidate with the best score (lower is better). */
function best(candidates: readonly Candidate[], score: (c: Candidate) => number | null): Candidate | null {
  let winner: Candidate | null = null;
  let winnerScore = Infinity;
  for (const c of candidates) {
    const s = score(c);
    if (s !== null && s < winnerScore) [winner, winnerScore] = [c, s];
  }
  return winner;
}

const CSS_HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The palette color for one legacy value, or null if it is blank (nothing to map). */
export function matchLegacyColor(value: string): LegacyColorMatch | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;

  if (CSS_HEX.test(trimmed)) {
    const hex = normalizeHex(trimmed)!;
    return { color: nearestPaletteColor(hex), hex, kind: 'hex' };
  }
  const key = compact(trimmed);
  const found = (candidate: Candidate | null, kind: LegacyMatchKind): LegacyColorMatch | null =>
    candidate && { color: candidate.color, hex: candidate.color.hex, kind };

  const exact = PALETTE_CANDIDATES.find((c) => c.key === key) ?? null;
  const synonym = SYNONYM_CANDIDATES.find((c) => c.key === key) ?? null;
  const contained = key === '' ? null : best(ALL_CANDIDATES, (c) => (key.includes(c.key) ? -c.key.length : null));
  const containing =
    key.length < 3 ? null : best(ALL_CANDIDATES, (c) => (c.key.includes(key) ? c.key.length : null));
  return (
    found(exact, 'exact') ??
    found(synonym, 'synonym') ??
    found(contained, 'substring') ??
    found(containing, 'substring') ??
    found(best(ALL_CANDIDATES, (c) => editDistance(key, c.key)), 'edit-distance')
  );
}

/**
 * Converts a legacy `colors` value (the parsed JSON array of strings) to item
 * colors: each non-blank string mapped (see `matchLegacyColor`), source
 * 'user', duplicates by palette id dropped keeping the first, at most
 * MAX_ITEM_COLORS. Anything that is not an array, and non-string entries,
 * give nothing.
 */
export function legacyColorsToItemColors(values: unknown): ItemColor[] {
  if (!Array.isArray(values)) return [];
  const colors: ItemColor[] = [];
  for (const value of values) {
    if (colors.length >= MAX_ITEM_COLORS) break;
    if (typeof value !== 'string') continue;
    const match = matchLegacyColor(value);
    if (!match || colors.some((c) => c.paletteId === match.color.id)) continue;
    colors.push({ paletteId: match.color.id, hex: match.hex, source: 'user' });
  }
  return colors;
}
