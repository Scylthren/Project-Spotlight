import { COLOR_SYNONYMS, editDistance, legacyColorsToItemColors, matchLegacyColor } from './legacy-colors';
import { isPaletteId, PALETTE, paletteColor } from './palette';

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function mapped(value: string): [string, string, string] | null {
  const m = matchLegacyColor(value);
  return m && [m.color.id, m.hex, m.kind];
}

describe('COLOR_SYNONYMS', () => {
  it('points at real palette colors and never shadows a palette name or repeats a key', () => {
    const paletteKeys = new Set(PALETTE.map((c) => compact(c.name)));
    const keys = Object.keys(COLOR_SYNONYMS).map(compact);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(paletteKeys.has(key)).toBe(false);
    for (const id of Object.values(COLOR_SYNONYMS)) expect(isPaletteId(id)).toBe(true);
  });

  it('includes the synonyms the human listed', () => {
    expect(COLOR_SYNONYMS).toMatchObject({
      'navy blue': 'navy',
      'light blue': 'sky-blue',
      gray: 'grey',
      'off white': 'cream',
      khaki: 'tan',
      maroon: 'burgundy',
    });
  });
});

describe('matchLegacyColor', () => {
  it('1. maps CSS hex values by CIEDE2000 and keeps their (uppercased) hex', () => {
    expect(mapped('#000080')).toEqual(['navy', '#000080', 'hex']);
    expect(mapped(' #c8102e ')).toEqual(['red', '#C8102E', 'hex']);
    expect(mapped('#fff')).toEqual(['white', '#FFFFFF', 'hex']);
    expect(mapped('#003300')).toEqual(['forest-green', '#003300', 'hex']);
  });

  it('2. matches palette names and ids exactly, ignoring case, spaces, and punctuation', () => {
    expect(mapped('navy')).toEqual(['navy', '#202A60', 'exact']);
    expect(mapped('  MUSTARD ')).toEqual(['mustard', '#CDA434', 'exact']);
    expect(mapped('Forest Green')).toEqual(['forest-green', '#2C5234', 'exact']);
    expect(mapped('light-grey')).toEqual(['light-grey', '#C8C8C8', 'exact']);
    expect(mapped('light_grey')).toEqual(['light-grey', '#C8C8C8', 'exact']);
    expect(mapped('skyblue')).toEqual(['sky-blue', '#87CEEB', 'exact']);
    // Every palette color maps to itself by name and by id.
    for (const c of PALETTE) {
      expect(matchLegacyColor(c.name)?.color.id).toBe(c.id);
      expect(matchLegacyColor(c.id)?.color.id).toBe(c.id);
    }
  });

  it('3. uses the synonym table, with the same insensitivity', () => {
    expect(mapped('Navy Blue')).toEqual(['navy', '#202A60', 'synonym']);
    expect(mapped('Light Blue')).toEqual(['sky-blue', '#87CEEB', 'synonym']);
    expect(mapped('Gray')).toEqual(['grey', '#808080', 'synonym']);
    expect(mapped('off white')).toEqual(['cream', '#F2EAD6', 'synonym']);
    expect(mapped('off-white')).toEqual(['cream', '#F2EAD6', 'synonym']);
    expect(mapped('Offwhite')).toEqual(['cream', '#F2EAD6', 'synonym']);
    expect(mapped('KHAKI')).toEqual(['tan', '#D2B48C', 'synonym']);
    expect(mapped('maroon')).toEqual(['burgundy', '#800020', 'synonym']);
    expect(mapped('olive-green')).toEqual(['olive', '#6B6B35', 'synonym']);
  });

  it('4a. fuzzy: the longest known name inside the text wins', () => {
    expect(mapped('dark navy blue')).toEqual(['navy', '#202A60', 'substring']);
    expect(mapped('light blue jeans')).toEqual(['sky-blue', '#87CEEB', 'substring']);
    expect(mapped('reddish brown')).toEqual(['brown', '#6B4423', 'substring']);
    expect(mapped('washed black')).toEqual(['black', '#111111', 'substring']);
  });

  it('4b. fuzzy: else the shortest known name containing the text (3+ letters)', () => {
    expect(mapped('nav')).toEqual(['navy', '#202A60', 'substring']);
    expect(mapped('burg')).toEqual(['burgundy', '#800020', 'substring']);
    expect(mapped('whit')).toEqual(['white', '#FFFFFF', 'substring']);
  });

  it('4c. fuzzy: else the smallest edit distance, earliest candidate on ties', () => {
    expect(mapped('purpel')).toEqual(['purple', '#6A3D9A', 'edit-distance']);
    expect(mapped('teel')).toEqual(['teal', '#008080', 'edit-distance']);
    expect(mapped('charcol')).toEqual(['charcoal', '#36454F', 'edit-distance']);
    expect(mapped('blk')).toEqual(['black', '#111111', 'edit-distance']);
  });

  it('always produces a palette color for any non-blank text, deterministically', () => {
    expect(mapped('something weird')).toEqual(['white', '#FFFFFF', 'edit-distance']);
    expect(mapped('???')).toEqual(['tan', '#D2B48C', 'edit-distance']);
    expect(mapped('zzz')).toEqual(['tan', '#D2B48C', 'edit-distance']);
    for (const text of ['x', 'ab', 'multicolour', 'tie-dye', '123', 'ÄÖÜ', '#12345', '#GGG']) {
      const m = matchLegacyColor(text);
      expect(m && isPaletteId(m.color.id)).toBe(true);
      expect(m?.hex).toBe(paletteColor(m!.color.id)!.hex);
      expect(matchLegacyColor(text)).toEqual(m);
    }
  });

  it('gives nothing for blank text', () => {
    expect(matchLegacyColor('')).toBeNull();
    expect(matchLegacyColor('   ')).toBeNull();
  });
});

