/**
 * The generate-outfits prefilter (Gate 3 slice 3): what reaches the prompt
 * from a closet of up to 300 items. Deterministic, no network.
 */
import { missingForOutfit, type ClosetItemSummary } from '../../../supabase/functions/_shared/generate-outfits-contract.ts';
import { TAG_CATEGORIES, type TagCategory } from '../../../supabase/functions/_shared/tag-item-contract.ts';
import {
  CATEGORY_QUOTAS,
  PREFILTER_MAX_ITEMS,
  prefilterCloset,
  requestHints,
  scoreItem,
  wordsOf,
} from '../../../supabase/functions/generate-outfits/prefilter.ts';
import { summary } from '@/ai/testing/outfit-fixtures';

/** `count` items of a category, ids `<category>-<n>`. */
function many(category: TagCategory, count: number, extra: (n: number) => Partial<ClosetItemSummary> = () => ({})): ClosetItemSummary[] {
  return Array.from({ length: count }, (_, n) => summary(`${category}-${n}`, category, extra(n)));
}

function countBy(items: readonly ClosetItemSummary[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.category] = (counts[item.category] ?? 0) + 1;
  return counts;
}

describe('prefilter limits', () => {
  it('keeps at most 120 items and the quotas add up to it', () => {
    expect(PREFILTER_MAX_ITEMS).toBe(120);
    expect(Object.values(CATEGORY_QUOTAS).reduce((a, b) => a + b, 0)).toBe(PREFILTER_MAX_ITEMS);
    expect(Object.keys(CATEGORY_QUOTAS).sort()).toEqual([...TAG_CATEGORIES].sort());
  });

  it('passes a closet of 120 or fewer through whole, in order', () => {
    const items = [...many('top', 60), ...many('bottom', 60)];
    expect(prefilterCloset(items, 'for summer')).toEqual({ items, omitted: 0 });
  });

  it('trims 300 items to 120 by category quota and reports the rest as omitted', () => {
    const items = TAG_CATEGORIES.flatMap((category) => many(category, 50));
    const result = prefilterCloset(items, 'for summer');
    expect(result.items).toHaveLength(120);
    expect(result.omitted).toBe(180);
    expect(countBy(result.items)).toEqual(CATEGORY_QUOTAS);
  });

  it('gives slots a category cannot use to the others', () => {
    const items = [...many('top', 200), ...many('bottom', 90), ...many('shoes', 2)];
    const result = prefilterCloset(items, 'anything');
    expect(result.items).toHaveLength(120);
    const counts = countBy(result.items);
    expect(counts.shoes).toBe(2);
    expect(counts.top).toBeGreaterThanOrEqual(CATEGORY_QUOTAS.top);
    expect(counts.bottom).toBeGreaterThanOrEqual(CATEGORY_QUOTAS.bottom);
  });

  it('keeps the order sent and is deterministic', () => {
    const items = TAG_CATEGORIES.flatMap((category) => many(category, 40));
    const a = prefilterCloset(items, 'emo vibes');
    const b = prefilterCloset([...items], 'emo vibes');
    expect(a).toEqual(b);
    const positions = a.items.map((item) => items.indexOf(item));
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
  });

  it('on ties keeps the items sent first (the most recent)', () => {
    const items = many('top', 200).concat(many('bottom', 100));
    const kept = prefilterCloset(items, 'x').items.filter((item) => item.category === 'bottom');
    expect(kept[0].id).toBe('bottom-0');
  });
});

