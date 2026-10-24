import { joinPath, readText, REPO_ROOT } from '@/security/testing/node-files';

import {
  canFormOutfit,
  GENERATE_OUTFITS_ERROR_CODES,
  GENERATE_OUTFITS_MAX_BODY_BYTES,
  MAX_OUTFITS,
  missingForOutfit,
  OUTFIT_MAX_ACCESSORIES,
  OUTFIT_MAX_ITEMS,
  OUTFIT_MAX_PIECES,
  OUTFIT_MODES,
  OUTFIT_RATIONALE_MAX_LENGTH,
  OUTFIT_REQUEST_MAX_LENGTH,
  readGenerateOutfitsError,
  readGenerateOutfitsUsage,
  stubOutfits,
  SUMMARY_ID_MAX_LENGTH,
  SUMMARY_MAX_COLORS,
  SUMMARY_MAX_TAGS,
  SUMMARY_NAME_MAX_LENGTH,
  SUMMARY_TAG_MAX_LENGTH,
  SUMMARY_TYPE_MAX_LENGTH,
  validateClosetItemSummary,
  validateGenerateOutfitsRequest,
  validateGenerateOutfitsResponse,
  WEATHER_CONDITIONS_MAX_LENGTH,
  type ClosetItemSummary,
  type WeatherSummary,
} from './generate-outfits-contract';
import { TAG_ITEM_ERROR_CODES } from './tag-item-contract';
import { sampleSummaries, summary } from './testing/outfit-fixtures';
import { ITEM_NAME_MAX_LENGTH } from '@/core/item-name';
import { ITEM_TYPE_MAX_LENGTH } from '@/core/item-attributes';
import { MAX_TAGS_PER_ITEM, TAG_MAX_LENGTH } from '@/core/tags';
import { MAX_ITEM_COLORS } from '@/core/color-selection';

const DOC = 'docs/api/generate-outfits.md';
const WEATHER: WeatherSummary = { highC: 18, lowC: 9, rainChance: 60, windKph: 20, conditions: 'Light rain' };

describe('generate-outfits contract drift', () => {
  it('the app copy is byte-identical to supabase/functions/_shared/generate-outfits-contract.ts', () => {
    const canonical = readText(joinPath(REPO_ROOT, 'supabase/functions/_shared/generate-outfits-contract.ts'));
    const copy = readText(joinPath(REPO_ROOT, 'spotlight/src/ai/generate-outfits-contract.ts'));
    // If this fails: edit the supabase file, then copy it over the app file.
    expect(copy).toBe(canonical);
  });

  it('caps summaries at the app\'s own item limits', () => {
    expect(SUMMARY_NAME_MAX_LENGTH).toBe(ITEM_NAME_MAX_LENGTH);
    expect(SUMMARY_TYPE_MAX_LENGTH).toBe(ITEM_TYPE_MAX_LENGTH);
    expect(SUMMARY_TAG_MAX_LENGTH).toBe(TAG_MAX_LENGTH);
    expect(SUMMARY_MAX_TAGS).toBe(MAX_TAGS_PER_ITEM);
    expect(SUMMARY_MAX_COLORS).toBe(MAX_ITEM_COLORS);
  });

  it('keeps every tag-item error code and adds not_enough_items', () => {
    expect([...GENERATE_OUTFITS_ERROR_CODES]).toEqual([...TAG_ITEM_ERROR_CODES, 'not_enough_items']);
  });

  it('documents every error code, mode and summary field in the API doc', () => {
    const doc = readText(joinPath(REPO_ROOT, DOC));
    for (const code of GENERATE_OUTFITS_ERROR_CODES) expect(doc).toContain(`\`${code}\``);
    for (const mode of OUTFIT_MODES) expect(doc).toContain(`\`${mode}\``);
    for (const field of ['id', 'category', 'colors', 'seasons', 'name', 'type', 'pattern', 'material', 'fit', 'formality', 'tags']) {
      expect(doc).toContain(`\`items[].${field}\``);
    }
    for (const field of ['highC', 'lowC', 'rainChance', 'windKph', 'conditions']) expect(doc).toContain(`\`weather.${field}\``);
    for (const field of ['outfits[].itemIds', 'outfits[].rationale', 'stub', 'usage', 'error.missing']) expect(doc).toContain(`\`${field}\``);
  });

  it('documents the limits in the API doc', () => {
    const doc = readText(joinPath(REPO_ROOT, DOC)).replace(/[,_ ]/g, '');
    expect(doc).toContain(String(GENERATE_OUTFITS_MAX_BODY_BYTES));
    const words = readText(joinPath(REPO_ROOT, DOC));
    expect(words).toContain(`1 to ${OUTFIT_REQUEST_MAX_LENGTH} characters`);
    expect(words).toContain(`1 to ${OUTFIT_MAX_ITEMS} summaries`);
    expect(words).toContain(`1 to ${SUMMARY_ID_MAX_LENGTH} characters`);
    expect(words).toContain(`1 to ${SUMMARY_NAME_MAX_LENGTH} characters`);
    expect(words).toContain(`1 to ${SUMMARY_TYPE_MAX_LENGTH} characters`);
    expect(words).toContain(`at most ${SUMMARY_MAX_TAGS} tags of 1 to ${SUMMARY_TAG_MAX_LENGTH} characters`);
    expect(words).toContain(`1 to ${OUTFIT_RATIONALE_MAX_LENGTH} characters`);
    expect(words).toContain(`1 to ${WEATHER_CONDITIONS_MAX_LENGTH} characters`);
    expect(words).toContain(`0 to ${MAX_OUTFITS} outfits`);
    expect(words).toContain(`0 to ${OUTFIT_MAX_ACCESSORIES} accessories`);
    expect(words).toContain(`at most ${OUTFIT_MAX_PIECES} ids`);
  });
});

