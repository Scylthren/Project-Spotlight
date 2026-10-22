import {
  CATEGORIES,
  CATEGORY_FILTERS,
  categoryFilterLabel,
  filterCloset,
  isUnfiltered,
  matchesSearch,
  noMatchesMessage,
  NO_CLOSET_FILTER,
  pieceCount,
  searchTerms,
  type ClothingItem,
  type ItemColor,
  type PaletteId,
} from '@/core';

function color(paletteId: PaletteId): ItemColor {
  return { paletteId, hex: '#111111', source: 'user' };
}

function item(id: string, overrides: Partial<ClothingItem> = {}): ClothingItem {
  return {
    id,
    photos: [{ id: `${id}-p`, role: 'front', path: `${id}.jpg`, sortOrder: 0, isPrimary: true }],
    category: 'top',
    colors: [color('black')],
    seasons: ['summer'],
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const navyTop = item('navy-top', { colors: [color('navy'), color('white')], tags: ['preppy'] });
const greyJeans = item('grey-jeans', { category: 'bottom', colors: [color('light-grey')], tags: ['90s', 'grunge'] });
const skyDress = item('sky-dress', { category: 'dress', colors: [color('sky-blue')], tags: ['old money'] });
const blackBoots = item('black-boots', { category: 'shoes', colors: [color('black')], tags: ['emo'] });
const bag = item('bag', { category: 'accessory', colors: [color('burgundy')] });
const CLOSET = [navyTop, greyJeans, skyDress, blackBoots, bag];

const ids = (items: ClothingItem[]) => items.map((i) => i.id);
const search = (query: string) => ids(filterCloset(CLOSET, { query, category: 'all' }));

describe('category filters', () => {
  it('are All followed by every category, labelled in the plural', () => {
    expect(CATEGORY_FILTERS).toEqual(['all', ...CATEGORIES]);
    expect(CATEGORY_FILTERS.map(categoryFilterLabel)).toEqual([
      'All',
      'Tops',
      'Bottoms',
      'Dresses',
      'Outerwear',
      'Shoes',
      'Accessories',
    ]);
  });

  it('All shows everything; a category shows only its items, in order', () => {
    expect(ids(filterCloset(CLOSET, NO_CLOSET_FILTER))).toEqual(ids(CLOSET));
    expect(ids(filterCloset(CLOSET, { query: '', category: 'shoes' }))).toEqual(['black-boots']);
    expect(ids(filterCloset(CLOSET, { query: '', category: 'outerwear' }))).toEqual([]);
  });
});

describe('search', () => {
  it('matches the category by id, label and plural label', () => {
    expect(search('top')).toEqual(['navy-top']);
    expect(search('tops')).toEqual(['navy-top']);
    expect(search('accessories')).toEqual(['bag']);
    expect(search('bottom')).toEqual(['grey-jeans']);
  });

  it('matches color names, including multi-word names and parts of them', () => {
    expect(search('navy')).toEqual(['navy-top']);
    expect(search('white')).toEqual(['navy-top']); // a secondary color counts
    expect(search('light grey')).toEqual(['grey-jeans']);
    expect(search('blue')).toEqual(['sky-dress']);
    expect(search('black')).toEqual(['black-boots']);
  });

  it('matches style tags, including tags with spaces', () => {
    expect(search('emo')).toEqual(['black-boots']);
    expect(search('90s')).toEqual(['grey-jeans']);
    expect(search('old money')).toEqual(['sky-dress']);
  });

  it('is case-insensitive and ignores extra spaces', () => {
    expect(search('  NaVy  ')).toEqual(['navy-top']);
    expect(search('EMO')).toEqual(['black-boots']);
    expect(searchTerms('  Light   GREY ')).toEqual(['light', 'grey']);
  });

  it('needs every word to match something: "navy top" finds navy tops only', () => {
    expect(search('navy top')).toEqual(['navy-top']);
    expect(search('navy shoes')).toEqual([]);
    expect(search('black emo')).toEqual(['black-boots']);
  });

  it('does not match on other fields (seasons, ids, photo paths)', () => {
    expect(search('summer')).toEqual([]);
    expect(search('navy-top')).toEqual([]);
    expect(search('jpg')).toEqual([]);
  });

  it('an empty or blank query matches everything', () => {
    expect(matchesSearch(navyTop, '')).toBe(true);
    expect(matchesSearch(navyTop, '   ')).toBe(true);
  });
});

describe('search and category together', () => {
  it('combine: both must match', () => {
    expect(ids(filterCloset(CLOSET, { query: 'black', category: 'shoes' }))).toEqual(['black-boots']);
    expect(ids(filterCloset(CLOSET, { query: 'black', category: 'top' }))).toEqual([]);
    expect(ids(filterCloset(CLOSET, { query: 'grunge', category: 'bottom' }))).toEqual(['grey-jeans']);
  });

  it('knows when nothing is filtered', () => {
    expect(isUnfiltered(NO_CLOSET_FILTER)).toBe(true);
    expect(isUnfiltered({ query: '  ', category: 'all' })).toBe(true);
    expect(isUnfiltered({ query: 'emo', category: 'all' })).toBe(false);
    expect(isUnfiltered({ query: '', category: 'top' })).toBe(false);
  });
});

describe('messages', () => {
  it('says when a search or filter finds nothing, naming what was asked', () => {
    expect(noMatchesMessage({ query: ' emo ', category: 'all' })).toBe('Nothing in your closet matches "emo".');
    expect(noMatchesMessage({ query: '', category: 'outerwear' })).toBe('No outerwear in your closet yet.');
    expect(noMatchesMessage({ query: 'navy', category: 'shoes' })).toBe('No shoes match "navy".');
  });

  it('the no-match message is never the empty-closet message', () => {
    for (const category of CATEGORY_FILTERS) {
      for (const query of ['', 'emo']) {
        if (isUnfiltered({ query, category })) continue;
        expect(noMatchesMessage({ query, category })).not.toBe('Your closet is empty.');
      }
    }
  });

  it('counts pieces', () => {
    expect(pieceCount(0)).toBe('0 pieces');
    expect(pieceCount(1)).toBe('1 piece');
    expect(pieceCount(24)).toBe('24 pieces');
  });
});
