import {
  createClothingItem,
  EMPTY_ITEM_FORM,
  hasDetailChanges,
  itemToFormValues,
  parseColors,
  toggleSeason,
  type ClothingItem,
} from '@/core';

describe('parseColors', () => {
  it('splits on commas and leaves normalization to createClothingItem', () => {
    expect(parseColors('Navy, white')).toEqual(['Navy', ' white']);
    const result = createClothingItem(
      {
        id: 'x',
        imageUri: 'closet-images/x.jpg',
        category: 'top',
        colors: parseColors(' Navy ,white,, NAVY '),
        seasons: ['summer'],
      },
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(result.ok && result.item.colors).toEqual(['navy', 'white']);
  });

  it('yields no usable colors for blank input, which createClothingItem rejects', () => {
    const result = createClothingItem(
      { id: 'x', imageUri: 'a.jpg', category: 'top', colors: parseColors(' , '), seasons: ['summer'] },
      new Date(),
    );
    expect(result.ok).toBe(false);
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
  it('prefills from an item and round-trips colors through parseColors', () => {
    const item = {
      id: 'x',
      imageUri: 'closet-images/x.jpg',
      category: 'shoes' as const,
      colors: ['navy', 'off-white'],
      seasons: ['spring' as const, 'autumn' as const],
      tags: ['90s', 'work'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const values = itemToFormValues(item);
    expect(values).toEqual({
      category: 'shoes',
      colorsText: 'navy, off-white',
      seasons: ['spring', 'autumn'],
      tags: ['90s', 'work'],
    });
    values.seasons.push('winter');
    values.tags.push('emo');
    expect(item.seasons).toEqual(['spring', 'autumn']);
    expect(item.tags).toEqual(['90s', 'work']);
    const rebuilt = createClothingItem(
      { ...item, colors: parseColors(values.colorsText), seasons: item.seasons },
      new Date(item.createdAt),
    );
    expect(rebuilt).toEqual({ ok: true, item });
  });

  it('EMPTY_ITEM_FORM is blank and frozen', () => {
    expect(EMPTY_ITEM_FORM).toEqual({ category: null, colorsText: '', seasons: [], tags: [] });
    expect(Object.isFrozen(EMPTY_ITEM_FORM)).toBe(true);
  });
});

describe('hasDetailChanges', () => {
  const base: ClothingItem = {
    id: 'x',
    imageUri: 'closet-images/x.jpg',
    category: 'top',
    colors: ['navy', 'white'],
    seasons: ['spring', 'summer'],
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('is false when only timestamps or the photo differ', () => {
    expect(hasDetailChanges(base, { ...base })).toBe(false);
    expect(
      hasDetailChanges(base, { ...base, imageUri: 'other.jpg', updatedAt: '2026-05-01T00:00:00.000Z' }),
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

  it('detects category and color changes, including color order', () => {
    expect(hasDetailChanges(base, { ...base, category: 'outerwear' })).toBe(true);
    expect(hasDetailChanges(base, { ...base, colors: ['white', 'navy'] })).toBe(true);
    expect(hasDetailChanges(base, { ...base, colors: ['navy'] })).toBe(true);
    expect(hasDetailChanges(base, { ...base, colors: ['navy', 'cream'] })).toBe(true);
  });
});
