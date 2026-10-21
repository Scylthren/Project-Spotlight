/**
 * Rules for an item's colors and the color matrix. Pure functions, shared by
 * the validator and the add/edit forms. They never mutate their input.
 *
 * - An item has 1 to MAX_ITEM_COLORS palette colors, unique by palette id.
 *   The first is the primary color; the rest are secondaries, in order.
 * - In the matrix, tapping a swatch toggles it. The first color chosen is the
 *   primary; later ones are secondaries. Removing the primary promotes the
 *   next one. "Make primary" moves a selected secondary to the front.
 * - Every color the user picks or changes gets source 'user'. A newly picked
 *   color uses the palette's reference hex; "Make primary" keeps the color's
 *   hex (it may be a measured one) and marks it 'user', since the user has
 *   now confirmed it. Colors the user did not touch keep their source.
 * - Detected colors (slice 4) enter through `applyDetectedColors` (which uses
 *   `prefillDetectedColors`) as source 'auto', with a notice when the matrix
 *   should open for review. They never replace a 'user' color.
 */
import { isPaletteId, PALETTE, paletteColor, paletteName, type PaletteColor, type PaletteId } from './palette';
import type { ItemColor } from './types';

export const MAX_ITEM_COLORS = 3;

export type ColorSelectionProblem = 'too_many' | 'unknown_color' | 'not_selected';

export const COLOR_MESSAGES: Readonly<Record<ColorSelectionProblem, string>> = Object.freeze({
  too_many: `An item can have at most ${MAX_ITEM_COLORS} colors. Remove one first.`,
  unknown_color: 'That color is not in the palette.',
  not_selected: 'Choose that color first.',
});

export type ColorSelectionResult = { ok: true; colors: ItemColor[] } | { ok: false; problem: ColorSelectionProblem };

/** A color the user picked: the palette's reference hex, source 'user'. */
export function userColor(id: PaletteId): ItemColor {
  const color = paletteColor(id);
  if (!color) throw new Error(`unknown palette color: ${id}`);
  return { paletteId: color.id, hex: color.hex, source: 'user' };
}

/** Position of `id` in `colors` (0 is primary), or -1 if not selected. */
export function colorRank(colors: readonly ItemColor[], id: string): number {
  return colors.findIndex((c) => c.paletteId === id);
}

/** Removes `id` if present; the next color becomes primary if it was the primary. */
export function removeColor(colors: readonly ItemColor[], id: string): ItemColor[] {
  return colors.filter((c) => c.paletteId !== id).map((c) => ({ ...c }));
}

/**
 * Selects `id` (appended: primary if it is the first) or deselects it.
 * Refuses a fourth color and unknown ids.
 */
export function toggleColor(colors: readonly ItemColor[], id: string): ColorSelectionResult {
  if (!isPaletteId(id)) return { ok: false, problem: 'unknown_color' };
  if (colorRank(colors, id) >= 0) return { ok: true, colors: removeColor(colors, id) };
  if (colors.length >= MAX_ITEM_COLORS) return { ok: false, problem: 'too_many' };
  return { ok: true, colors: [...colors.map((c) => ({ ...c })), userColor(id)] };
}

/** Moves a selected color to the front and marks it 'user'. The others keep their order. */
export function makePrimaryColor(colors: readonly ItemColor[], id: string): ColorSelectionResult {
  const rank = colorRank(colors, id);
  if (rank < 0) return { ok: false, problem: 'not_selected' };
  const chosen: ItemColor = { ...colors[rank], source: 'user' };
  return { ok: true, colors: [chosen, ...removeColor(colors, id)] };
}

/** True if both lists have the same colors in the same order, with the same hex and source. */
export function sameColors(a: readonly ItemColor[], b: readonly ItemColor[]): boolean {
  return (
    a.length === b.length &&
    a.every((c, i) => c.paletteId === b[i].paletteId && c.hex === b[i].hex && c.source === b[i].source)
  );
}

/** "Navy, white, red": display names, primary first. */
export function describeItemColors(colors: readonly ItemColor[]): string {
  return colors.map((c) => paletteName(c.paletteId)).join(', ');
}

/** What a swatch in the matrix shows and announces. Never color alone: the name is always in the text. */
export interface SwatchDescription {
  color: PaletteColor;
  selected: boolean;
  primary: boolean;
  /** Visible marker under the name: "Primary", "Secondary", or null when not selected. */
  badge: string | null;
  /** Screen reader text, e.g. "Navy, primary color". */
  accessibilityLabel: string;
}

