import {
  applyCategorySeasonSuggestions,
  categorySeasonFields,
  clearSuggestedCategorySeason,
  isSuggestedValue,
  pickCategory,
  toggleFormSeason,
} from './category-season-suggestions';

describe('category and season suggestions (auto/user rule)', () => {
  it('a blank form is untouched; values loaded from a saved item count as the user\'s', () => {
    expect(categorySeasonFields(null, [])).toEqual({
      category: { value: null, source: 'auto' },
      seasons: { value: [], source: 'auto' },
    });
    expect(categorySeasonFields('top', ['winter'])).toEqual({
      category: { value: 'top', source: 'user' },
      seasons: { value: ['winter'], source: 'user' },
    });
    expect(categorySeasonFields('top', []).seasons.source).toBe('auto');
  });

  it('fills untouched fields as auto, in season order, dropping unknown values', () => {
    const next = applyCategorySeasonSuggestions(categorySeasonFields(null, []), {
      category: 'outerwear',
      seasons: ['winter', 'autumn', 'monsoon', 'winter'],
    });
    expect(next).toEqual({
      category: { value: 'outerwear', source: 'auto' },
      seasons: { value: ['autumn', 'winter'], source: 'auto' },
    });
    expect(applyCategorySeasonSuggestions(categorySeasonFields(null, []), { category: 'swimwear', seasons: 'summer' })).toEqual(
      categorySeasonFields(null, []),
    );
  });

  it('never changes a field the user touched, even a cleared one or one set before the reply', () => {
    let fields = categorySeasonFields(null, []);
    fields = pickCategory(fields, 'bottom');
    fields = toggleFormSeason(fields, 'summer');
    fields = toggleFormSeason(fields, 'summer'); // cleared again: still the user's
    const next = applyCategorySeasonSuggestions(fields, { category: 'top', seasons: ['spring'] });
    expect(next).toEqual({ category: { value: 'bottom', source: 'user' }, seasons: { value: [], source: 'user' } });
  });

  it('a saved item\'s category and seasons are never replaced by suggestions', () => {
    const loaded = categorySeasonFields('dress', ['summer']);
    expect(applyCategorySeasonSuggestions(loaded, { category: 'top', seasons: ['winter'] })).toEqual(loaded);
  });

  it('replaces earlier auto values with the new photo\'s (or empties them)', () => {
    const first = applyCategorySeasonSuggestions(categorySeasonFields(null, []), { category: 'top', seasons: ['spring'] });
    expect(applyCategorySeasonSuggestions(first, { category: null, seasons: [] })).toEqual(categorySeasonFields(null, []));
  });

  it('clearing (front photo retaken) empties only auto values', () => {
    const auto = applyCategorySeasonSuggestions(categorySeasonFields(null, []), { category: 'shoes', seasons: ['winter'] });
    expect(clearSuggestedCategorySeason(auto)).toEqual(categorySeasonFields(null, []));
    const mixed = pickCategory(auto, 'accessory');
    expect(clearSuggestedCategorySeason(mixed)).toEqual({
      category: { value: 'accessory', source: 'user' },
      seasons: { value: [], source: 'auto' },
    });
  });

  it('marks only non-empty auto values as suggested', () => {
    expect(isSuggestedValue({ value: 'top', source: 'auto' })).toBe(true);
    expect(isSuggestedValue({ value: ['winter'], source: 'auto' })).toBe(true);
    expect(isSuggestedValue({ value: null, source: 'auto' })).toBe(false);
    expect(isSuggestedValue({ value: [], source: 'auto' })).toBe(false);
    expect(isSuggestedValue({ value: 'top', source: 'user' })).toBe(false);
  });
});
