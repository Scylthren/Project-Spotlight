import {
  createClothingItem,
  EMPTY_ATTRIBUTE_FIELDS,
  fieldsToAttributes,
  EMPTY_ITEM_FORM,
  hasDetailChanges,
  itemToFormValues,
  makePrimaryColor,
  toggleColor,
  toggleSeason,
  type ClothingItem,
  type ItemColor,
} from '@/core';

const NAVY: ItemColor = { paletteId: 'navy', hex: '#202A60', source: 'user' };
const WHITE: ItemColor = { paletteId: 'white', hex: '#FFFFFF', source: 'user' };

/** Applies matrix taps in order, as the form does. */
function tap(colors: ItemColor[], ...ids: string[]): ItemColor[] {
  for (const id of ids) {
    const result = toggleColor(colors, id);
    if (!result.ok) throw new Error(result.problem);
    colors = result.colors;
  }
  return colors;
}

describe('colors from the color matrix', () => {
  it('a matrix selection is saved by createClothingItem as is, primary first', () => {
    let colors = tap([], 'navy', 'white', 'red', 'white');
    const promoted = makePrimaryColor(colors, 'red');
    colors = promoted.ok ? promoted.colors : [];
    const result = createClothingItem(
      {
        id: 'x',
        photos: [{ id: 'p', role: 'front', path: 'closet-images/x.jpg', isPrimary: true }],
        category: 'top',
        colors,
        seasons: ['summer'],
      },
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(result.ok && result.item.colors).toEqual([{ paletteId: 'red', hex: '#C8102E', source: 'user' }, NAVY]);
  });

  it('an empty selection (nothing chosen, or everything deselected) is rejected by createClothingItem', () => {
    for (const colors of [[], tap([], 'navy', 'navy')]) {
      const result = createClothingItem(
        {
          id: 'x',
          photos: [{ id: 'p', role: 'front', path: 'a.jpg', isPrimary: true }],
          category: 'top',
          colors,
          seasons: ['summer'],
        },
        new Date(),
      );
      expect(result).toEqual({ ok: false, errors: ['colors must be a non-empty array'] });
    }
  });
});

describe('toggleSeason', () => {
  it('adds a missing season and removes a present one without mutating input', () => {
    const start = ['summer'] as const;
    expect(toggleSeason(start, 'winter')).toEqual(['summer', 'winter']);
    expect(toggleSeason(['summer', 'winter'], 'summer')).toEqual(['winter']);
    expect(start).toEqual(['summer']);
  });
});

describe('itemToFormValues', () => {
  it('prefills from an item with copies of its colors, and round-trips through createClothingItem', () => {
    const item: ClothingItem = {
      id: 'x',
      photos: [{ id: 'p', role: 'front', path: 'closet-images/x.jpg', sortOrder: 0, isPrimary: true }],
      category: 'shoes' as const,
      colors: [NAVY, { paletteId: 'cream', hex: '#F4EEDD', source: 'auto' }],
      seasons: ['spring' as const, 'autumn' as const],
      tags: ['90s', 'work'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const values = itemToFormValues(item);
    expect(values).toEqual({
      category: 'shoes',
      colors: [NAVY, { paletteId: 'cream', hex: '#F4EEDD', source: 'auto' }],
      seasons: ['spring', 'autumn'],
      tags: ['90s', 'work'],
      attributes: EMPTY_ATTRIBUTE_FIELDS,
    });
    values.seasons.push('winter');
    values.tags.push('emo');
    values.colors[0].source = 'auto';
    values.colors.push(WHITE);
    expect(item.seasons).toEqual(['spring', 'autumn']);
    expect(item.tags).toEqual(['90s', 'work']);
    expect(item.colors).toEqual([NAVY, { paletteId: 'cream', hex: '#F4EEDD', source: 'auto' }]);
    const fresh = itemToFormValues(item);
    const rebuilt = createClothingItem(
      { ...item, photos: item.photos.map(({ sortOrder: _, ...p }) => p), colors: fresh.colors },
      new Date(item.createdAt),
    );
    expect(rebuilt).toEqual({ ok: true, item });
  });

  it('EMPTY_ITEM_FORM is blank and frozen', () => {
    expect(EMPTY_ITEM_FORM).toEqual({ category: null, colors: [], seasons: [], tags: [], attributes: EMPTY_ATTRIBUTE_FIELDS });
    expect(Object.isFrozen(EMPTY_ITEM_FORM)).toBe(true);
    expect(Object.isFrozen(EMPTY_ATTRIBUTE_FIELDS)).toBe(true);
    expect(Object.isFrozen(EMPTY_ATTRIBUTE_FIELDS.fit)).toBe(true);
  });

  it('prefills attributes with their sources and round-trips them', () => {
    const item: ClothingItem = {
      id: 'x',
      photos: [{ id: 'p', role: 'front', path: 'closet-images/x.jpg', sortOrder: 0, isPrimary: true }],
      category: 'top',
      colors: [NAVY],
      seasons: ['spring'],
      tags: [],
      attributes: { type: { value: 'Polo', source: 'user' }, formality: { value: 'smart-casual', source: 'auto' } },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const values = itemToFormValues(item);
    expect(values.attributes?.type).toEqual({ value: 'Polo', source: 'user' });
    expect(values.attributes?.formality).toEqual({ value: 'smart-casual', source: 'auto' });
    expect(values.attributes?.fit).toEqual({ value: null, source: 'auto' });
    expect(fieldsToAttributes(values.attributes!)).toEqual(item.attributes);
    values.attributes!.type.value = 'Changed';
    expect(item.attributes?.type?.value).toBe('Polo');
  });
});

describe('hasDetailChanges', () => {
  const base: ClothingItem = {
    id: 'x',
    photos: [{ id: 'p', role: 'front', path: 'closet-images/x.jpg', sortOrder: 0, isPrimary: true }],
    category: 'top',
    colors: [NAVY, WHITE],
    seasons: ['spring', 'summer'],
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('counts an added, removed, changed, or re-sourced attribute as a change', () => {
    const withFit: ClothingItem = { ...base, attributes: { fit: { value: 'slim', source: 'auto' } } };
    expect(hasDetailChanges(base, withFit)).toBe(true);
    expect(hasDetailChanges(withFit, base)).toBe(true);
    expect(hasDetailChanges(withFit, { ...base, attributes: { fit: { value: 'regular', source: 'auto' } } })).toBe(true);
    expect(hasDetailChanges(withFit, { ...base, attributes: { fit: { value: 'slim', source: 'user' } } })).toBe(true);
    expect(hasDetailChanges(withFit, { ...base, attributes: { fit: { value: 'slim', source: 'auto' } } })).toBe(false);
  });

  it('is false when only timestamps or the photos differ', () => {
    expect(hasDetailChanges(base, { ...base })).toBe(false);
    expect(
      hasDetailChanges(base, {
        ...base,
        photos: [
          { id: 'q', role: 'front', path: 'other.jpg', sortOrder: 0, isPrimary: false },
          { id: 'r', role: 'back', path: 'back.jpg', sortOrder: 1, isPrimary: true },
        ],
        updatedAt: '2026-05-01T00:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('treats seasons as a set', () => {
    expect(hasDetailChanges(base, { ...base, seasons: ['summer', 'spring'] })).toBe(false);
    expect(hasDetailChanges(base, { ...base, seasons: ['summer'] })).toBe(true);
    expect(hasDetailChanges(base, { ...base, seasons: ['summer', 'winter'] })).toBe(true);
  });

  it('treats tags as a set', () => {
    const tagged = { ...base, tags: ['90s', 'emo'] };
    expect(hasDetailChanges(tagged, { ...tagged, tags: ['emo', '90s'] })).toBe(false);
    expect(hasDetailChanges(tagged, { ...tagged, tags: ['emo'] })).toBe(true);
    expect(hasDetailChanges(tagged, { ...tagged, tags: ['emo', '90s', 'work'] })).toBe(true);
    expect(hasDetailChanges(tagged, { ...tagged, tags: ['emo', 'work'] })).toBe(true);
    expect(hasDetailChanges(base, { ...base, tags: ['work'] })).toBe(true);
  });

  it('detects category and color changes, including color order (the primary)', () => {
    expect(hasDetailChanges(base, { ...base, category: 'outerwear' })).toBe(true);
    expect(hasDetailChanges(base, { ...base, colors: [WHITE, NAVY] })).toBe(true);
    expect(hasDetailChanges(base, { ...base, colors: [NAVY] })).toBe(true);
    expect(hasDetailChanges(base, { ...base, colors: [NAVY, { paletteId: 'cream', hex: '#F2EAD6', source: 'user' }] })).toBe(true);
    expect(hasDetailChanges(base, { ...base, colors: [NAVY, WHITE, { paletteId: 'red', hex: '#C8102E', source: 'user' }] })).toBe(true);
  });

  it('counts a source or hex change as a change, and equal copies as none', () => {
    expect(hasDetailChanges(base, { ...base, colors: [{ ...NAVY }, { ...WHITE }] })).toBe(false);
    expect(hasDetailChanges(base, { ...base, colors: [{ ...NAVY, source: 'auto' }, WHITE] })).toBe(true);
    expect(hasDetailChanges(base, { ...base, colors: [NAVY, { ...WHITE, hex: '#F4F4F2' }] })).toBe(true);
  });
});
