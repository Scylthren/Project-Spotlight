import {
  OUTFIT_MAX_PIECES,
  OUTFIT_RATIONALE_MAX_LENGTH,
  OUTFIT_REQUEST_MAX_LENGTH,
  outfitKey,
  SUMMARY_ID_MAX_LENGTH,
} from '@/ai/generate-outfits-contract';
import { closetItem } from '@/ai/testing/outfit-fixtures';

import { REMOVED_PIECE_TEXT, lookPiecesText } from './look-display';
import {
  ALL_LOOKS_FILTER,
  effectiveLookbookFilter,
  lookbookEntries,
  lookbookFilterLabel,
  lookbookFilters,
  lookSeasons,
  looksWithNoPiecesLeft,
  matchesLookbookFilter,
  nextOccasion,
  nextRating,
  OCCASIONS,
  OCCASION_LABELS,
  SAVED_LOOK_ID_MAX_LENGTH,
  SAVED_LOOK_MAX_PIECES,
  SAVED_LOOK_RATIONALE_MAX_LENGTH,
  SAVED_LOOK_REQUEST_MAX_LENGTH,
  savedCountText,
  savedDateText,
  savedLookKey,
  savedLookMetaText,
  savedLookPieces,
  savedLookTitle,
  validateSavedLook,
  compareSavedLooksNewestFirst,
  type LookbookFilter,
} from './saved-look';
import { makeSavedLook, piece } from './testing/saved-look-fixtures';
import type { ClothingItem } from './types';

const closetOf = (...items: ClothingItem[]) => new Map(items.map((i) => [i.id, i]));

describe('saved look limits match the generate-outfits contract', () => {
  it('uses the same request, rationale, piece and id limits, and the same look key', () => {
    expect(SAVED_LOOK_REQUEST_MAX_LENGTH).toBe(OUTFIT_REQUEST_MAX_LENGTH);
    expect(SAVED_LOOK_RATIONALE_MAX_LENGTH).toBe(OUTFIT_RATIONALE_MAX_LENGTH);
    expect(SAVED_LOOK_MAX_PIECES).toBe(OUTFIT_MAX_PIECES);
    expect(SAVED_LOOK_ID_MAX_LENGTH).toBe(SUMMARY_ID_MAX_LENGTH);
    expect(savedLookKey(['b', 'a', 'c'])).toBe(outfitKey(['c', 'b', 'a']));
  });
});

describe('occasions (D11)', () => {
  it('are the fixed list in chip order with their labels', () => {
    expect(OCCASIONS.map((o) => OCCASION_LABELS[o])).toEqual([
      'Everyday',
      'Work',
      'Night out',
      'Date',
      'Formal',
      'Active',
      'Travel',
    ]);
  });
});

describe('validateSavedLook', () => {
  it('accepts a valid look, with or without rating, occasion, model and request text', () => {
    expect(validateSavedLook(makeSavedLook())).toEqual([]);
    expect(validateSavedLook(makeSavedLook({ rating: 'down', occasion: 'night-out', model: null, request: '' }))).toEqual([]);
    expect(validateSavedLook(makeSavedLook({ rationale: 'x'.repeat(300), request: '🙂'.repeat(200) }))).toEqual([]);
  });

  it.each<[string, unknown]>([
    ['not an object', null],
    ['empty id', makeSavedLook({ id: '' })],
    ['request too long', makeSavedLook({ request: 'x'.repeat(201) })],
    ['empty rationale', makeSavedLook({ rationale: '  ' })],
    ['rationale too long', makeSavedLook({ rationale: 'x'.repeat(301) })],
    ['no pieces', makeSavedLook({ pieces: [] })],
    ['too many pieces', makeSavedLook({ pieces: Array.from({ length: 10 }, (_, i) => piece(`a-${i}`, 'accessory')) })],
    ['repeated piece', makeSavedLook({ pieces: [piece('top-1', 'top'), piece('top-1', 'top')] })],
    ['unknown category', { ...makeSavedLook(), pieces: [{ itemId: 'x', category: 'hat' }] }],
    ['piece id too long', makeSavedLook({ pieces: [piece('x'.repeat(65), 'top')] })],
    ['bad rating', { ...makeSavedLook(), rating: 'meh' }],
    ['bad occasion', { ...makeSavedLook(), occasion: 'Party' }],
    ['bad date', makeSavedLook({ createdAt: 'yesterday' })],
    ['empty model', makeSavedLook({ model: '' })],
  ])('rejects %s', (_, value) => {
    expect(validateSavedLook(value).length).toBeGreaterThan(0);
  });
});

