import {
  applyDetectedColors,
  COLOR_MATRIX_HELP,
  COLOR_NOTICES,
  colorRank,
  describeItemColors,
  describeMatrix,
  describeSwatch,
  makePrimaryColor,
  MAX_ITEM_COLORS,
  prefillDetectedColors,
  removeColor,
  sameColors,
  toggleColor,
  userColor,
} from './color-selection';
import { PALETTE, paletteColor } from './palette';
import type { ItemColor } from './types';

const NAVY: ItemColor = { paletteId: 'navy', hex: '#202A60', source: 'user' };
const WHITE: ItemColor = { paletteId: 'white', hex: '#FFFFFF', source: 'user' };
/** A detected color with a measured hex (not the palette's reference). */
const AUTO_RED: ItemColor = { paletteId: 'red', hex: '#B5122B', source: 'auto' };

function ok(result: ReturnType<typeof toggleColor>): ItemColor[] {
  if (!result.ok) throw new Error(`expected ok, got ${result.problem}`);
  return result.colors;
}

describe('userColor', () => {
  it('uses the palette reference hex and source user', () => {
    expect(userColor('sky-blue')).toEqual({ paletteId: 'sky-blue', hex: '#87CEEB', source: 'user' });
    expect(() => userColor('ultraviolet' as never)).toThrow(/unknown palette color/);
  });
});

describe('toggleColor', () => {
  it('the first color chosen is primary; later ones are appended as secondaries', () => {
    let colors: ItemColor[] = [];
    colors = ok(toggleColor(colors, 'navy'));
    colors = ok(toggleColor(colors, 'white'));
    colors = ok(toggleColor(colors, 'red'));
    expect(colors).toEqual([NAVY, WHITE, userColor('red')]);
    expect(colorRank(colors, 'navy')).toBe(0);
    expect(colorRank(colors, 'red')).toBe(2);
    expect(colorRank(colors, 'teal')).toBe(-1);
  });

  it('refuses a fourth color and leaves the selection unchanged', () => {
    const three = [NAVY, WHITE, AUTO_RED];
    expect(toggleColor(three, 'teal')).toEqual({ ok: false, problem: 'too_many' });
    expect(three).toEqual([NAVY, WHITE, AUTO_RED]);
    expect(MAX_ITEM_COLORS).toBe(3);
  });

  it('deselects a selected color, even when the list is full', () => {
    expect(ok(toggleColor([NAVY, WHITE, AUTO_RED], 'white'))).toEqual([NAVY, AUTO_RED]);
  });

  it('removing the primary promotes the next color, keeping its hex and source', () => {
    expect(ok(toggleColor([NAVY, AUTO_RED, WHITE], 'navy'))).toEqual([AUTO_RED, WHITE]);
  });

  it('re-picking a removed detected color makes it a user color with the reference hex', () => {
    const removed = ok(toggleColor([AUTO_RED], 'red'));
    expect(removed).toEqual([]);
    expect(ok(toggleColor(removed, 'red'))).toEqual([{ paletteId: 'red', hex: '#C8102E', source: 'user' }]);
  });

  it('refuses unknown ids', () => {
    expect(toggleColor([], 'ultraviolet')).toEqual({ ok: false, problem: 'unknown_color' });
    expect(toggleColor([], 'Navy')).toEqual({ ok: false, problem: 'unknown_color' });
  });

  it('does not mutate or share its input', () => {
    const input = [NAVY];
    const output = ok(toggleColor(input, 'white'));
    output[0].hex = '#000000';
    expect(input).toEqual([{ paletteId: 'navy', hex: '#202A60', source: 'user' }]);
  });
});