/** The largest request the app can send: 300 summaries at every cap, 4-byte characters everywhere text is free. */
function worstCaseRequest() {
  const wide = (n: number) => '\u{1F600}'.repeat(n);
  const items = Array.from({ length: OUTFIT_MAX_ITEMS }, (_, i) =>
    summary(`${String(i).padStart(4, '0')}${'x'.repeat(SUMMARY_ID_MAX_LENGTH - 4)}`, 'accessory', {
      colors: ['light-grey', 'forest-green', 'denim-blue'],
      seasons: ['spring', 'summer', 'autumn', 'winter'],
      name: wide(SUMMARY_NAME_MAX_LENGTH),
      type: wide(SUMMARY_TYPE_MAX_LENGTH),
      pattern: 'polka-dot',
      material: 'synthetic',
      fit: 'oversized',
      formality: 'smart-casual',
      tags: Array.from({ length: SUMMARY_MAX_TAGS }, (_, t) => `${t}${wide(SUMMARY_TAG_MAX_LENGTH - 1)}`),
    }),
  );
  return {
    request: wide(OUTFIT_REQUEST_MAX_LENGTH),
    items,
    mode: 'weather',
    weather: { ...WEATHER, highC: -12.345678, lowC: -45.678912, conditions: wide(WEATHER_CONDITIONS_MAX_LENGTH) },
  };
}

