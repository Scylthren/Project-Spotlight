import {
  createClothingItem,
  describeClosetTile,
  describeItemDetail,
  filterCloset,
  hasDetailChanges,
  isValidItemName,
  ITEM_NAME_MAX_LENGTH,
  itemDeleteSubject,
  itemDisplayName,
  itemToFormValues,
  matchesSearch,
  normalizeItemName,
  validateClothingItem,
  type ClothingItem,
  type NewClothingItemInput,
} from '@/core';

const NOW = new Date('2026-05-01T00:00:00.000Z');

const ITEM: ClothingItem = {
  id: 'item-1',
  photos: [{ id: 'f', role: 'front', path: 'closet-images/f.jpg', sortOrder: 0, isPrimary: true }],
  category: 'top',
  colors: [
    { paletteId: 'navy', hex: '#202A60', source: 'user' },
    { paletteId: 'white', hex: '#FFFFFF', source: 'user' },
  ],
  seasons: ['summer'],
  tags: ['90s'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const NAMED: ClothingItem = { ...ITEM, name: 'Black band hoodie' };

function input(overrides: Partial<NewClothingItemInput> = {}): NewClothingItemInput {
  return {
    id: 'new',
    photos: [{ id: 'p', role: 'front', path: 'closet-images/new.jpg', isPrimary: true }],
    category: 'top',
    colors: [{ paletteId: 'black', source: 'user' }],
    seasons: ['winter'],
    ...overrides,
  };
}

describe('item name rules', () => {
  it('a stored name is a trimmed, non-empty string of at most 60 characters', () => {
    expect(ITEM_NAME_MAX_LENGTH).toBe(60);
    expect(isValidItemName('Black band hoodie')).toBe(true);
    expect(isValidItemName('a'.repeat(60))).toBe(true);
    expect(isValidItemName('a'.repeat(61))).toBe(false);
    expect(isValidItemName('')).toBe(false);
    expect(isValidItemName(' hoodie')).toBe(false);
    expect(isValidItemName('hoodie\n')).toBe(false);
    expect(isValidItemName(42)).toBe(false);
    expect(isValidItemName(null)).toBe(false);
  });

  it('counts characters as the user sees them (an emoji is one)', () => {
    expect(isValidItemName('🖤'.repeat(60))).toBe(true);
    expect(isValidItemName('🖤'.repeat(61))).toBe(false);
  });

  it('normalizes typed text: trimmed, blank becomes no name', () => {
    expect(normalizeItemName('  Black band hoodie \n')).toBe('Black band hoodie');
    expect(normalizeItemName('   ')).toBeUndefined();
    expect(normalizeItemName('')).toBeUndefined();
    expect(normalizeItemName(undefined)).toBeUndefined();
    // Not cut: validation rejects it instead.
    expect(normalizeItemName(` ${'a'.repeat(61)} `)).toBe('a'.repeat(61));
  });
});

describe('validateClothingItem: name', () => {
  it('is optional', () => {
    expect(validateClothingItem(ITEM)).toEqual([]);
    expect(validateClothingItem(NAMED)).toEqual([]);
  });

  it('rejects an empty, untrimmed, too long or non-string name', () => {
    for (const name of ['', ' x', 'x ', 'a'.repeat(61), 7, null]) {
      expect([name, validateClothingItem({ ...ITEM, name })]).toEqual([
        name,
        ['name must be a trimmed, non-empty string of at most 60 characters'],
      ]);
    }
  });
});

describe('createClothingItem: name', () => {
  it('trims the name', () => {
    const result = createClothingItem(input({ name: '  Black band hoodie  ' }), NOW);
    expect(result.ok && result.item.name).toBe('Black band hoodie');
  });

  it('leaves out a missing or blank name (no key at all)', () => {
    for (const name of [undefined, '', '   ']) {
      const result = createClothingItem(input({ name }), NOW);
      expect(result.ok).toBe(true);
      expect(result.ok && 'name' in result.item).toBe(false);
    }
  });

  it('accepts 60 characters and rejects 61 (after trimming)', () => {
    expect(createClothingItem(input({ name: ` ${'a'.repeat(60)} ` }), NOW).ok).toBe(true);
    expect(createClothingItem(input({ name: 'a'.repeat(61) }), NOW)).toEqual({
      ok: false,
      errors: ['name must be a trimmed, non-empty string of at most 60 characters'],
    });
  });
});

describe('display name fallback', () => {
  it('shows the name, else the category', () => {
    expect(itemDisplayName(NAMED)).toBe('Black band hoodie');
    expect(itemDisplayName(ITEM)).toBe('Top');
  });

  it('the delete confirmation names the item, else says "this <category>"', () => {
    expect(itemDeleteSubject(NAMED)).toBe('"Black band hoodie"');
    expect(itemDeleteSubject(ITEM)).toBe('this top');
  });

  it('closet tile: a named item shows its name, with the category before the colors', () => {
    expect(describeClosetTile(NAMED)).toEqual({
      name: 'Black band hoodie',
      meta: 'Top · Navy, White',
      accessibilityLabel: 'Black band hoodie, Top, Navy, White',
    });
    expect(describeClosetTile(ITEM)).toEqual({ name: 'Top', meta: 'Navy, White', accessibilityLabel: 'Top, Navy, White' });
  });

  it('item screen: the title is the name with the category under it, else the category alone', () => {
    expect(describeItemDetail(NAMED)).toMatchObject({ title: 'Black band hoodie', subtitle: 'Top' });
    expect(describeItemDetail(ITEM)).toMatchObject({ title: 'Top', subtitle: null });
  });
});

describe('closet search by name', () => {
  it('matches words of the name, case-insensitively, together with other fields', () => {
    expect(matchesSearch(NAMED, 'hoodie')).toBe(true);
    expect(matchesSearch(NAMED, 'BAND')).toBe(true);
    expect(matchesSearch(NAMED, 'band navy')).toBe(true);
    expect(matchesSearch(ITEM, 'hoodie')).toBe(false);
    expect(filterCloset([ITEM, NAMED], { query: 'hoodie', category: 'all' })).toEqual([NAMED]);
    expect(filterCloset([ITEM, NAMED], { query: 'hoodie', category: 'shoes' })).toEqual([]);
  });
});

describe('form values: name', () => {
  it('prefills the name and round-trips it through createClothingItem', () => {
    const values = itemToFormValues(NAMED);
    expect(values.name).toBe('Black band hoodie');
    const rebuilt = createClothingItem(
      {
        ...NAMED,
        name: values.name,
        photos: NAMED.photos.map(({ sortOrder: _, ...p }) => p),
        colors: values.colors,
      },
      new Date(NAMED.createdAt),
    );
    expect(rebuilt).toEqual({ ok: true, item: NAMED });
  });

  it('an unnamed item prefills no name', () => {
    expect('name' in itemToFormValues(ITEM)).toBe(false);
  });

  it('adding, changing or removing the name is a change; the same name is not', () => {
    expect(hasDetailChanges(ITEM, NAMED)).toBe(true);
    expect(hasDetailChanges(NAMED, ITEM)).toBe(true);
    expect(hasDetailChanges(NAMED, { ...NAMED, name: 'Hoodie' })).toBe(true);
    expect(hasDetailChanges(NAMED, { ...NAMED })).toBe(false);
    expect(hasDetailChanges(ITEM, { ...ITEM })).toBe(false);
  });
});