describe('makePrimaryColor', () => {
  it('moves a secondary to the front, keeps the others in order, and marks it user', () => {
    const result = makePrimaryColor([NAVY, WHITE, AUTO_RED], 'red');
    expect(result).toEqual({ ok: true, colors: [{ ...AUTO_RED, source: 'user' }, NAVY, WHITE] });
  });

  it('on the primary itself it keeps the order and confirms the color as user', () => {
    expect(makePrimaryColor([AUTO_RED, NAVY], 'red')).toEqual({
      ok: true,
      colors: [{ ...AUTO_RED, source: 'user' }, NAVY],
    });
  });

  it('refuses a color that is not selected', () => {
    expect(makePrimaryColor([NAVY], 'white')).toEqual({ ok: false, problem: 'not_selected' });
  });

  it('does not mutate its input', () => {
    const input = [NAVY, AUTO_RED];
    makePrimaryColor(input, 'red');
    expect(input).toEqual([NAVY, AUTO_RED]);
  });
});

describe('removeColor', () => {
  it('removes by id and ignores unknown ids', () => {
    expect(removeColor([NAVY, WHITE], 'navy')).toEqual([WHITE]);
    expect(removeColor([NAVY, WHITE], 'teal')).toEqual([NAVY, WHITE]);
  });
});

describe('sameColors', () => {
  it('compares order, palette id, hex, and source', () => {
    expect(sameColors([NAVY, WHITE], [{ ...NAVY }, { ...WHITE }])).toBe(true);
    expect(sameColors([NAVY, WHITE], [WHITE, NAVY])).toBe(false);
    expect(sameColors([NAVY, WHITE], [NAVY])).toBe(false);
    expect(sameColors([NAVY], [{ ...NAVY, source: 'auto' }])).toBe(false);
    expect(sameColors([NAVY], [{ ...NAVY, hex: '#202A61' }])).toBe(false);
    expect(sameColors([], [])).toBe(true);
  });
});

describe('describing colors (text, never color alone)', () => {
  it('describeItemColors lists display names, primary first', () => {
    expect(describeItemColors([userColor('light-grey'), NAVY])).toBe('Light grey, Navy');
    expect(describeItemColors([])).toBe('');
  });

  it('describeSwatch gives a visible badge and a spoken role', () => {
    const colors = [NAVY, WHITE];
    expect(describeSwatch(paletteColor('navy')!, colors)).toEqual({
      color: paletteColor('navy'),
      selected: true,
      primary: true,
      badge: 'Primary',
      accessibilityLabel: 'Navy, primary color',
    });
    expect(describeSwatch(paletteColor('white')!, colors)).toMatchObject({
      selected: true,
      primary: false,
      badge: 'Secondary',
      accessibilityLabel: 'White, secondary color',
    });
    expect(describeSwatch(paletteColor('sky-blue')!, colors)).toMatchObject({
      selected: false,
      primary: false,
      badge: null,
      accessibilityLabel: 'Sky blue, not selected',
    });
  });

  it('describeMatrix covers the whole palette in order, with exactly the selected ones marked', () => {
    const matrix = describeMatrix([AUTO_RED, NAVY]);
    expect(matrix.map((s) => s.color.id)).toEqual(PALETTE.map((c) => c.id));
    expect(matrix.filter((s) => s.selected).map((s) => [s.color.id, s.badge])).toEqual([
      ['navy', 'Secondary'],
      ['red', 'Primary'],
    ]);
    for (const swatch of matrix) expect(swatch.accessibilityLabel.startsWith(swatch.color.name)).toBe(true);
  });

  it('the help text explains the limit and how the primary is chosen', () => {
    expect(COLOR_MATRIX_HELP).toMatch(/up to 3/);
    expect(COLOR_MATRIX_HELP).toMatch(/primary/);
  });
});

