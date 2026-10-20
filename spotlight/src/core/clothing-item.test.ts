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
    imageUri: 'file:///photos/shirt.jpg',
    category: 'top',
    colors: ['Black'],
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
        imageUri: 'file:///photos/shirt.jpg',
        category: 'top',
        colors: ['black'],
        seasons: ['summer'],
        createdAt: '2026-01-15T10:00:00.000Z',
        updatedAt: '2026-01-15T10:00:00.000Z',
      },
    });
  });

  it('normalizes colors: trims, lowercases, drops blanks and duplicates, keeps order', () => {
    const result = createClothingItem(input({ colors: [' Navy ', 'white', 'NAVY', '  '] }), NOW);
    expect(result.ok && result.item.colors).toEqual(['navy', 'white']);
  });

  it('rejects an unknown category', () => {
    const result = createClothingItem(input({ category: 'hat' as never }), NOW);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join()).toMatch(/category/);
  });

  it('rejects when every color is blank', () => {
    const result = createClothingItem(input({ colors: ['', '  '] }), NOW);
    expect(result).toEqual({ ok: false, errors: ['colors must be a non-empty array'] });
  });

  it('rejects empty, unknown, and duplicate seasons', () => {
    expect(createClothingItem(input({ seasons: [] }), NOW).ok).toBe(false);
    expect(createClothingItem(input({ seasons: ['monsoon' as never] }), NOW).ok).toBe(false);
    const dup = createClothingItem(input({ seasons: ['winter', 'winter'] }), NOW);
    expect(!dup.ok && dup.errors).toEqual(['seasons must not contain duplicates']);
  });

  it('trims surrounding whitespace from id and imageUri', () => {
    const result = createClothingItem(
      input({ id: '  item-1 ', imageUri: ' file:///photos/shirt.jpg\n' }),
      NOW,
    );
    expect(result.ok && result.item.id).toBe('item-1');
    expect(result.ok && result.item.imageUri).toBe('file:///photos/shirt.jpg');
  });

  it('produces timestamps that pass the strict ISO check', () => {
    const result = createClothingItem(input(), new Date());
    expect(result.ok).toBe(true);
    expect(result.ok && isValidClothingItem(result.item)).toBe(true);
  });

  it('rejects a blank id and imageUri and reports both', () => {
    const result = createClothingItem(input({ id: '  ', imageUri: '' }), NOW);
    expect(!result.ok && result.errors).toEqual([
      'id must be a non-empty string',
      'imageUri must be a non-empty string',
    ]);
  });
});

describe('validateClothingItem / isValidClothingItem', () => {
  const valid = {
    id: 'a',
    imageUri: 'file:///a.jpg',
    category: 'shoes',
    colors: ['red'],
    seasons: ['spring', 'autumn'],
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

  it('rejects id and imageUri with leading or trailing whitespace', () => {
    expect(validateClothingItem({ ...valid, id: ' a' })).toEqual([
      'id must not have leading or trailing whitespace',
    ]);
    expect(validateClothingItem({ ...valid, imageUri: 'file:///a.jpg ' })).toEqual([
      'imageUri must not have leading or trailing whitespace',
    ]);
  });

  it('rejects non-string colors', () => {
    expect(isValidClothingItem({ ...valid, colors: [42] })).toBe(false);
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
