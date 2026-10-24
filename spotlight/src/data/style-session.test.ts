import { FakeOutfitGenerator, type OutfitGenerateOptions, type OutfitOutcome, type OutfitRequestInput } from '@/ai/outfit-generator';
import { closetItem } from '@/ai/testing/outfit-fixtures';
import type { ClothingItem } from '@/core';

import { NO_OTHER_LOOKS_TEXT, restyleFailureText } from './style-messages';
import { StyleSession, StyleSessions, type StyleSnapshot, type StyleStatus } from './style-session';

const CLOSET = [
  closetItem('top-1', 'top', { name: 'Band hoodie' }),
  closetItem('top-2', 'top'),
  closetItem('bottom-1', 'bottom'),
  closetItem('bottom-2', 'bottom'),
  closetItem('dress-1', 'dress'),
  closetItem('shoes-1', 'shoes'),
  closetItem('bag-1', 'accessory'),
];

const LOOK_A = { itemIds: ['top-1', 'bottom-1', 'shoes-1'], rationale: 'A works.' };
const LOOK_B = { itemIds: ['top-2', 'bottom-2', 'shoes-1'], rationale: 'B works.' };
const LOOK_C = { itemIds: ['dress-1', 'shoes-1', 'bag-1'], rationale: 'C works.' };
const LOOK_D = { itemIds: ['top-1', 'bottom-2', 'shoes-1'], rationale: 'D works.' };
const LOOK_E = { itemIds: ['top-2', 'bottom-1', 'shoes-1'], rationale: 'E works.' };

function looks(...outfits: { itemIds: string[]; rationale: string }[]): OutfitOutcome {
  return { ok: true, outfits, stub: false, droppedOutfits: 0, omittedItems: 0 };
}

/** A reply the test settles by hand; it also resolves `cancelled` when the signal aborts, like the real generators. */
function deferred() {
  let resolve!: (outcome: OutfitOutcome) => void;
  let options: OutfitGenerateOptions = {};
  let input: OutfitRequestInput | null = null;
  const step = (i: OutfitRequestInput, o: OutfitGenerateOptions) => {
    input = i;
    options = o;
    return new Promise<OutfitOutcome>((r) => {
      resolve = r;
      o.signal?.addEventListener('abort', () => r({ ok: false, failure: 'cancelled' }));
    });
  };
  return {
    step,
    resolve: (outcome: OutfitOutcome) => resolve(outcome),
    get signal() {
      return options.signal;
    },
    get input() {
      return input;
    },
  };
}