describe('prefillDetectedColors (slice 4 entry point)', () => {
  it('keeps confident detections as auto colors with their measured hex, and no notice', () => {
    expect(
      prefillDetectedColors([
        { paletteId: 'red', hex: '#b5122b', confidence: 0.9 },
        { paletteId: 'white', hex: '#F4F4F2', confidence: 0.7 },
      ]),
    ).toEqual({
      colors: [AUTO_RED, { paletteId: 'white', hex: '#F4F4F2', source: 'auto' }],
      notice: null,
    });
  });

  it('asks for review when any kept color is below the confidence threshold', () => {
    const result = prefillDetectedColors([
      { paletteId: 'red', hex: '#B5122B', confidence: 0.9 },
      { paletteId: 'navy', hex: '#202A60', confidence: 0.4 },
    ]);
    expect(result.colors.map((c) => c.paletteId)).toEqual(['red', 'navy']);
    expect(result.notice).toBe(COLOR_NOTICES.lowConfidence);
    expect(prefillDetectedColors([{ paletteId: 'red', hex: '#B5122B', confidence: NaN }]).notice).toBe(
      COLOR_NOTICES.lowConfidence,
    );
    expect(prefillDetectedColors([{ paletteId: 'red', hex: '#B5122B', confidence: 0.5 }], 0.5).notice).toBeNull();
  });

  it('with nothing usable, returns no colors and the not-detected notice', () => {
    expect(prefillDetectedColors([])).toEqual({ colors: [], notice: COLOR_NOTICES.notDetected });
    expect(
      prefillDetectedColors([
        { paletteId: 'ultraviolet', hex: '#5500FF', confidence: 1 },
        { paletteId: 'red', hex: 'red', confidence: 1 },
      ]),
    ).toEqual({ colors: [], notice: COLOR_NOTICES.notDetected });
  });

  it('drops repeats and caps at three, keeping detection order', () => {
    const result = prefillDetectedColors(
      ['red', 'red', 'navy', 'white', 'teal'].map((paletteId) => ({ paletteId, hex: '#123456', confidence: 1 })),
    );
    expect(result.colors.map((c) => c.paletteId)).toEqual(['red', 'navy', 'white']);
    expect(result.colors.every((c) => c.source === 'auto')).toBe(true);
  });
});

describe('applyDetectedColors', () => {
  const sure = { paletteId: 'navy', hex: '#232c5e', confidence: 0.9 };
  const unsure = { paletteId: 'white', hex: '#F0F0F0', confidence: 0.3 };

  it('fills an empty form with the detected colors as auto, no notice when confident', () => {
    expect(applyDetectedColors([], [sure])).toEqual({
      colors: [{ paletteId: 'navy', hex: '#232C5E', source: 'auto' }],
      notice: null,
    });
  });

  it('preselects unsure guesses as auto and asks for a check', () => {
    expect(applyDetectedColors([], [sure, unsure])).toEqual({
      colors: [
        { paletteId: 'navy', hex: '#232C5E', source: 'auto' },
        { paletteId: 'white', hex: '#F0F0F0', source: 'auto' },
      ],
      notice: COLOR_NOTICES.lowConfidence,
    });
  });

  it('replaces auto colors from an earlier photo', () => {
    expect(applyDetectedColors([AUTO_RED], [sure])?.colors).toEqual([
      { paletteId: 'navy', hex: '#232C5E', source: 'auto' },
    ]);
  });

  it('never touches colors the user chose, even mixed with auto ones', () => {
    expect(applyDetectedColors([NAVY], [unsure])).toBeNull();
    expect(applyDetectedColors([AUTO_RED, WHITE], [sure])).toBeNull();
    expect(applyDetectedColors([WHITE], [])).toBeNull();
  });

  it('on failure clears auto colors from an earlier photo and asks the user to choose', () => {
    // Slice 5 review fix: stale auto colors must not stay labeled "Detected from the photo".
    expect(applyDetectedColors([], [])).toEqual({ colors: [], notice: COLOR_NOTICES.notDetected });
    expect(applyDetectedColors([AUTO_RED], [])).toEqual({ colors: [], notice: COLOR_NOTICES.notDetected });
  });

  it('never acts after the user touched the colors, even if only auto ones remain', () => {
    expect(applyDetectedColors([AUTO_RED], [sure], { userTouched: true })).toBeNull();
    expect(applyDetectedColors([], [sure], { userTouched: true })).toBeNull();
    expect(applyDetectedColors([], [], { userTouched: true })).toBeNull();
  });

  it('honors a custom confidence threshold', () => {
    expect(applyDetectedColors([], [sure], { minConfidence: 0.95 })?.notice).toBe(COLOR_NOTICES.lowConfidence);
  });
});