describe('editDistance', () => {
  it('counts insertions, deletions, and substitutions', () => {
    expect(editDistance('', '')).toBe(0);
    expect(editDistance('', 'tan')).toBe(3);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('teel', 'teal')).toBe(1);
    expect(editDistance('flaw', 'lawn')).toBe(2);
  });
});

describe('legacyColorsToItemColors', () => {
  it('maps, dedupes by palette id keeping first-seen order, and caps at three', () => {
    expect(legacyColorsToItemColors(['navy', 'Light Blue', 'mustard', 'off white', 'Navy Blue', 'something weird'])).toEqual([
      { paletteId: 'navy', hex: '#202A60', source: 'user' },
      { paletteId: 'sky-blue', hex: '#87CEEB', source: 'user' },
      { paletteId: 'mustard', hex: '#CDA434', source: 'user' },
    ]);
    expect(legacyColorsToItemColors(['off white', 'Navy Blue', 'navy', 'something weird'])).toEqual([
      { paletteId: 'cream', hex: '#F2EAD6', source: 'user' },
      { paletteId: 'navy', hex: '#202A60', source: 'user' },
      { paletteId: 'white', hex: '#FFFFFF', source: 'user' },
    ]);
  });

  it('keeps a hex value\'s own hex, and the first entry wins over a later one for the same color', () => {
    expect(legacyColorsToItemColors(['#000080', 'navy', 'gray'])).toEqual([
      { paletteId: 'navy', hex: '#000080', source: 'user' },
      { paletteId: 'grey', hex: '#808080', source: 'user' },
    ]);
  });

  it('skips blanks and non-strings, and gives nothing for a non-array', () => {
    expect(legacyColorsToItemColors(['  ', 7, null, 'red'])).toEqual([{ paletteId: 'red', hex: '#C8102E', source: 'user' }]);
    expect(legacyColorsToItemColors([])).toEqual([]);
    expect(legacyColorsToItemColors('navy')).toEqual([]);
    expect(legacyColorsToItemColors(undefined)).toEqual([]);
  });
});