/** Lets pending promise callbacks run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(closet: ClothingItem[] = CLOSET) {
  const generator = new FakeOutfitGenerator();
  const state = { closet: [...closet], failLoad: false };
  const loadCloset = jest.fn(async () => {
    if (state.failLoad) throw new Error('disk');
    return [...state.closet];
  });
  const session = new StyleSession('emo vibes', { generator, loadCloset });
  const seen: StyleSnapshot[] = [];
  session.subscribe(() => seen.push(session.getSnapshot()));
  return { generator, state, loadCloset, session, seen };
}

function status(session: StyleSession): StyleStatus {
  return session.getSnapshot().status;
}

function ready(session: StyleSession) {
  const s = status(session);
  if (s.kind !== 'ready') throw new Error(`expected ready, got ${s.kind}`);
  return s;
}

describe('StyleSession: the request', () => {
  it('starts idle with the request text', () => {
    const { session } = setup();
    expect(session.getSnapshot()).toEqual({ request: 'emo vibes', status: { kind: 'idle' }, closed: false });
  });

  it('goes loading at once, then ready with the looks and their pieces from the closet', async () => {
    const { session, generator, seen } = setup();
    generator.queue.push({ ok: true, outfits: [LOOK_A, LOOK_B, LOOK_C], stub: false, droppedOutfits: 0, omittedItems: 4 });
    const done = session.start();
    expect(status(session)).toEqual({ kind: 'loading' });
    await done;
    const s = ready(session);
    expect(s.omittedItems).toBe(4);
    expect(s.looks.map((l) => l.itemIds)).toEqual([LOOK_A.itemIds, LOOK_B.itemIds, LOOK_C.itemIds]);
    expect(s.looks[0].rationale).toBe('A works.');
    expect(s.looks[0].pieces[0]).toEqual({ id: 'top-1', category: 'top', item: CLOSET[0] });
    expect(s.looks.every((l) => !l.restyling && l.restyleNotice === null)).toBe(true);
    expect(new Set(s.looks.map((l) => l.key)).size).toBe(3);
    expect(seen.map((x) => x.status.kind)).toEqual(['loading', 'ready']);
  });

  it('keeps the model behind each look ("stub" for canned picks, null when unknown) for saving', async () => {
    const real = setup();
    real.generator.queue.push({ ok: true, outfits: [LOOK_A], stub: false, droppedOutfits: 0, omittedItems: 0, model: 'claude-haiku-5-5' });
    await real.session.start();
    expect(ready(real.session).looks[0].model).toBe('claude-haiku-5-5');

    const stub = setup();
    stub.generator.queue.push({ ok: true, outfits: [LOOK_A], stub: true, droppedOutfits: 0, omittedItems: 0 });
    await stub.session.start();
    expect(ready(stub.session).looks[0].model).toBe('stub');

    const unknown = setup();
    unknown.generator.queue.push(looks(LOOK_A));
    await unknown.session.start();
    expect(ready(unknown.session).looks[0].model).toBeNull();
  });

  it('sends the request text and the closet, with no avoid', async () => {
    const { session, generator } = setup();
    generator.queue.push(looks(LOOK_A));
    await session.start();
    expect(generator.inputs[0].input).toEqual({ request: 'emo vibes', items: CLOSET });
    expect(generator.inputs[0].options.signal).toBeInstanceOf(AbortSignal);
  });

  it('shows "empty" when the answer has no looks', async () => {
    const { session, generator } = setup();
    generator.queue.push(looks());
    await session.start();
    expect(status(session)).toEqual({ kind: 'empty' });
  });

  it('drops a look naming an item not in the closet; all dropped is "empty"', async () => {
    const { session, generator } = setup();
    generator.queue.push(looks({ itemIds: ['ghost', 'bottom-1'], rationale: 'x' }, LOOK_A));
    await session.start();
    expect(ready(session).looks.map((l) => l.itemIds)).toEqual([LOOK_A.itemIds]);

    const other = setup();
    other.generator.queue.push(looks({ itemIds: ['ghost'], rationale: 'x' }));
    await other.session.start();
    expect(status(other.session)).toEqual({ kind: 'empty' });
  });

  it.each([
    ['offline'],
    ['timeout'],
    ['no-token'],
    ['not-configured'],
    ['unauthorized'],
    ['rejected'],
    ['server'],
    ['invalid-response'],
  ] as const)('fails with %s', async (failure) => {
    const { session, generator } = setup();
    generator.queue.push({ ok: false, failure });
    await session.start();
    expect(status(session)).toEqual({ kind: 'failed', failure, missing: [] });
  });

  it('fails with not-enough-items and what is missing', async () => {
    const { session, generator } = setup();
    generator.queue.push({ ok: false, failure: 'not-enough-items', missing: ['bottom', 'dress'] });
    await session.start();
    expect(status(session)).toEqual({ kind: 'failed', failure: 'not-enough-items', missing: ['bottom', 'dress'] });
  });

  it('fails with closet-unavailable when the closet cannot be read, without calling the generator', async () => {
    const { session, generator, state } = setup();
    state.failLoad = true;
    await session.start();
    expect(status(session)).toEqual({ kind: 'failed', failure: 'closet-unavailable', missing: [] });
    expect(generator.inputs).toHaveLength(0);
  });

  it('a double tap sends one request', async () => {
    const { session, generator } = setup();
    const reply = deferred();
    generator.queue.push(reply.step);
    const first = session.start();
    const second = session.start();
    await flush();
    reply.resolve(looks(LOOK_A));
    await Promise.all([first, second]);
    expect(generator.inputs).toHaveLength(1);
    expect(ready(session).looks).toHaveLength(1);
  });

  it('"Try again" after a failure sends a new request; ignored once looks are shown', async () => {
    const { session, generator } = setup();
    generator.queue.push({ ok: false, failure: 'offline' }, looks(LOOK_A));
    await session.start();
    await session.start();
    expect(ready(session).looks).toHaveLength(1);
    await session.start();
    expect(generator.inputs).toHaveLength(2);
  });

  it('retries after "empty" too', async () => {
    const { session, generator } = setup();
    generator.queue.push(looks(), looks(LOOK_B));
    await session.start();
    await session.start();
    expect(ready(session).looks[0].itemIds).toEqual(LOOK_B.itemIds);
  });
});

describe('StyleSession: cancel and leaving', () => {
  it('cancel aborts the request and shows cancelled; the late reply is ignored', async () => {
    const { session, generator } = setup();
    let resolveLate!: (o: OutfitOutcome) => void;
    let signal: AbortSignal | undefined;
    // A generator that ignores the abort and answers late anyway.
    generator.queue.push((_input, options) => {
      signal = options.signal;
      return new Promise((r) => (resolveLate = r));
    });
    const done = session.start();
    await flush();
    session.cancel();
    expect(signal?.aborted).toBe(true);
    expect(status(session)).toEqual({ kind: 'cancelled' });
    resolveLate(looks(LOOK_A));
    await done;
    expect(status(session)).toEqual({ kind: 'cancelled' });
  });

  it('can try again after cancelling', async () => {
    const { session, generator } = setup();
    const reply = deferred();
    generator.queue.push(reply.step, looks(LOOK_A));
    const done = session.start();
    await flush();
    session.cancel();
    await done;
    await session.start();
    expect(ready(session).looks).toHaveLength(1);
  });

  it('cancel while the closet loads stops before the generator is called', async () => {
    const { session, generator } = setup();
    const done = session.start();
    session.cancel();
    await done;
    expect(generator.inputs).toHaveLength(0);
    expect(status(session)).toEqual({ kind: 'cancelled' });
  });

  it('cancel does nothing when no request runs', async () => {
    const { session, generator } = setup();
    generator.queue.push(looks(LOOK_A));
    await session.start();
    session.cancel();
    expect(status(session).kind).toBe('ready');
  });

  it('close (leaving the screen) aborts the request; the reply is ignored and nothing else runs', async () => {
    const { session, generator, seen } = setup();
    const reply = deferred();
    generator.queue.push(reply.step);
    const done = session.start();
    await flush();
    session.close();
    expect(reply.signal?.aborted).toBe(true);
    await done;
    expect(session.getSnapshot().closed).toBe(true);
    expect(seen.map((x) => x.status.kind)).toEqual(['loading', 'loading']);
    await session.start();
    expect(generator.inputs).toHaveLength(1);
  });

  it('close aborts restyles in flight; their replies are ignored', async () => {
    const { session, generator } = setup();
    generator.queue.push(looks(LOOK_A, LOOK_B));
    await session.start();
    const reply = deferred();
    generator.queue.push(reply.step);
    const key = ready(session).looks[0].key;
    const done = session.restyle(key);
    await flush();
    session.close();
    expect(reply.signal?.aborted).toBe(true);
    await done;
    expect(ready(session).looks[0].itemIds).toEqual(LOOK_A.itemIds);
  });

  it('close is safe to call twice', () => {
    const { session } = setup();
    session.close();
    session.close();
    expect(session.getSnapshot().closed).toBe(true);
  });
});

describe('StyleSession: restyle', () => {
  async function shown(...outfits: { itemIds: string[]; rationale: string }[]) {
    const ctx = setup();
    ctx.generator.queue.push(looks(...outfits));
    await ctx.session.start();
    return ctx;
  }

  it('replaces the look in place (same position) with a new key, avoiding every look shown', async () => {
    const { session, generator } = await shown(LOOK_A, LOOK_B, LOOK_C);
    const before = ready(session).looks;
    generator.queue.push(looks(LOOK_D));
    const done = session.restyle(before[1].key);
    expect(ready(session).looks[1].restyling).toBe(true);
    expect(ready(session).looks[0].restyling).toBe(false);
    await done;
    const after = ready(session).looks;
    expect(after.map((l) => l.itemIds)).toEqual([LOOK_A.itemIds, LOOK_D.itemIds, LOOK_C.itemIds]);
    expect(after[1].key).not.toBe(before[1].key);
    expect(after[0].key).toBe(before[0].key);
    expect(after[1].restyling).toBe(false);
    expect(after[1].rationale).toBe('D works.');
    expect(generator.inputs[1].input.request).toBe('emo vibes');
    expect(generator.inputs[1].input.avoid).toEqual([LOOK_A.itemIds, LOOK_B.itemIds, LOOK_C.itemIds]);
  });

  it('keeps avoiding replaced looks: current ones first, then newest, at most 9', async () => {
    const tops = Array.from({ length: 12 }, (_, i) => closetItem(`t${i}`, 'top'));
    const ctx = setup([...tops, closetItem('b', 'bottom'), closetItem('s', 'shoes'), closetItem('d', 'dress')]);
    const look = (top: string) => ({ itemIds: [top, 'b', 's'], rationale: top });
    ctx.generator.queue.push(looks(look('t0'), { itemIds: ['d', 's'], rationale: 'dress' }));
    await ctx.session.start();
    for (let i = 1; i <= 10; i++) {
      ctx.generator.queue.push(looks(look(`t${i}`)));
      await ctx.session.restyle(ready(ctx.session).looks[0].key);
    }
    const last = ctx.generator.inputs[ctx.generator.inputs.length - 1].input.avoid!;
    // Before the 10th restyle: shown t0..t9 and the dress; current looks t9 and the dress.
    expect(last).toHaveLength(9);
    expect(last.slice(0, 3)).toEqual([look('t9').itemIds, ['d', 's'], look('t8').itemIds]);
    expect(last).not.toContainEqual(look('t0').itemIds);
    expect(ready(ctx.session).looks.map((l) => l.itemIds)).toEqual([look('t10').itemIds, ['d', 's']]);
  });

  it('takes the first returned look that is new, skipping any already shown', async () => {
    const { session, generator } = await shown(LOOK_A, LOOK_B);
    generator.queue.push(looks({ ...LOOK_B, itemIds: [...LOOK_B.itemIds].reverse() }, LOOK_A, LOOK_E));
    await session.restyle(ready(session).looks[0].key);
    expect(ready(session).looks.map((l) => l.itemIds)).toEqual([LOOK_E.itemIds, LOOK_B.itemIds]);
  });

  it('no new look: keeps the look and says "No other looks for this request"', async () => {
    const { session, generator } = await shown(LOOK_A, LOOK_B);
    generator.queue.push(looks());
    const key = ready(session).looks[0].key;
    await session.restyle(key);
    const look = ready(session).looks[0];
    expect(look.key).toBe(key);
    expect(look.itemIds).toEqual(LOOK_A.itemIds);
    expect(look.restyleNotice).toBe(NO_OTHER_LOOKS_TEXT);
    expect(look.restyling).toBe(false);
  });

  it.each(['offline', 'timeout', 'server', 'no-token'] as const)('a %s failure keeps the look with a short message', async (failure) => {
    const { session, generator } = await shown(LOOK_A, LOOK_B);
    generator.queue.push({ ok: false, failure });
    const key = ready(session).looks[1].key;
    await session.restyle(key);
    const look = ready(session).looks[1];
    expect(look.key).toBe(key);
    expect(look.itemIds).toEqual(LOOK_B.itemIds);
    expect(look.restyleNotice).toBe(restyleFailureText(failure));
  });

  it('the message clears on the next restyle of that look', async () => {
    const { session, generator } = await shown(LOOK_A);
    generator.queue.push({ ok: false, failure: 'offline' });
    await session.restyle(ready(session).looks[0].key);
    const reply = deferred();
    generator.queue.push(reply.step);
    const done = session.restyle(ready(session).looks[0].key);
    expect(ready(session).looks[0].restyleNotice).toBeNull();
    await flush();
    reply.resolve(looks(LOOK_B));
    await done;
    expect(ready(session).looks[0].itemIds).toEqual(LOOK_B.itemIds);
  });

  it('a double tap on one look sends one call; another look can restyle at the same time', async () => {
    const { session, generator } = await shown(LOOK_A, LOOK_B);
    const [first, second] = ready(session).looks;
    const r1 = deferred();
    const r2 = deferred();
    generator.queue.push(r1.step, r2.step);
    const a = session.restyle(first.key);
    const again = session.restyle(first.key);
    const b = session.restyle(second.key);
    await flush();
    expect(generator.inputs).toHaveLength(3);
    r2.resolve(looks(LOOK_D));
    r1.resolve(looks(LOOK_D, LOOK_E));
    await Promise.all([a, again, b]);
    // The second look got D first; the first look then skips D (already shown) and takes E.
    expect(ready(session).looks.map((l) => l.itemIds)).toEqual([LOOK_E.itemIds, LOOK_D.itemIds]);
  });

  it('is ignored before looks are shown and for an unknown key', async () => {
    const { session, generator } = setup();
    await session.restyle('look-1');
    generator.queue.push(looks(LOOK_A));
    await session.start();
    await session.restyle('nope');
    expect(generator.inputs).toHaveLength(1);
  });

  it('uses the last closet when it cannot be reloaded', async () => {
    const { session, generator, state } = await shown(LOOK_A);
    state.failLoad = true;
    generator.queue.push(looks(LOOK_B));
    await session.restyle(ready(session).looks[0].key);
    expect(generator.inputs[1].input.items).toHaveLength(CLOSET.length);
    expect(ready(session).looks[0].itemIds).toEqual(LOOK_B.itemIds);
  });
});

describe('StyleSession: closet changes', () => {
  it('an edited piece shows its new data after refreshCloset', async () => {
    const { session, generator, state } = setup();
    generator.queue.push(looks(LOOK_A));
    await session.start();
    state.closet = state.closet.map((item) => (item.id === 'top-1' ? { ...item, name: 'Renamed' } : item));
    await session.refreshCloset();
    expect(ready(session).looks[0].pieces[0].item?.name).toBe('Renamed');
  });

  it('a deleted piece reads as removed (item null), the look stays while its base remains', async () => {
    const { session, generator, state } = setup();
    generator.queue.push(looks(LOOK_A, LOOK_C));
    await session.start();
    state.closet = state.closet.filter((item) => item.id !== 'shoes-1' && item.id !== 'top-1');
    await session.refreshCloset();
    const s = ready(session);
    expect(s.looks).toHaveLength(2);
    expect(s.looks[0].pieces.map((p) => p.item === null)).toEqual([true, false, true]);
    expect(s.looks[0].pieces[0].category).toBe('top');
  });

  it('a look whose top, bottom and dress are all gone drops out; all gone leaves ready with no looks', async () => {
    const { session, generator, state } = setup();
    generator.queue.push(looks(LOOK_A, LOOK_C));
    await session.start();
    state.closet = state.closet.filter((item) => item.id !== 'dress-1');
    await session.refreshCloset();
    expect(ready(session).looks.map((l) => l.itemIds)).toEqual([LOOK_A.itemIds]);
    state.closet = state.closet.filter((item) => item.id !== 'top-1' && item.id !== 'bottom-1');
    await session.refreshCloset();
    expect(ready(session).looks).toEqual([]);
  });

  it('a look that drops out while restyling has its restyle aborted and ignored', async () => {
    const { session, generator, state } = setup();
    generator.queue.push(looks(LOOK_C, LOOK_A));
    await session.start();
    const reply = deferred();
    generator.queue.push(reply.step);
    const done = session.restyle(ready(session).looks[0].key);
    await flush();
    state.closet = state.closet.filter((item) => item.id !== 'dress-1');
    await session.refreshCloset();
    expect(reply.signal?.aborted).toBe(true);
    await done;
    expect(ready(session).looks.map((l) => l.itemIds)).toEqual([LOOK_A.itemIds]);
  });

  it('refreshCloset does nothing before looks or after close', async () => {
    const { session, seen } = setup();
    await session.refreshCloset();
    expect(seen).toHaveLength(0);
    session.close();
    await session.refreshCloset();
    expect(seen).toHaveLength(1);
  });
});

describe('StyleSessions', () => {
  function deps() {
    const generator = new FakeOutfitGenerator();
    return { generator, loadCloset: async () => CLOSET };
  }

  it('begins a session that is loading at once and is the current one', () => {
    const sessions = new StyleSessions();
    const d = deps();
    d.generator.queue.push(deferred().step);
    const session = sessions.begin('for summer', d);
    expect(session).not.toBeNull();
    expect(sessions.current).toBe(session);
    expect(session!.getSnapshot().status).toEqual({ kind: 'loading' });
  });

  it('a second begin while loading is ignored (double tap on Get looks)', async () => {
    const sessions = new StyleSessions();
    const d = deps();
    d.generator.queue.push(deferred().step);
    const first = sessions.begin('for summer', d);
    expect(sessions.begin('for summer', d)).toBeNull();
    expect(sessions.current).toBe(first);
    await flush();
    expect(d.generator.inputs).toHaveLength(1);
  });

  it('a new begin after the previous finished or closed replaces and closes it', async () => {
    const sessions = new StyleSessions();
    const d = deps();
    d.generator.queue.push(looks(LOOK_A));
    const first = sessions.begin('a', d)!;
    await flush();
    const second = sessions.begin('b', d)!;
    expect(first.getSnapshot().closed).toBe(true);
    expect(sessions.current).toBe(second);

    d.generator.queue.push(deferred().step);
    second.close();
    const third = sessions.begin('c', d);
    expect(third).not.toBeNull();
  });
});