describe('ratings and occasions toggle', () => {
  it('tapping the current rating clears it; the other replaces it', () => {
    expect(nextRating(null, 'up')).toBe('up');
    expect(nextRating('up', 'up')).toBeNull();
    expect(nextRating('up', 'down')).toBe('down');
    expect(nextOccasion(null, 'work')).toBe('work');
    expect(nextOccasion('work', 'work')).toBeNull();
    expect(nextOccasion('work', 'date')).toBe('date');
  });
});

describe('pieces against the closet (D5)', () => {
  const top = closetItem('top-1', 'top', { seasons: ['summer', 'spring'] });
  const shoes = closetItem('shoes-1', 'shoes', { seasons: ['summer'] });

  it('a deleted piece is null and keeps its saved category; it reads "Removed from closet"', () => {
    const pieces = savedLookPieces(makeSavedLook(), closetOf(top, shoes));
    expect(pieces.map((p) => [p.id, p.category, p.item?.id ?? null])).toEqual([
      ['top-1', 'top', 'top-1'],
      ['bottom-1', 'bottom', null],
      ['shoes-1', 'shoes', 'shoes-1'],
    ]);
    expect(lookPiecesText(pieces)).toContain(REMOVED_PIECE_TEXT);
  });

  it('a piece whose category was edited shows its category now', () => {
    const pieces = savedLookPieces(makeSavedLook(), closetOf({ ...top, category: 'outerwear' }));
    expect(pieces[0].category).toBe('outerwear');
  });

  it('only looks with no piece left in the closet are to be deleted', () => {
    const kept = makeSavedLook({ id: 'kept' });
    const onlyShoes = makeSavedLook({ id: 'only-shoes', pieces: [piece('gone', 'top'), piece('shoes-1', 'shoes')] });
    const empty = makeSavedLook({ id: 'empty', pieces: [piece('gone', 'top'), piece('gone-2', 'bottom')] });
    expect(looksWithNoPiecesLeft([kept, onlyShoes, empty], new Set(['top-1', 'shoes-1']))).toEqual(['empty']);
  });
});

describe('lookSeasons', () => {
  it('is the seasons every remaining piece has, in season order', () => {
    const a = closetItem('a', 'top', { seasons: ['winter', 'summer', 'spring'] });
    const b = closetItem('b', 'bottom', { seasons: ['spring', 'summer'] });
    expect(lookSeasons([{ id: 'a', category: 'top', item: a }, { id: 'b', category: 'bottom', item: b }])).toEqual([
      'spring',
      'summer',
    ]);
  });

  it('ignores removed pieces, and is empty when none is left', () => {
    const a = closetItem('a', 'top', { seasons: ['winter'] });
    expect(lookSeasons([{ id: 'a', category: 'top', item: a }, { id: 'x', category: 'bottom', item: null }])).toEqual(['winter']);
    expect(lookSeasons([{ id: 'x', category: 'bottom', item: null }])).toEqual([]);
  });

  it('follows an item season edit after saving', () => {
    const look = makeSavedLook({ pieces: [piece('top-1', 'top')] });
    const before = lookbookEntries([look], closetOf(closetItem('top-1', 'top', { seasons: ['summer'] })));
    const after = lookbookEntries([look], closetOf(closetItem('top-1', 'top', { seasons: ['winter'] })));
    expect(before[0].seasons).toEqual(['summer']);
    expect(after[0].seasons).toEqual(['winter']);
  });
});