describe('validateGenerateOutfitsRequest', () => {
  const items = sampleSummaries();

  it('accepts a request, normalizes its text and fills in mode', () => {
    const result = validateGenerateOutfitsRequest({ request: '  emo \n vibes ', items });
    expect(result).toEqual({ ok: true, value: { request: 'emo vibes', items, mode: 'request' } });
  });

  it('a worst-case request is valid and fits the body limit', () => {
    const body = worstCaseRequest();
    expect(validateGenerateOutfitsRequest(body).ok).toBe(true);
    const bytes = new TextEncoder().encode(JSON.stringify(body)).length;
    expect(bytes).toBeLessThanOrEqual(GENERATE_OUTFITS_MAX_BODY_BYTES);
    // And the limit is not wildly loose.
    expect(bytes).toBeGreaterThan(GENERATE_OUTFITS_MAX_BODY_BYTES * 0.8);
  });

  it('accepts emoji-only text and exactly 200 characters (code points)', () => {
    expect(validateGenerateOutfitsRequest({ request: '\u{1F5A4}\u{1F3B8}', items }).ok).toBe(true);
    expect(validateGenerateOutfitsRequest({ request: '\u{1F600}'.repeat(200), items }).ok).toBe(true);
  });

  it('accepts weather and random requests with empty text, and weather in any mode', () => {
    expect(validateGenerateOutfitsRequest({ request: '', items, mode: 'random' })).toEqual({
      ok: true,
      value: { request: '', items, mode: 'random' },
    });
    expect(validateGenerateOutfitsRequest({ request: '  ', items, mode: 'weather', weather: WEATHER })).toEqual({
      ok: true,
      value: { request: '', items, mode: 'weather', weather: WEATHER },
    });
    expect(validateGenerateOutfitsRequest({ request: 'rainy day', items, weather: WEATHER }).ok).toBe(true);
  });

  it('ignores extra fields and treats a null weather as absent', () => {
    expect(validateGenerateOutfitsRequest({ request: 'x', items, extra: true, weather: null })).toEqual({
      ok: true,
      value: { request: 'x', items, mode: 'request' },
    });
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['an array', [items]],
    ['no request', { items }],
    ['a number request', { request: 5, items }],
    ['an empty request', { request: '', items }],
    ['a request of only spaces', { request: ' \n\t ', items }],
    ['a request of 201 characters', { request: 'x'.repeat(201), items }],
    ['a control character in the request', { request: 'a\u0000b', items }],
    ['an unknown mode', { request: 'x', items, mode: 'surprise' }],
    ['weather mode without weather', { request: '', items, mode: 'weather' }],
    ['a random request over 200 characters', { request: 'x'.repeat(201), items, mode: 'random' }],
    ['no items', { request: 'x' }],
    ['an empty closet', { request: 'x', items: [] }],
    ['301 items', { request: 'x', items: Array.from({ length: 301 }, (_, i) => summary(`i${i}`, 'top')) }],
    ['a duplicate id', { request: 'x', items: [summary('a', 'top'), summary('a', 'bottom')] }],
    ['a bad item', { request: 'x', items: [summary('a', 'top'), { id: 'b' }] }],
    ['bad weather', { request: 'x', items, weather: { ...WEATHER, rainChance: 101 } }],
  ])('rejects %s', (_name, body) => {
    expect(validateGenerateOutfitsRequest(body).ok).toBe(false);
  });

  it('says which item is bad', () => {
    const result = validateGenerateOutfitsRequest({ request: 'x', items: [summary('a', 'top'), summary('b', 'hat' as never)] });
    expect(result).toEqual({ ok: false, reason: 'items[1]: unknown category.' });
  });

  it('accepts exactly 300 items', () => {
    const many = Array.from({ length: 300 }, (_, i) => summary(`i${i}`, i % 2 ? 'top' : 'bottom'));
    expect(validateGenerateOutfitsRequest({ request: 'x', items: many }).ok).toBe(true);
  });
});

describe('validateClosetItemSummary', () => {
  const full: ClosetItemSummary = {
    id: 'mf3k2-abc123xyz789',
    category: 'top',
    colors: ['navy', 'white'],
    seasons: ['spring', 'autumn'],
    name: 'Striped shirt',
    type: 'Oxford shirt',
    pattern: 'striped',
    material: 'cotton',
    fit: 'regular',
    formality: 'smart-casual',
    tags: ['work', '90s'],
  };

  it('accepts a full summary unchanged and a minimal one', () => {
    expect(validateClosetItemSummary(full)).toEqual({ ok: true, value: full });
    expect(validateClosetItemSummary(summary('a', 'shoes', { colors: [], seasons: [] })).ok).toBe(true);
  });

  it('normalizes text, lowercases and deduplicates tags, drops empty tags lists and null fields', () => {
    const result = validateClosetItemSummary({
      ...summary('a', 'top'),
      name: '  Band \n hoodie ',
      type: null,
      pattern: null,
      tags: ['Emo', 'emo ', ' EMO'],
      extra: 'ignored',
    });
    expect(result).toEqual({ ok: true, value: { ...summary('a', 'top'), name: 'Band hoodie', tags: ['emo'] } });
    expect(validateClosetItemSummary({ ...summary('a', 'top'), tags: [] })).toEqual({ ok: true, value: summary('a', 'top') });
  });

  it('accepts text at the caps, counted in code points', () => {
    const atCaps = { ...full, name: '\u{1F600}'.repeat(60), type: 'é'.repeat(30), tags: Array.from({ length: 10 }, (_, i) => `${i}`.padEnd(30, 'x')) };
    expect(validateClosetItemSummary(atCaps).ok).toBe(true);
  });

  it.each<[string, Partial<Record<keyof ClosetItemSummary, unknown>>]>([
    ['an empty id', { id: '' }],
    ['an id with a space', { id: 'a b' }],
    ['an id with a slash', { id: 'a/b' }],
    ['a 65-character id', { id: 'x'.repeat(65) }],
    ['a number id', { id: 7 }],
    ['an unknown category', { category: 'hat' }],
    ['an unknown color', { colors: ['chartreuse'] }],
    ['four colors', { colors: ['navy', 'white', 'red', 'black'] }],
    ['a repeated color', { colors: ['navy', 'navy'] }],
    ['colors missing', { colors: undefined }],
    ['an unknown season', { seasons: ['monsoon'] }],
    ['a repeated season', { seasons: ['spring', 'spring'] }],
    ['an empty name', { name: '   ' }],
    ['a 61-character name', { name: 'x'.repeat(61) }],
    ['a control character in a name', { name: 'a\u0007b' }],
    ['a number name', { name: 3 }],
    ['a 31-character type', { type: 'x'.repeat(31) }],
    ['an unknown pattern', { pattern: 'paisley' }],
    ['an unknown material', { material: 'velvet' }],
    ['an unknown fit', { fit: 'baggy' }],
    ['an unknown formality', { formality: 'black-tie' }],
    ['eleven tags', { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }],
    ['a 31-character tag', { tags: ['x'.repeat(31)] }],
    ['an empty tag', { tags: [' '] }],
    ['tags not a list', { tags: 'emo' }],
  ])('rejects %s', (_name, change) => {
    expect(validateClosetItemSummary({ ...full, ...change }).ok).toBe(false);
  });
});

