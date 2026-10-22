import {
  CATEGORIES,
  CATEGORY_LABELS,
  describeClosetTile,
  describeItemDetail,
  initialAngleId,
  photoAngles,
  selectedAngle,
  SEASON_LABELS,
  SEASONS,
  type ClothingItem,
  type ItemPhoto,
} from '@/core';

function photo(id: string, role: ItemPhoto['role'], sortOrder: number, isPrimary = false): ItemPhoto {
  return { id, role, path: `closet-images/${id}.jpg`, sortOrder, isPrimary };
}

const ITEM: ClothingItem = {
  id: 'item-1',
  photos: [photo('f', 'front', 0, true)],
  category: 'outerwear',
  colors: [
    { paletteId: 'navy', hex: '#202A60', source: 'user' },
    { paletteId: 'light-grey', hex: '#C9C9C7', source: 'auto' },
  ],
  seasons: ['winter', 'autumn'],
  tags: ['minimal', 'old money'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('labels', () => {
  it('every category and season has a label; autumn stays "Autumn"', () => {
    for (const c of CATEGORIES) expect(CATEGORY_LABELS[c]).toMatch(/^[A-Z]/);
    for (const s of SEASONS) expect(SEASON_LABELS[s]).toMatch(/^[A-Z]/);
    expect(SEASON_LABELS.autumn).toBe('Autumn');
  });
});

describe('describeClosetTile', () => {
  it('names the tile by category, with the colors underneath and both read together', () => {
    expect(describeClosetTile(ITEM)).toEqual({
      name: 'Outerwear',
      meta: 'Navy, Light grey',
      accessibilityLabel: 'Outerwear, Navy, Light grey',
    });
  });
});

describe('photoAngles', () => {
  it('lists photos in display order with short labels', () => {
    const photos = [photo('d', 'detail', 2), photo('f', 'front', 0, true), photo('b', 'back', 1)];
    expect(photoAngles(photos).map((a) => [a.photoId, a.label])).toEqual([
      ['f', 'Front'],
      ['b', 'Back'],
      ['d', 'Detail'],
    ]);
  });

  it('numbers two detail photos', () => {
    const photos = [photo('f', 'front', 0, true), photo('d1', 'detail', 1), photo('d2', 'detail', 2)];
    expect(photoAngles(photos).map((a) => a.label)).toEqual(['Front', 'Detail 1', 'Detail 2']);
  });

  it('keeps the stored path for each angle', () => {
    expect(photoAngles([photo('f', 'front', 0, true)])[0].path).toBe('closet-images/f.jpg');
  });
});

describe('angle selection', () => {
  const photos = [photo('f', 'front', 0), photo('b', 'back', 1, true)];
  const angles = photoAngles(photos);

  it('starts on the primary photo (the one the grid shows)', () => {
    expect(initialAngleId(photos)).toBe('b');
    expect(selectedAngle(angles, null, photos)?.photoId).toBe('b');
  });

  it('shows the chosen angle, and falls back to the primary if it is gone', () => {
    expect(selectedAngle(angles, 'f', photos)?.photoId).toBe('f');
    expect(selectedAngle(angles, 'deleted', photos)?.photoId).toBe('b');
  });

  it('returns nothing for an item without photos', () => {
    expect(initialAngleId([])).toBeNull();
    expect(selectedAngle([], null, [])).toBeNull();
  });
});

describe('describeItemDetail', () => {
  it('uses Gate 1 fields only: category title, colors primary first, seasons in calendar order, tags', () => {
    const detail = describeItemDetail(ITEM);
    expect(detail.title).toBe('Outerwear');
    expect(detail.colors).toEqual([
      { paletteId: 'navy', name: 'Navy', hex: '#202A60', primary: true },
      { paletteId: 'light-grey', name: 'Light grey', hex: '#C9C9C7', primary: false },
    ]);
    expect(detail.colorsAccessibilityLabel).toBe('Colors: Navy (primary), Light grey');
    expect(detail.seasonsText).toBe('Autumn · Winter');
    expect(detail.seasonsAccessibilityLabel).toBe('Seasons: Autumn, Winter');
    expect(detail.tags).toEqual(['minimal', 'old money']);
  });

  it('does not share the item tag array', () => {
    const detail = describeItemDetail(ITEM);
    detail.tags.push('x');
    expect(ITEM.tags).toEqual(['minimal', 'old money']);
  });

  it('shows the attributes under the title, after a named item\'s category, and names them for screen readers', () => {
    const attributes: ClothingItem['attributes'] = {
      type: { value: 'Band hoodie', source: 'user' },
      pattern: { value: 'polka-dot', source: 'auto' },
      fit: { value: 'oversized', source: 'auto' },
      formality: { value: 'smart-casual', source: 'user' },
    };
    const unnamed = describeItemDetail({ ...ITEM, attributes });
    expect(unnamed.subtitle).toBe('Band hoodie · Polka dot · Oversized · Smart casual');
    expect(unnamed.subtitleAccessibilityLabel).toBe(
      'type Band hoodie, pattern Polka dot, fit Oversized, formality Smart casual',
    );
    const named = describeItemDetail({ ...ITEM, name: 'Old coat', attributes: { material: { value: 'wool', source: 'auto' } } });
    expect(named.subtitle).toBe('Outerwear · Wool');
    expect(named.subtitleAccessibilityLabel).toBe('Outerwear, material Wool');
  });

  it('has no subtitle for an unnamed item without attributes, and only the category for a named one', () => {
    expect(describeItemDetail(ITEM).subtitle).toBeNull();
    expect(describeItemDetail(ITEM).subtitleAccessibilityLabel).toBeNull();
    expect(describeItemDetail({ ...ITEM, name: 'Coat' }).subtitle).toBe('Outerwear');
  });
});
