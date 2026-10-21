import {
  createClothingItem,
  isCategory,
  isSeason,
  isValidClothingItem,
  validateClothingItem,
  type NewClothingItemInput,
} from '@/core';

const NOW = new Date('2026-01-15T10:00:00.000Z');

function input(overrides: Partial<NewClothingItemInput> = {}): NewClothingItemInput {
  return {
    id: 'item-1',
    photos: [{ id: 'photo-1', role: 'front', path: 'file:///photos/shirt.jpg', isPrimary: true }],
    category: 'top',
    // No hex: createClothingItem fills in the palette's reference hex.
    colors: [{ paletteId: 'black', source: 'user' }],
    seasons: ['summer'],
    ...overrides,
  };
}

describe('createClothingItem', () => {
  it('builds a valid item with timestamps from the given clock', () => {
    const result = createClothingItem(input(), NOW);
    expect(result).toEqual({
      ok: true,
      item: {
        id: 'item-1',
        photos: [{ id: 'photo-1', role: 'front', path: 'file:///photos/shirt.jpg', sortOrder: 0, isPrimary: true }],
        category: 'top',
        colors: [{ paletteId: 'black', hex: '#111111', source: 'user' }],
        seasons: ['summer'],
        tags: [],
        createdAt: '2026-01-15T10:00:00.000Z',
        updatedAt: '2026-01-15T10:00:00.000Z',
      },
    });
  });

  it('normalizes colors: uppercases and expands hex, fills a missing hex, drops repeated palette ids keeping the first, keeps order', () => {
    const result = createClothingItem(
      input({
        colors: [
          { paletteId: 'navy', hex: ' #20a ', source: 'auto' },
          { paletteId: 'white', source: 'user' },
          { paletteId: 'navy', hex: '#000080', source: 'user' },
          { paletteId: 'red', hex: '#c8102e', source: 'user' },
        ],
      }),
      NOW,
    );
    expect(result.ok && result.item.colors).toEqual([
      { paletteId: 'navy', hex: '#2200AA', source: 'auto' },
      { paletteId: 'white', hex: '#FFFFFF', source: 'user' },
      { paletteId: 'red', hex: '#C8102E', source: 'user' },
    ]);
  });

  it('rejects more than three colors instead of cutting them, and malformed colors', () => {
    const four = createClothingItem(
      input({ colors: (['navy', 'white', 'red', 'teal'] as const).map((paletteId) => ({ paletteId, source: 'user' as const })) }),
      NOW,
    );
    expect(!four.ok && four.errors).toEqual(['colors must have at most 3 entries']);
    const unknown = createClothingItem(input({ colors: [{ paletteId: 'ultraviolet' as never, source: 'user' }] }), NOW);
    expect(!unknown.ok && unknown.errors).toEqual(['colors[0] paletteId must be a palette color id']);
    const badHex = createClothingItem(input({ colors: [{ paletteId: 'navy', hex: 'navy', source: 'user' }] }), NOW);
    expect(!badHex.ok && badHex.errors).toEqual(['colors[0] hex must be an uppercase #RRGGBB string']);
    const badSource = createClothingItem(input({ colors: [{ paletteId: 'navy', source: 'guess' as never }] }), NOW);
    expect(!badSource.ok && badSource.errors).toEqual(['colors[0] source must be one of: auto, user']);
  });

  it('rejects an unknown category', () => {
    const result = createClothingItem(input({ category: 'hat' as never }), NOW);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join()).toMatch(/category/);
  });

  it('rejects an empty color list', () => {
    const result = createClothingItem(input({ colors: [] }), NOW);
    expect(result).toEqual({ ok: false, errors: ['colors must be a non-empty array'] });
  });

  it('rejects empty, unknown, and duplicate seasons', () => {
    expect(createClothingItem(input({ seasons: [] }), NOW).ok).toBe(false);
    expect(createClothingItem(input({ seasons: ['monsoon' as never] }), NOW).ok).toBe(false);
    const dup = createClothingItem(input({ seasons: ['winter', 'winter'] }), NOW);
    expect(!dup.ok && dup.errors).toEqual(['seasons must not contain duplicates']);
  });

  it('trims surrounding whitespace from id and each photo id and path', () => {
    const result = createClothingItem(
      input({
        id: '  item-1 ',
        photos: [{ id: ' photo-1 ', role: 'front', path: ' file:///photos/shirt.jpg\n', isPrimary: true }],
      }),
      NOW,
    );
    expect(result.ok && result.item.id).toBe('item-1');
    expect(result.ok && result.item.photos[0].path).toBe('file:///photos/shirt.jpg');
    expect(result.ok && result.item.photos[0].id).toBe('photo-1');
  });

  it('numbers photos by position and keeps their order, roles, and primary flag', () => {
    const result = createClothingItem(
      input({
        photos: [
          { id: 'f', role: 'front', path: 'a.jpg', isPrimary: false },
          { id: 'd', role: 'detail', path: 'b.jpg', isPrimary: true },
          { id: 'b', role: 'back', path: 'c.jpg', isPrimary: false },
        ],
      }),
      NOW,
    );
    expect(result.ok && result.item.photos).toEqual([
      { id: 'f', role: 'front', path: 'a.jpg', sortOrder: 0, isPrimary: false },
      { id: 'd', role: 'detail', path: 'b.jpg', sortOrder: 1, isPrimary: true },
      { id: 'b', role: 'back', path: 'c.jpg', sortOrder: 2, isPrimary: false },
    ]);
  });

  it('rejects photo sets that break the rules', () => {
    const front = { id: 'f', role: 'front' as const, path: 'a.jpg', isPrimary: true };
    const extra = (id: string, role: 'front' | 'back' | 'detail', isPrimary = false) => ({ id, role, path: `${id}.jpg`, isPrimary });
    const errorsFor = (photos: NewClothingItemInput['photos']) => {
      const result = createClothingItem(input({ photos }), NOW);
      return result.ok ? [] : result.errors;
    };
    expect(errorsFor([extra('b', 'back', true)])).toEqual(['photos must include exactly one front photo']);
    expect(errorsFor([front, extra('f2', 'front')])).toEqual(['photos must include exactly one front photo']);
    expect(errorsFor([front, extra('b1', 'back'), extra('b2', 'back')])).toEqual([
      'photos must include at most one back photo',
    ]);
    expect(errorsFor([front, extra('d1', 'detail'), extra('d2', 'detail'), extra('d3', 'detail')])).toEqual([
      'photos must include at most 2 detail photos',
    ]);
    expect(errorsFor([{ ...front, isPrimary: false }])).toEqual(['photos must have exactly one primary photo']);
    expect(errorsFor([front, extra('d', 'detail', true)])).toEqual(['photos must have exactly one primary photo']);
    expect(errorsFor([front, extra('f', 'detail')])).toEqual(['photos must not repeat an id']);
    // The fullest valid set: front, back, and two details.
    expect(errorsFor([front, extra('b', 'back'), extra('d1', 'detail'), extra('d2', 'detail')])).toEqual([]);
  });

  it('produces timestamps that pass the strict ISO check', () => {
    const result = createClothingItem(input(), new Date());
    expect(result.ok).toBe(true);
    expect(result.ok && isValidClothingItem(result.item)).toBe(true);
  });

  it('defaults to no tags, and normalizes given tags: trims, collapses, lowercases, dedupes, drops blanks', () => {
    const untagged = createClothingItem(input(), NOW);
    expect(untagged.ok && untagged.item.tags).toEqual([]);
    const result = createClothingItem(input({ tags: [' 90S ', 'Office   Casual', '90s', '  ', 'emo'] }), NOW);
    expect(result.ok && result.item.tags).toEqual(['90s', 'office casual', 'emo']);
  });

  it('rejects too-long tags and too many tags instead of cutting them', () => {
    const long = createClothingItem(input({ tags: ['x'.repeat(31)] }), NOW);
    expect(!long.ok && long.errors.join()).toMatch(/at most 30 characters/);
    const many = createClothingItem(input({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }), NOW);
    expect(!many.ok && many.errors).toEqual(['tags must have at most 10 entries']);
    expect(createClothingItem(input({ tags: Array.from({ length: 10 }, (_, i) => `t${i}`) }), NOW).ok).toBe(true);
  });

  it('rejects a blank id and no photos and reports both', () => {
    const result = createClothingItem(input({ id: '  ', photos: [] }), NOW);
    expect(!result.ok && result.errors).toEqual([
      'id must be a non-empty string',
      'photos must include exactly one front photo',
    ]);
  });

  it('rejects a blank photo path or id', () => {
    const blankPath = createClothingItem(
      input({ photos: [{ id: 'p', role: 'front', path: '  ', isPrimary: true }] }),
      NOW,
    );
    expect(!blankPath.ok && blankPath.errors).toEqual([
      'photos[0] path must be a non-empty string with no surrounding whitespace',
    ]);
    const blankId = createClothingItem(input({ photos: [{ id: '', role: 'front', path: 'a.jpg', isPrimary: true }] }), NOW);
    expect(!blankId.ok && blankId.errors).toEqual([
      'photos[0] id must be a non-empty string with no surrounding whitespace',
    ]);
  });
});