describe('prefilter keeps what a look needs', () => {
  it('always keeps a pair of shoes when the closet sent has one, even among 299 matching tops and bottoms', () => {
    const items = [
      ...many('top', 150, () => ({ name: 'Summer tee', seasons: ['summer'] })),
      ...many('bottom', 149, () => ({ name: 'Summer shorts', seasons: ['summer'] })),
      summary('only-shoes', 'shoes', { seasons: ['winter'] }),
    ];
    const result = prefilterCloset(items, 'summer tee and shorts');
    expect(result.items.map((item) => item.id)).toContain('only-shoes');
  });

  it('keeps a lone dress, and a lone bottom with many tops, so a closet that can form a look still can', () => {
    const dress = [...many('top', 299), summary('the-dress', 'dress')];
    expect(prefilterCloset(dress, 'x').items.map((i) => i.id)).toContain('the-dress');
    const pair = [...many('top', 200), ...many('accessory', 99), summary('the-bottom', 'bottom')];
    const kept = prefilterCloset(pair, 'x').items;
    expect(kept.map((i) => i.id)).toContain('the-bottom');
    expect(missingForOutfit(kept)).toEqual([]);
  });

  it('keeps at least one item of every category the closet has', () => {
    const items = [...many('top', 290), summary('o', 'outerwear'), summary('a', 'accessory'), ...many('bottom', 8)];
    const kept = new Set(prefilterCloset(items, 'x').items.map((i) => i.category));
    expect([...kept].sort()).toEqual(['accessory', 'bottom', 'outerwear', 'top']);
  });

  it('works with a smaller limit', () => {
    const items = TAG_CATEGORIES.flatMap((category) => many(category, 10));
    const result = prefilterCloset(items, 'x', undefined, 12);
    expect(result.items).toHaveLength(12);
    expect(new Set(result.items.map((i) => i.category)).size).toBe(6);
  });
});

describe('prefilter scoring', () => {
  it('reads words, seasons and formality from the request', () => {
    expect(wordsOf('Emo vibes, black-tie!')).toEqual(expect.arrayContaining(['emo', 'vibes', 'black-tie', 'black', 'tie']));
    const hints = requestHints('Job interview in winter');
    expect([...hints.seasons]).toEqual(['winter']);
    expect([...hints.formalities]).toContain('formal');
    expect(hints.words.has('the')).toBe(false);
  });

  it('reads seasons from the weather', () => {
    const hot = { highC: 30, lowC: 20, rainChance: 0, windKph: 5, conditions: 'clear' as const };
    const cold = { highC: 3, lowC: -4, rainChance: 0, windKph: 5, conditions: 'snow' as const };
    expect([...requestHints('', hot).seasons]).toEqual(['summer']);
    expect([...requestHints('', cold).seasons]).toEqual(['winter']);
  });

  it('scores name, type, tag and color matches up, and other seasons down', () => {
    const hints = requestHints('emo vibes for winter');
    const emo = summary('a', 'top', { tags: ['emo'], seasons: ['winter'] });
    const plain = summary('b', 'top', { seasons: ['winter'] });
    const summer = summary('c', 'top', { seasons: ['summer'] });
    const unknown = summary('d', 'top', { seasons: [] });
    expect(scoreItem(emo, hints)).toBeGreaterThan(scoreItem(plain, hints));
    expect(scoreItem(plain, hints)).toBeGreaterThan(scoreItem(unknown, hints));
    expect(scoreItem(unknown, hints)).toBeGreaterThan(scoreItem(summer, hints));
    expect(scoreItem(summary('e', 'top', { colors: ['black'] }), requestHints('all black'))).toBeGreaterThan(
      scoreItem(summary('f', 'top', { colors: ['white'] }), requestHints('all black')),
    );
  });

  it('prefers matching items when trimming', () => {
    const items = [
      ...many('top', 100, () => ({ seasons: ['summer'] })),
      ...many('top', 20, (n) => ({ id: `band-${n}`, name: 'Band tee', tags: ['emo'], seasons: ['winter'] })),
      ...many('bottom', 100),
      ...many('shoes', 50),
    ].map((item, index) => ({ ...item, id: `${item.id}-${index}` }));
    const kept = prefilterCloset(items, 'emo band tee for winter').items;
    expect(kept.filter((item) => item.name === 'Band tee')).toHaveLength(20);
  });

  it('is fast on 300 items', () => {
    const items = TAG_CATEGORIES.flatMap((category) => many(category, 50, (n) => ({ name: `Item ${n} with a long name`, tags: ['a', 'b', 'c'] })));
    const started = Date.now();
    for (let i = 0; i < 20; i++) prefilterCloset(items, 'something cosy for an autumn dinner date');
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
