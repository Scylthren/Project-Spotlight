/**
 * The fixed, named color palette every item color is chosen from. Plain data,
 * no logic beyond lookups (distances live in color-science.ts).
 *
 * Rules:
 * - `id` is stored in the database (`item_colors.palette_id`) and, later,
 *   sent to the backend. It NEVER changes once shipped. A color can be
 *   renamed (`name`) or its reference swatch tuned (`hex`), but not re-keyed.
 *   Removing an entry would make stored items unreadable, so don't.
 * - `hex` is the reference swatch: shown in the UI and used when the user picks
 *   the color by hand. Detected colors (slice 4) keep their measured hex.
 * - Hex values are uppercase `#RRGGBB` (see `normalizeHex`).
 * - Order is the display order of the color matrix: neutrals, browns, blues,
 *   greens, warm colors, then pinks and purples.
 */
export const PALETTE_IDS = [
  'black',
  'charcoal',
  'grey',
  'light-grey',
  'white',
  'cream',
  'beige',
  'tan',
  'camel',
  'brown',
  'navy',
  'denim-blue',
  'blue',
  'sky-blue',
  'teal',
  'green',
  'forest-green',
  'olive',
  'sage',
  'yellow',
  'mustard',
  'orange',
  'red',
  'burgundy',
  'pink',
  'purple',
  'lavender',
] as const;

export type PaletteId = (typeof PALETTE_IDS)[number];

export interface PaletteColor {
  id: PaletteId;
  /** Display name, sentence case ("Light grey"). */
  name: string;
  /** Reference swatch, uppercase #RRGGBB. */
  hex: string;
}

const NAMES_AND_HEXES: Readonly<Record<PaletteId, readonly [name: string, hex: string]>> = {
  black: ['Black', '#111111'],
  charcoal: ['Charcoal', '#36454F'],
  grey: ['Grey', '#808080'],
  'light-grey': ['Light grey', '#C8C8C8'],
  white: ['White', '#FFFFFF'],
  cream: ['Cream', '#F2EAD6'],
  beige: ['Beige', '#DCCBA8'],
  tan: ['Tan', '#D2B48C'],
  camel: ['Camel', '#C19A6B'],
  brown: ['Brown', '#6B4423'],
  navy: ['Navy', '#202A60'],
  'denim-blue': ['Denim blue', '#4F6D8F'],
  blue: ['Blue', '#2D5DA8'],
  'sky-blue': ['Sky blue', '#87CEEB'],
  teal: ['Teal', '#008080'],
  green: ['Green', '#3A9A48'],
  'forest-green': ['Forest green', '#2C5234'],
  olive: ['Olive', '#6B6B35'],
  sage: ['Sage', '#9CAF88'],
  yellow: ['Yellow', '#F4D03F'],
  mustard: ['Mustard', '#CDA434'],
  orange: ['Orange', '#F28C28'],
  red: ['Red', '#C8102E'],
  burgundy: ['Burgundy', '#800020'],
  pink: ['Pink', '#F4A7B9'],
  purple: ['Purple', '#6A3D9A'],
  lavender: ['Lavender', '#B8A6D9'],
};

/** Every palette color, in display order. Frozen. */
export const PALETTE: readonly PaletteColor[] = Object.freeze(
  PALETTE_IDS.map((id) => Object.freeze({ id, name: NAMES_AND_HEXES[id][0], hex: NAMES_AND_HEXES[id][1] })),
);

const BY_ID: ReadonlyMap<string, PaletteColor> = new Map(PALETTE.map((c) => [c.id, c]));

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && BY_ID.has(value);
}

/** The palette color with `id`, or undefined for an unknown id. */
export function paletteColor(id: string): PaletteColor | undefined {
  return BY_ID.get(id);
}

/** Display name for `id`; an unknown id is returned as is. */
export function paletteName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

const HEX6 = /^#[0-9A-F]{6}$/;
const LOOSE_HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** True for a normalized hex: `#` plus six uppercase hex digits. */
export function isNormalizedHex(value: unknown): value is string {
  return typeof value === 'string' && HEX6.test(value);
}

/**
 * Normalizes a CSS-style hex color (`#abc`, `abc`, `#aabbcc`, any case,
 * surrounding whitespace) to uppercase `#RRGGBB`. Returns null for anything else.
 */
export function normalizeHex(value: string): string | null {
  const m = LOOSE_HEX.exec(value.trim());
  if (!m) return null;
  const digits = m[1].length === 3 ? [...m[1]].map((d) => d + d).join('') : m[1];
  return `#${digits.toUpperCase()}`;
}