describe('validateClothingItem / isValidClothingItem', () => {
  const photo = { id: 'p', role: 'front', path: 'file:///a.jpg', sortOrder: 0, isPrimary: true };
  const valid = {
    id: 'a',
    photos: [photo],
    category: 'shoes',
    colors: [{ paletteId: 'red', hex: '#C8102E', source: 'user' }],
    seasons: ['spring', 'autumn'],
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  it('accepts a well-formed item', () => {
    expect(validateClothingItem(valid)).toEqual([]);
    expect(isValidClothingItem(valid)).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(isValidClothingItem(null)).toBe(false);
    expect(isValidClothingItem('item')).toBe(false);
    expect(validateClothingItem(undefined)).toEqual(['item must be an object']);
  });

  it('rejects invalid timestamps', () => {
    expect(validateClothingItem({ ...valid, createdAt: 'yesterday' })).toEqual([
      'createdAt must be an ISO date string',
    ]);
    expect(isValidClothingItem({ ...valid, updatedAt: undefined })).toBe(false);
  });

  it('accepts toISOString() output and explicit offsets', () => {
    const iso = new Date('2026-03-04T05:06:07.089Z').toISOString();
    expect(validateClothingItem({ ...valid, createdAt: iso, updatedAt: iso })).toEqual([]);
    expect(isValidClothingItem({ ...valid, createdAt: '2026-01-01T00:00:00Z' })).toBe(true);
    expect(isValidClothingItem({ ...valid, createdAt: '2026-01-01T09:30:00+05:30' })).toBe(true);
    expect(isValidClothingItem({ ...valid, createdAt: '2026-01-01T00:00:00.5-08:00' })).toBe(true);
  });

  it('rejects timestamps that Date.parse accepts but are not strict ISO 8601', () => {
    expect(validateClothingItem({ ...valid, createdAt: 'Jan 1 2026' })).toEqual([
      'createdAt must be an ISO date string',
    ]);
    for (const bad of [
      '2026-01-01',
      '2026-01-01T00:00:00',
      '2026-01-01 00:00:00Z',
      '2026-02-30T00:00:00Z',
      '2026-01-01T24:00:00Z',
      '2026-01-01T00:00:00+25:00',
      ' 2026-01-01T00:00:00Z',
    ]) {
      expect(isValidClothingItem({ ...valid, createdAt: bad })).toBe(false);
    }
  });

  it('rejects id and photo paths with leading or trailing whitespace', () => {
    expect(validateClothingItem({ ...valid, id: ' a' })).toEqual([
      'id must not have leading or trailing whitespace',
    ]);
    expect(validateClothingItem({ ...valid, photos: [{ ...photo, path: 'file:///a.jpg ' }] })).toEqual([
      'photos[0] path must be a non-empty string with no surrounding whitespace',
    ]);
  });

  it('requires photos to be a well-formed array in sort order', () => {
    expect(validateClothingItem({ ...valid, photos: undefined })).toEqual(['photos must be an array']);
    expect(validateClothingItem({ ...valid, photos: [null] })).toEqual(['photos[0] must be an object']);
    expect(validateClothingItem({ ...valid, photos: [{ ...photo, role: 'side' }] })).toEqual([
      'photos[0] role must be one of: front, back, detail',
    ]);
    expect(validateClothingItem({ ...valid, photos: [{ ...photo, sortOrder: 1 }] })).toEqual([
      'photos[0] sortOrder must be 0 (its position in the list)',
    ]);
    expect(validateClothingItem({ ...valid, photos: [{ ...photo, isPrimary: 1 }] })).toEqual([
      'photos[0] isPrimary must be a boolean',
    ]);
    const back = { id: 'q', role: 'back', path: 'b.jpg', sortOrder: 1, isPrimary: false };
    expect(validateClothingItem({ ...valid, photos: [photo, back] })).toEqual([]);
    expect(validateClothingItem({ ...valid, photos: [photo, { ...back, sortOrder: 0 }] })).toEqual([
      'photos[1] sortOrder must be 1 (its position in the list)',
    ]);
  });

  it('requires tags to be a normalized, unique array', () => {
    expect(validateClothingItem({ ...valid, tags: ['90s', 'office casual'] })).toEqual([]);
    expect(validateClothingItem({ ...valid, tags: undefined })).toEqual(['tags must be an array']);
    expect(validateClothingItem({ ...valid, tags: ['90S'] })[0]).toMatch(/^tags must be lowercase/);
    expect(validateClothingItem({ ...valid, tags: [' emo'] })[0]).toMatch(/^tags must be lowercase/);
    expect(validateClothingItem({ ...valid, tags: [''] })[0]).toMatch(/^tags must be lowercase/);
    expect(validateClothingItem({ ...valid, tags: [7] })[0]).toMatch(/^tags must be lowercase/);
    expect(validateClothingItem({ ...valid, tags: ['emo', 'emo'] })).toEqual(['tags must not contain duplicates']);
  });

  it('rejects malformed colors', () => {
    const red = valid.colors[0];
    expect(isValidClothingItem({ ...valid, colors: [42] })).toBe(false);
    expect(validateClothingItem({ ...valid, colors: ['red'] })).toEqual(['colors[0] must be an object']);
    expect(validateClothingItem({ ...valid, colors: undefined })).toEqual(['colors must be a non-empty array']);
    expect(validateClothingItem({ ...valid, colors: [] })).toEqual(['colors must be a non-empty array']);
    expect(validateClothingItem({ ...valid, colors: [{ ...red, paletteId: 'Red' }] })).toEqual([
      'colors[0] paletteId must be a palette color id',
    ]);
    for (const hex of ['#c8102e', '#C81', 'C8102E', '', undefined]) {
      expect(validateClothingItem({ ...valid, colors: [{ ...red, hex }] })).toEqual([
        'colors[0] hex must be an uppercase #RRGGBB string',
      ]);
    }
    expect(validateClothingItem({ ...valid, colors: [red, { ...red, source: 'AI' }] })).toEqual([
      'colors[1] source must be one of: auto, user',
    ]);
    expect(validateClothingItem({ ...valid, colors: [red, { ...red, source: 'auto' }] })).toEqual([
      'colors must not repeat a palette color',
    ]);
    const navy = { paletteId: 'navy', hex: '#202A60', source: 'auto' };
    const white = { paletteId: 'white', hex: '#FFFFFF', source: 'user' };
    expect(validateClothingItem({ ...valid, colors: [red, navy, white] })).toEqual([]);
    expect(validateClothingItem({ ...valid, colors: [red, navy, white, { ...white, paletteId: 'teal' }] })).toEqual([
      'colors must have at most 3 entries',
    ]);
    // A measured hex that is not the palette's reference is fine.
    expect(validateClothingItem({ ...valid, colors: [{ ...red, hex: '#B5122B' }] })).toEqual([]);
  });
});

describe('type guards', () => {
  it('isCategory and isSeason accept only known literals', () => {
    expect(isCategory('dress')).toBe(true);
    expect(isCategory('Dress')).toBe(false);
    expect(isCategory(1)).toBe(false);
    expect(isSeason('winter')).toBe(true);
    expect(isSeason('fall')).toBe(false);
  });
});
