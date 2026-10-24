import { FakeOutfitGenerator, MockOutfitGenerator, type OutfitOutcome } from './outfit-generator';
import { closetItem } from './testing/outfit-fixtures';

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