export function describeSwatch(color: PaletteColor, colors: readonly ItemColor[]): SwatchDescription {
  const rank = colorRank(colors, color.id);
  const selected = rank >= 0;
  const primary = rank === 0;
  const badge = primary ? 'Primary' : selected ? 'Secondary' : null;
  const role = primary ? 'primary color' : selected ? 'secondary color' : 'not selected';
  return { color, selected, primary, badge, accessibilityLabel: `${color.name}, ${role}` };
}

/** Every palette swatch, in palette order, described for `colors`. */
export function describeMatrix(colors: readonly ItemColor[]): SwatchDescription[] {
  return PALETTE.map((color) => describeSwatch(color, colors));
}

/** Instructions shown at the top of the matrix. */
export const COLOR_MATRIX_HELP = `Tap up to ${MAX_ITEM_COLORS} colors. The first one you choose is the primary color; use "Make primary" to change it.`;

/**
 * A color detected from a photo (slice 4). `confidence` is 0..1. Not stored:
 * only the resulting `ItemColor`s are saved.
 */
export interface DetectedColor {
  paletteId: string;
  hex: string;
  confidence: number;
}

/** Below this, a detected color is shown for review instead of trusted. */
export const MIN_DETECTION_CONFIDENCE = 0.6;

export const COLOR_NOTICES = Object.freeze({
  notDetected: "We couldn't detect this item's colors. Choose them below.",
  lowConfidence: "We're not sure about these colors. Check them and fix any that are wrong.",
});

/**
 * Turns detected colors (most prominent first) into the form's starting
 * colors, as source 'auto' with their measured hex. Drops unknown palette ids
 * and malformed hexes, keeps the first of any repeated id, and keeps at most
 * MAX_ITEM_COLORS. `notice` is null when every kept color is confident;
 * otherwise it says why the color matrix should open for review.
 */
export function prefillDetectedColors(
  detected: readonly DetectedColor[],
  minConfidence: number = MIN_DETECTION_CONFIDENCE,
): { colors: ItemColor[]; notice: string | null } {
  const kept: DetectedColor[] = [];
  for (const d of detected) {
    if (kept.length >= MAX_ITEM_COLORS) break;
    if (!isPaletteId(d.paletteId) || !/^#[0-9A-Fa-f]{6}$/.test(d.hex)) continue;
    if (kept.some((k) => k.paletteId === d.paletteId)) continue;
    kept.push(d);
  }
  if (kept.length === 0) return { colors: [], notice: COLOR_NOTICES.notDetected };
  const colors = kept.map((d) => ({ paletteId: d.paletteId as PaletteId, hex: d.hex.toUpperCase(), source: 'auto' as const }));
  const unsure = kept.some((d) => !(d.confidence >= minConfidence));
  return { colors, notice: unsure ? COLOR_NOTICES.lowConfidence : null };
}

/**
 * What a finished detection does to the form's colors (slice 4). Returns
 * null to leave the form alone, else the colors to show and the notice to
 * open the matrix with (null: do not open it).
 *
 * - Any color the user picked or confirmed (source 'user') wins: detection
 *   never replaces it, so the form is left alone. That covers colors chosen
 *   before detection finished and saved colors on an edited item.
 * - `userTouched`: the user changed the colors since this detection started
 *   (even only by deselecting auto colors). Their change wins too.
 * - Otherwise (no colors, or only 'auto' ones from an earlier photo) the
 *   detected colors replace them, through `prefillDetectedColors`.
 * - If nothing usable was detected, auto colors from an earlier photo are
 *   cleared (they describe a photo that is no longer the front, so keeping
 *   them under "Detected from the photo" would be wrong), and the matrix
 *   opens with the "couldn't detect" notice so the user chooses.
 */
export function applyDetectedColors(
  current: readonly ItemColor[],
  detected: readonly DetectedColor[],
  { userTouched = false, minConfidence = MIN_DETECTION_CONFIDENCE }: { userTouched?: boolean; minConfidence?: number } = {},
): { colors: ItemColor[]; notice: string | null } | null {
  if (userTouched || current.some((c) => c.source === 'user')) return null;
  return prefillDetectedColors(detected, minConfidence);
}
