/**
 * The generate-outfits composition rules (Gate 3 D3), which live in plain
 * TypeScript under `supabase/functions/generate-outfits/`.
 */
import { stubOutfits, type ClosetItemSummary } from '../../../supabase/functions/_shared/generate-outfits-contract.ts';
import {
  indexCloset,
  outfitProblems,
  validateOutfits,
  type OutfitProblem,
} from '../../../supabase/functions/generate-outfits/outfit-rules.ts';
import { sampleSummaries, summary } from '@/ai/testing/outfit-fixtures';

const closet = indexCloset(sampleSummaries());
const accessories = Array.from({ length: 6 }, (_, i) => summary(`acc-${i}`, 'accessory'));
const bigCloset = indexCloset([...sampleSummaries(), ...accessories, summary('coat-2', 'outerwear'), summary('dress-2', 'dress')]);
const noShoes = indexCloset(sampleSummaries().filter((item) => item.category !== 'shoes'));

const look = (itemIds: string[], rationale = 'Clean lines.') => ({ itemIds, rationale });

describe('outfitProblems', () => {
  it.each<[string, string[]]>([
    ['top, bottom and shoes', ['top-1', 'bottom-1', 'shoes-1']],
    ['a dress and shoes', ['dress-1', 'shoes-2']],
    ['ids in any order', ['shoes-1', 'bottom-2', 'top-2']],
    ['with outerwear and an accessory', ['top-1', 'bottom-1', 'shoes-1', 'coat-1', 'bag-1']],
  ])('accepts %s', (_name, ids) => {
    expect(outfitProblems(look(ids), closet)).toEqual([]);
  });

  it('accepts 5 accessories', () => {
    const ids = ['dress-1', 'shoes-1', ...accessories.slice(0, 5).map((a) => a.id)];
    expect(outfitProblems(look(ids), bigCloset)).toEqual([]);
  });

  it('needs no shoes when the closet sent has none', () => {
    expect(outfitProblems(look(['top-1', 'bottom-1']), noShoes)).toEqual([]);
    expect(outfitProblems(look(['dress-1', 'coat-1']), noShoes)).toEqual([]);
  });

  it.each<[string, unknown, ReturnType<typeof indexCloset>, OutfitProblem[]]>([
    ['not an object', 'top-1', closet, ['not_an_object']],
    ['ids not a list', { itemIds: 'top-1', rationale: 'x' }, closet, ['item_ids_not_a_list']],
    ['an id not in the closet', look(['top-1', 'bottom-1', 'shoes-1', 'ghost']), closet, ['unknown_id']],
    ['a non-string id', look(['top-1', 'bottom-1', 'shoes-1', 7 as never]), closet, ['unknown_id']],
    ['a repeated id', look(['top-1', 'bottom-1', 'shoes-1', 'top-1']), closet, ['duplicate_id']],
    ['no ids', look([]), closet, ['no_top_bottom_or_dress', 'missing_shoes']],
    ['only shoes and a coat', look(['shoes-1', 'coat-1']), closet, ['no_top_bottom_or_dress']],
    ['a top without a bottom', look(['top-1', 'shoes-1']), closet, ['top_without_bottom']],
    ['a bottom without a top', look(['bottom-1', 'shoes-1']), closet, ['bottom_without_top']],
    ['a dress with a top', look(['dress-1', 'top-1', 'shoes-1']), closet, ['dress_with_top_or_bottom']],
    ['a dress with a top and a bottom', look(['dress-1', 'top-1', 'bottom-1', 'shoes-1']), closet, ['dress_with_top_or_bottom']],
    ['two tops', look(['top-1', 'top-2', 'bottom-1', 'shoes-1']), closet, ['too_many_tops']],
    ['two bottoms', look(['top-1', 'bottom-1', 'bottom-2', 'shoes-1']), closet, ['too_many_bottoms']],
    ['two dresses', look(['dress-1', 'dress-2', 'shoes-1']), bigCloset, ['too_many_dresses']],
    ['no shoes when the closet has some', look(['top-1', 'bottom-1']), closet, ['missing_shoes']],
    ['two pairs of shoes', look(['top-1', 'bottom-1', 'shoes-1', 'shoes-2']), closet, ['too_many_shoes']],
    ['two outerwear', look(['top-1', 'bottom-1', 'shoes-1', 'coat-1', 'coat-2']), bigCloset, ['too_many_outerwear']],
    ['six accessories', look(['dress-1', 'shoes-1', ...accessories.map((a) => a.id)]), bigCloset, ['too_many_accessories']],
    ['an empty rationale', look(['top-1', 'bottom-1', 'shoes-1'], ' \n '), closet, ['missing_rationale']],
    ['a missing rationale', { itemIds: ['top-1', 'bottom-1', 'shoes-1'] }, closet, ['missing_rationale']],
    ['a 301-character rationale', look(['top-1', 'bottom-1', 'shoes-1'], 'x'.repeat(301)), closet, ['rationale_too_long']],
  ])('rejects %s', (_name, candidate, index, problems) => {
    expect(outfitProblems(candidate, index)).toEqual(problems);
  });

  it('accepts a rationale of exactly 300 characters (code points) after trimming', () => {
    expect(outfitProblems(look(['top-1', 'bottom-1', 'shoes-1'], `  ${'\u{1F600}'.repeat(300)}  `), closet)).toEqual([]);
  });

  it('reports every broken rule at once', () => {
    expect(outfitProblems(look(['top-1', 'top-2', 'ghost'], ''), closet)).toEqual([
      'unknown_id',
      'too_many_tops',
      'top_without_bottom',
      'missing_shoes',
      'missing_rationale',
    ]);
  });
});

