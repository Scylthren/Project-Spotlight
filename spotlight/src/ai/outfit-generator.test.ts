import { OUTFIT_MAX_AVOID, OUTFIT_RATIONALE_MAX_LENGTH, validateGenerateOutfitsRequest } from './generate-outfits-contract';
import { FakeOutfitGenerator, mockDemoRationale, MockOutfitGenerator, prepareOutfitRequest, type OutfitOutcome } from './outfit-generator';
import { closetItem } from './testing/outfit-fixtures';
import { indexCloset, validateOutfits } from '../../../supabase/functions/generate-outfits/outfit-rules.ts';
import { toClosetSummaries } from './closet-summary';

const closet = [closetItem('t', 'top'), closetItem('b', 'bottom'), closetItem('s', 'shoes'), closetItem('d', 'dress')];

describe('MockOutfitGenerator', () => {
  it('answers the stub\'s looks for the closet, marked stub', async () => {
    const outcome = await new MockOutfitGenerator().generate({ request: 'for summer', items: closet });
    expect(outcome).toEqual({
      ok: true,
      stub: true,
      droppedOutfits: 0,
      omittedItems: 0,
      outfits: [
        { itemIds: ['t', 'b', 's'], rationale: 'Stub look 1: top + bottom + shoes.' },
        { itemIds: ['d', 's'], rationale: 'Stub look 2: dress + shoes.' },
      ],
    });
  });

  it.each([
    ['an empty closet', [], ['top', 'bottom', 'dress']],
    ['only tops', [closetItem('t', 'top'), closetItem('t2', 'top')], ['bottom', 'dress']],
  ])('says what is missing for %s', async (_name, items, missing) => {
    expect(await new MockOutfitGenerator().generate({ request: 'x', items })).toEqual({ ok: false, failure: 'not-enough-items', missing });
  });

  it.each([
    ['empty text', ''],
    ['only spaces', '   '],
    ['201 characters', 'x'.repeat(201)],
    ['a control character', 'a\u0000b'],
  ])('rejects a request with %s, like the remote generator', async (_name, request) => {
    expect(await new MockOutfitGenerator().generate({ request, items: closet })).toEqual({ ok: false, failure: 'rejected' });
  });

  it('accepts empty text for random and weather requests', async () => {
    const weather = { highC: 20, lowC: 10, rainChance: 0, windKph: 5, conditions: 'Sunny' };
    expect((await new MockOutfitGenerator().generate({ request: '', mode: 'random', items: closet })).ok).toBe(true);
    expect((await new MockOutfitGenerator().generate({ request: '', mode: 'weather', weather, items: closet })).ok).toBe(true);
    expect(await new MockOutfitGenerator().generate({ request: '', mode: 'weather', items: closet })).toEqual({ ok: false, failure: 'rejected' });
  });

  it('resolves cancelled when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await new MockOutfitGenerator().generate({ request: 'x', items: closet }, { signal: controller.signal })).toEqual({
      ok: false,
      failure: 'cancelled',
    });
  });
});

describe('prepareOutfitRequest with avoid', () => {
  it('sends only sets whose every id is sent, deduplicated, the first 9 in the order given', () => {
    const many = Array.from({ length: OUTFIT_MAX_AVOID + 2 }, (_, i) => (i % 2 ? ['t', 'b', 's'] : ['d', 's']));
    const avoid = [['gone', 't'], ...many, ['t', 't', 'b']];
    const prepared = prepareOutfitRequest({ request: 'x', items: closet, avoid });
    if (!prepared.ok) throw new Error('expected ok');
    expect(prepared.request.avoid).toHaveLength(OUTFIT_MAX_AVOID);
    expect(prepared.request.avoid).toEqual(many.slice(0, OUTFIT_MAX_AVOID));
    expect(prepared.request.avoid).not.toContainEqual(['gone', 't']);
    const deduped = prepareOutfitRequest({ request: 'x', items: closet, avoid: [['t', 't', 'b']] });
    expect(deduped.ok && deduped.request.avoid).toEqual([['t', 'b']]);
    expect(validateGenerateOutfitsRequest(prepared.request).ok).toBe(true);
  });

  it('leaves avoid out when nothing usable is left', () => {
    const prepared = prepareOutfitRequest({ request: 'x', items: closet, avoid: [['gone']] });
    expect(prepared.ok && 'avoid' in prepared.request).toBe(false);
  });
});