describe('Lookbook filters', () => {
  const closet = closetOf(
    closetItem('top-1', 'top', { seasons: ['summer', 'spring'] }),
    closetItem('bottom-1', 'bottom', { seasons: ['summer'] }),
    closetItem('shoes-1', 'shoes', { seasons: ['summer', 'winter'] }),
    closetItem('coat', 'outerwear', { seasons: ['winter'] }),
  );
  const summerNight = makeSavedLook({ id: 'a', occasion: 'night-out' });
  const winterWork = makeSavedLook({ id: 'b', occasion: 'work', pieces: [piece('coat', 'outerwear'), piece('shoes-1', 'shoes')] });
  const plain = makeSavedLook({ id: 'c', pieces: [piece('top-1', 'top')] });
  const entries = lookbookEntries([summerNight, winterWork, plain], closet);

  it('are All, then the occasions in use in list order, then the seasons in use in season order', () => {
    expect(lookbookFilters(entries).map(lookbookFilterLabel)).toEqual(['All', 'Work', 'Night out', 'Spring', 'Summer', 'Winter']);
    expect(lookbookFilters([]).map(lookbookFilterLabel)).toEqual(['All']);
  });

  it('match by occasion or season', () => {
    const ids = (filter: LookbookFilter) => entries.filter((e) => matchesLookbookFilter(e, filter)).map((e) => e.look.id);
    expect(ids(ALL_LOOKS_FILTER)).toEqual(['a', 'b', 'c']);
    expect(ids({ kind: 'occasion', occasion: 'work' })).toEqual(['b']);
    expect(ids({ kind: 'season', season: 'summer' })).toEqual(['a', 'c']);
    expect(ids({ kind: 'season', season: 'spring' })).toEqual(['c']);
  });

  it('falls back to All when the chosen filter has no chip any more (its last look deleted)', () => {
    const work: LookbookFilter = { kind: 'occasion', occasion: 'work' };
    expect(effectiveLookbookFilter(work, lookbookFilters(entries))).toEqual(work);
    const withoutB = entries.filter((e) => e.look.id !== 'b');
    expect(effectiveLookbookFilter(work, lookbookFilters(withoutB))).toEqual(ALL_LOOKS_FILTER);
  });
});

describe('text', () => {
  const now = new Date(2026, 9, 24, 15, 0);

  it('count, date, meta and title', () => {
    expect(savedCountText(4)).toBe('4 saved');
    expect(savedDateText(new Date(2026, 9, 3, 12).toISOString(), now)).toBe('Oct 3');
    expect(savedDateText(new Date(2025, 11, 31, 12).toISOString(), now)).toBe('Dec 31, 2025');
    expect(savedDateText('nope', now)).toBe('');
    const createdAt = new Date(2026, 9, 24, 12).toISOString();
    expect(savedLookMetaText(makeSavedLook({ createdAt }), now)).toBe('Oct 24');
    expect(savedLookMetaText(makeSavedLook({ createdAt, occasion: 'night-out', rating: 'up' }), now)).toBe(
      'Oct 24 · Night out · Liked',
    );
    expect(savedLookMetaText(makeSavedLook({ createdAt, rating: 'down' }), now)).toBe('Oct 24 · Not for me');
    expect(savedLookTitle({ request: 'Emo vibes' })).toBe('“Emo vibes”');
    expect(savedLookTitle({ request: ' ' })).toBe('Saved look');
  });

  it('sorts newest first, ties by id', () => {
    const a = makeSavedLook({ id: 'a', createdAt: '2026-10-01T00:00:00.000Z' });
    const b = makeSavedLook({ id: 'b', createdAt: '2026-10-02T00:00:00.000Z' });
    const c = makeSavedLook({ id: 'c', createdAt: '2026-10-02T02:00:00.000+02:00' });
    expect([a, c, b].sort(compareSavedLooksNewestFirst).map((l) => l.id)).toEqual(['b', 'c', 'a']);
  });
});
