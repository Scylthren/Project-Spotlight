import { hexDeltaE } from './color-science';
import {
  isNormalizedHex,
  isPaletteId,
  normalizeHex,
  PALETTE,
  PALETTE_IDS,
  paletteColor,
  paletteName,
} from './palette';

describe('PALETTE', () => {
  it('keeps the shipped ids, in display order (ids are stored and must never change)', () => {
    // Adding a color appends to this list. Renaming or removing an id breaks stored items.
    expect(PALETTE.map((c) => c.id)).toEqual([
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
    ]);
    expect(PALETTE_IDS).toEqual(PALETTE.map((c) => c.id));
  });

  it('has unique, lowercase kebab-case ids, unique names, and normalized hexes', () => {
    expect(new Set(PALETTE.map((c) => c.id)).size).toBe(PALETTE.length);
    expect(new Set(PALETTE.map((c) => c.name.toLowerCase())).size).toBe(PALETTE.length);
    expect(new Set(PALETTE.map((c) => c.hex)).size).toBe(PALETTE.length);
    for (const c of PALETTE) {
      expect(c.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(c.name).toMatch(/^[A-Z][a-z]*( [a-z]+)*$/);
      expect(c.name.toLowerCase().replace(/ /g, '-')).toBe(c.id);
      expect(isNormalizedHex(c.hex)).toBe(true);
    }
  });

  it('has swatches far enough apart to tell apart (CIEDE2000 > 5 for every pair)', () => {
    for (const [i, x] of PALETTE.entries()) {
      for (const y of PALETTE.slice(i + 1)) expect([x.id, y.id, hexDeltaE(x.hex, y.hex) > 5]).toEqual([x.id, y.id, true]);
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(PALETTE)).toBe(true);
    expect(Object.isFrozen(PALETTE[0])).toBe(true);
  });
});

describe('lookups', () => {
  it('finds colors by exact id only', () => {
    expect(paletteColor('sky-blue')).toEqual({ id: 'sky-blue', name: 'Sky blue', hex: '#87CEEB' });
    expect(paletteColor('Sky-Blue')).toBeUndefined();
    expect(paletteColor('sky blue')).toBeUndefined();
    expect(isPaletteId('navy')).toBe(true);
    expect(isPaletteId('Navy')).toBe(false);
    expect(isPaletteId(3)).toBe(false);
    expect(isPaletteId('toString')).toBe(false);
  });

  it('paletteName gives the display name, or the id itself if unknown', () => {
    expect(paletteName('light-grey')).toBe('Light grey');
    expect(paletteName('ultraviolet')).toBe('ultraviolet');
  });
});

describe('normalizeHex', () => {
  it('uppercases, expands #RGB, adds the #, and trims', () => {
    expect(normalizeHex('#c8102e')).toBe('#C8102E');
    expect(normalizeHex(' #abc ')).toBe('#AABBCC');
    expect(normalizeHex('fff')).toBe('#FFFFFF');
    expect(normalizeHex('#C8102E')).toBe('#C8102E');
  });

  it('rejects anything else', () => {
    for (const bad of ['', '#', '#12', '#1234', '#12345', '#1234567', '#GGGGGG', 'navy', '# abc']) {
      expect(normalizeHex(bad)).toBeNull();
    }
  });

  it('isNormalizedHex accepts only #RRGGBB in uppercase', () => {
    expect(isNormalizedHex('#C8102E')).toBe(true);
    expect(isNormalizedHex('#c8102e')).toBe(false);
    expect(isNormalizedHex('#FFF')).toBe(false);
    expect(isNormalizedHex('C8102E')).toBe(false);
    expect(isNormalizedHex(null)).toBe(false);
  });
});