describe('weather', () => {
  it.each<[string, Partial<Record<keyof WeatherSummary, unknown>>]>([
    ['a low above the high', { lowC: 20, highC: 10 }],
    ['an absurd temperature', { highC: 71 }],
    ['a string temperature', { lowC: '9' }],
    ['NaN', { highC: Number.NaN }],
    ['a negative rain chance', { rainChance: -1 }],
    ['negative wind', { windKph: -1 }],
    ['empty conditions', { conditions: '' }],
    ['41-character conditions', { conditions: 'x'.repeat(41) }],
  ])('rejects %s', (_name, change) => {
    expect(validateGenerateOutfitsRequest({ request: 'x', items: sampleSummaries(), weather: { ...WEATHER, ...change } }).ok).toBe(false);
  });
});

describe('missingForOutfit / canFormOutfit', () => {
  it.each<[string, string[], string[]]>([
    ['an empty closet', [], ['top', 'bottom', 'dress']],
    ['only tops', ['top', 'top'], ['bottom', 'dress']],
    ['only bottoms and shoes', ['bottom', 'shoes'], ['top', 'dress']],
    ['shoes, outerwear and accessories', ['shoes', 'outerwear', 'accessory'], ['top', 'bottom', 'dress']],
    ['a top and a bottom', ['top', 'bottom'], []],
    ['one dress', ['dress'], []],
    ['a dress and a top', ['dress', 'top'], []],
  ])('%s', (_name, categories, missing) => {
    const items = categories.map((category) => ({ category }));
    expect(missingForOutfit(items)).toEqual(missing);
    expect(canFormOutfit(items)).toBe(missing.length === 0);
  });
});

describe('stubOutfits', () => {
  it('picks up to 3 top-and-bottom looks first, rotating shoes', () => {
    expect(stubOutfits(sampleSummaries())).toEqual([
      { itemIds: ['top-1', 'bottom-1', 'shoes-1'], rationale: 'Stub look 1: top + bottom + shoes.' },
      { itemIds: ['top-1', 'bottom-2', 'shoes-2'], rationale: 'Stub look 2: top + bottom + shoes.' },
      { itemIds: ['top-2', 'bottom-1', 'shoes-1'], rationale: 'Stub look 3: top + bottom + shoes.' },
    ]);
  });

  it('falls back to dresses, and leaves shoes out when the closet has none', () => {
    const items = [summary('t', 'top'), summary('b', 'bottom'), summary('d1', 'dress'), summary('d2', 'dress'), summary('c', 'outerwear')];
    expect(stubOutfits(items)).toEqual([
      { itemIds: ['t', 'b'], rationale: 'Stub look 1: top + bottom.' },
      { itemIds: ['d1'], rationale: 'Stub look 2: dress.' },
      { itemIds: ['d2'], rationale: 'Stub look 3: dress.' },
    ]);
  });

  it('gives fewer looks for a small closet and none when no look is possible', () => {
    expect(stubOutfits([summary('t', 'top'), summary('b', 'bottom')])).toHaveLength(1);
    expect(stubOutfits([summary('t', 'top'), summary('s', 'shoes')])).toEqual([]);
  });

  it('never puts user text in the rationale', () => {
    const items = [summary('t', 'top', { name: 'Secret name' }), summary('b', 'bottom', { tags: ['private'] })];
    expect(JSON.stringify(stubOutfits(items))).not.toMatch(/Secret|private/);
  });

  it('is fast on a 300-item closet', () => {
    const many = Array.from({ length: 300 }, (_, i) => summary(`i${i}`, i < 150 ? 'top' : 'bottom'));
    expect(stubOutfits(many)).toHaveLength(3);
  });
});