describe('MockOutfitGenerator with avoid', () => {
  it('answers the next stub looks, and none when all are avoided', async () => {
    const mock = new MockOutfitGenerator();
    const first = await mock.generate({ request: 'x', items: closet, avoid: [['t', 'b', 's']] });
    expect(first.ok && first.outfits.map((o) => o.itemIds)).toEqual([['d', 's']]);
    const none = await mock.generate({ request: 'x', items: closet, avoid: [['t', 'b', 's'], ['d', 's']] });
    expect(none).toMatchObject({ ok: true, outfits: [] });
  });
});

describe('MockOutfitGenerator demo mode', () => {
  const demoCloset = [
    closetItem('t', 'top'),
    closetItem('b', 'bottom'),
    closetItem('d', 'dress'),
    closetItem('s', 'shoes'),
    closetItem('c', 'outerwear'),
    closetItem('a1', 'accessory'),
    closetItem('a2', 'accessory'),
  ];

  it('adds outerwear and the next accessory in turn, keeping category order and the rules', async () => {
    const outcome = await new MockOutfitGenerator({ demo: true }).generate({ request: 'x', items: demoCloset });
    if (!outcome.ok) throw new Error('expected ok');
    expect(outcome.outfits.map((o) => o.itemIds)).toEqual([
      ['t', 'b', 'c', 's', 'a1'],
      ['d', 'c', 's', 'a2'],
    ]);
    const summaries = toClosetSummaries(demoCloset).items;
    expect(validateOutfits(outcome.outfits, indexCloset(summaries)).rejected).toEqual([]);
    for (const outfit of outcome.outfits) expect([...outfit.rationale].length).toBeLessThanOrEqual(OUTFIT_RATIONALE_MAX_LENGTH);
  });

  it('puts outerwear last when the closet has no shoes', async () => {
    const outcome = await new MockOutfitGenerator({ demo: true }).generate({
      request: 'x',
      items: [closetItem('t', 'top'), closetItem('b', 'bottom'), closetItem('c', 'outerwear')],
    });
    expect(outcome.ok && outcome.outfits[0].itemIds).toEqual(['t', 'b', 'c']);
  });

  it('honours avoid sets that include its extras (Restyle of a demo look)', async () => {
    const mock = new MockOutfitGenerator({ demo: true });
    const outcome = await mock.generate({ request: 'x', items: demoCloset, avoid: [['t', 'b', 'c', 's', 'a1']] });
    expect(outcome.ok && outcome.outfits.map((o) => o.itemIds)).toEqual([['d', 'c', 's', 'a1']]);
  });

  it('never puts user text in the rationale', () => {
    expect(mockDemoRationale(['top', 'bottom'])).toMatch(/^A placeholder look \(top \+ bottom\)/);
  });

  it('waits delayMs, and an abort during the wait resolves cancelled', async () => {
    jest.useFakeTimers();
    try {
      const mock = new MockOutfitGenerator({ delayMs: 1000 });
      const controller = new AbortController();
      const pending = mock.generate({ request: 'x', items: closet }, { signal: controller.signal });
      await jest.advanceTimersByTimeAsync(500);
      controller.abort();
      expect(await pending).toEqual({ ok: false, failure: 'cancelled' });

      const late = mock.generate({ request: 'x', items: closet });
      let settled = false;
      void late.then(() => (settled = true));
      await jest.advanceTimersByTimeAsync(999);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect((await late).ok).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('FakeOutfitGenerator', () => {
  it('answers queued outcomes in order, then the fallback, and records inputs', async () => {
    const fake = new FakeOutfitGenerator();
    const first: OutfitOutcome = { ok: true, outfits: [], stub: false, droppedOutfits: 0, omittedItems: 0 };
    fake.queue.push(first, async (input) => ({ ok: false, failure: input.request === 'x' ? 'timeout' : 'server' }));
    const input = { request: 'x', items: closet };
    expect(await fake.generate(input)).toBe(first);
    expect(await fake.generate(input)).toEqual({ ok: false, failure: 'timeout' });
    expect(await fake.generate(input)).toEqual({ ok: false, failure: 'offline' });
    expect(fake.inputs).toHaveLength(3);
    expect(fake.inputs[0].input).toBe(input);
  });
});