describe('validateOutfits', () => {
  it('keeps valid outfits with ids in category order and a normalized rationale', () => {
    const result = validateOutfits([look(['bag-1', 'shoes-1', 'coat-1', 'bottom-1', 'top-1'], '  Easy \n weekend. ')], closet);
    expect(result.outfits).toEqual([{ itemIds: ['top-1', 'bottom-1', 'coat-1', 'shoes-1', 'bag-1'], rationale: 'Easy weekend.' }]);
    expect(result).toMatchObject({ rejected: [], duplicates: 0, surplus: 0 });
  });

  it('keeps accessories in the order given', () => {
    const ids = ['dress-1', 'acc-3', 'shoes-1', 'acc-1'];
    expect(validateOutfits([look(ids)], bigCloset).outfits[0].itemIds).toEqual(['dress-1', 'shoes-1', 'acc-3', 'acc-1']);
  });

  it('drops invalid outfits and says why, by position', () => {
    const result = validateOutfits([look(['top-1', 'ghost']), look(['dress-1', 'shoes-1']), null], closet);
    expect(result.outfits).toEqual([{ itemIds: ['dress-1', 'shoes-1'], rationale: 'Clean lines.' }]);
    expect(result.rejected).toEqual([
      { index: 0, problems: ['unknown_id', 'top_without_bottom', 'missing_shoes'] },
      { index: 2, problems: ['not_an_object'] },
    ]);
  });

  it('drops the same outfit given again, in any order and with another rationale', () => {
    const result = validateOutfits(
      [look(['top-1', 'bottom-1', 'shoes-1']), look(['shoes-1', 'top-1', 'bottom-1'], 'Again.'), look(['dress-1', 'shoes-1'])],
      closet,
    );
    expect(result.outfits.map((o) => o.itemIds)).toEqual([
      ['top-1', 'bottom-1', 'shoes-1'],
      ['dress-1', 'shoes-1'],
    ]);
    expect(result.duplicates).toBe(1);
  });

  it('keeps at most 3', () => {
    const result = validateOutfits(
      [
        look(['top-1', 'bottom-1', 'shoes-1']),
        look(['top-2', 'bottom-1', 'shoes-1']),
        look(['top-1', 'bottom-2', 'shoes-1']),
        look(['dress-1', 'shoes-1']),
      ],
      closet,
    );
    expect(result.outfits).toHaveLength(3);
    expect(result.surplus).toBe(1);
  });

  it('handles an empty list', () => {
    expect(validateOutfits([], closet)).toEqual({ outfits: [], rejected: [], duplicates: 0, avoided: 0, surplus: 0 });
  });
});

describe('validateOutfits with avoid (Restyle)', () => {
  it('drops a valid outfit whose id set is avoided, in any order, and counts it', () => {
    const result = validateOutfits(
      [look(['top-1', 'bottom-1', 'shoes-1']), look(['dress-1', 'shoes-1'])],
      closet,
      [['shoes-1', 'bottom-1', 'top-1']],
    );
    expect(result.outfits.map((o) => o.itemIds)).toEqual([['dress-1', 'shoes-1']]);
    expect(result.avoided).toBe(1);
    expect(result.duplicates).toBe(0);
  });

  it('only matches the whole set: a subset or superset is not avoided', () => {
    const result = validateOutfits(
      [look(['top-1', 'bottom-1', 'shoes-1']), look(['top-1', 'bottom-1', 'shoes-1', 'coat-1'])],
      closet,
      [['top-1', 'bottom-1', 'shoes-1', 'bag-1'], ['top-1', 'bottom-1']],
    );
    expect(result.outfits).toHaveLength(2);
    expect(result.avoided).toBe(0);
  });

  it('ignores avoided sets with ids the closet does not have', () => {
    const result = validateOutfits([look(['dress-1', 'shoes-1'])], closet, [['ghost', 'dress-1']]);
    expect(result.outfits).toHaveLength(1);
    expect(result.avoided).toBe(0);
  });

  it('an invalid candidate is rejected, not counted as avoided', () => {
    const result = validateOutfits([look(['top-1'])], closet, [['top-1']]);
    expect(result.rejected).toHaveLength(1);
    expect(result.avoided).toBe(0);
  });
});

describe('the stub with avoid obeys the rules', () => {
  it('never answers an avoided look and stays valid', () => {
    const items = sampleSummaries();
    const avoid = stubOutfits(items).map((o) => o.itemIds);
    const picks = stubOutfits(items, avoid);
    const result = validateOutfits(picks, indexCloset(items), avoid);
    expect(picks.length).toBeGreaterThan(0);
    expect(result.rejected).toEqual([]);
    expect(result.avoided).toBe(0);
    expect(result.outfits).toHaveLength(picks.length);
  });
});

describe('the stub obeys the rules', () => {
  const closets: [string, ClosetItemSummary[]][] = [
    ['the sample closet', sampleSummaries()],
    ['no shoes', sampleSummaries().filter((item) => item.category !== 'shoes')],
    ['dresses only', [summary('d1', 'dress'), summary('d2', 'dress'), summary('s', 'shoes'), summary('a', 'accessory')]],
    ['one of each', [summary('t', 'top'), summary('b', 'bottom'), summary('s', 'shoes')]],
  ];

  it.each(closets)('%s', (_name, items) => {
    const picks = stubOutfits(items);
    const result = validateOutfits(picks, indexCloset(items));
    expect(result.rejected).toEqual([]);
    expect(result.duplicates).toBe(0);
    expect(result.outfits).toHaveLength(picks.length);
    expect(picks.length).toBeGreaterThan(0);
  });
});