describe('validateGenerateOutfitsResponse', () => {
  const valid = () => ({
    apiVersion: 1,
    stub: true,
    outfits: [{ itemIds: ['top-1', 'bottom-1'], rationale: 'Works.' }],
  });

  it('accepts a valid body, normalizes rationale and drops usage and unknown fields', () => {
    const body = { ...valid(), usage: { model: 'm', attempts: 1, inputTokens: 1, outputTokens: 1 }, extra: 1 };
    body.outfits[0].rationale = '  Works. ';
    expect(validateGenerateOutfitsResponse(body)).toEqual({ ok: true, value: valid() });
  });

  it('accepts no outfits', () => {
    expect(validateGenerateOutfitsResponse({ apiVersion: 1, stub: false, outfits: [] }).ok).toBe(true);
  });

  it.each<[string, (body: ReturnType<typeof valid>) => unknown]>([
    ['not an object', () => 'ok'],
    ['another API version', (b) => ({ ...b, apiVersion: 2 })],
    ['no stub flag', (b) => ({ ...b, stub: undefined })],
    ['outfits not a list', (b) => ({ ...b, outfits: {} })],
    ['four outfits', (b) => ({ ...b, outfits: [b.outfits[0], b.outfits[0], b.outfits[0], b.outfits[0]] })],
    ['an outfit without ids', (b) => ({ ...b, outfits: [{ itemIds: [], rationale: 'x' }] })],
    ['a non-string id', (b) => ({ ...b, outfits: [{ itemIds: [1], rationale: 'x' }] })],
    ['a repeated id', (b) => ({ ...b, outfits: [{ itemIds: ['a', 'a'], rationale: 'x' }] })],
    ['too many ids', (b) => ({ ...b, outfits: [{ itemIds: Array.from({ length: 10 }, (_, i) => `i${i}`), rationale: 'x' }] })],
    ['an empty rationale', (b) => ({ ...b, outfits: [{ itemIds: ['a'], rationale: ' ' }] })],
    ['a 301-character rationale', (b) => ({ ...b, outfits: [{ itemIds: ['a'], rationale: 'x'.repeat(301) }] })],
    ['a missing rationale', (b) => ({ ...b, outfits: [{ itemIds: ['a'] }] })],
  ])('rejects %s', (_name, mutate) => {
    expect(validateGenerateOutfitsResponse(mutate(valid())).ok).toBe(false);
  });
});

describe('error and usage readers', () => {
  it('reads not_enough_items with its missing pieces, in a fixed order, ignoring junk', () => {
    expect(readGenerateOutfitsError({ error: { code: 'not_enough_items', message: 'x', missing: ['dress', 'hat', 'bottom'] } })).toEqual({
      code: 'not_enough_items',
      missing: ['bottom', 'dress'],
    });
    expect(readGenerateOutfitsError({ error: { code: 'not_enough_items' } })).toEqual({ code: 'not_enough_items', missing: [] });
  });

  it('reads other codes without missing, and unknown bodies as null', () => {
    expect(readGenerateOutfitsError({ error: { code: 'unauthorized', missing: ['top'] } })).toEqual({ code: 'unauthorized', missing: [] });
    expect(readGenerateOutfitsError({ error: { code: 'nope' } })).toBeNull();
    expect(readGenerateOutfitsError(null)).toBeNull();
  });

  it('reads usage like tag-item', () => {
    const usage = { model: 'claude-haiku-5-5', attempts: 1, inputTokens: 10, outputTokens: 5 };
    expect(readGenerateOutfitsUsage({ usage })).toEqual(usage);
    expect(readGenerateOutfitsUsage({})).toBeNull();
  });
});
