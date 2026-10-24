/**
 * The Style and Results hooks: "Get looks" starts one request and remembers
 * it; leaving Results aborts the request in flight.
 */
import { act, renderHook } from '@testing-library/react-native';

import { FakeOutfitGenerator, type OutfitGenerateOptions, type OutfitOutcome } from '@/ai/outfit-generator';
import { closetItem } from '@/ai/testing/outfit-fixtures';
import { MemoryRecentRequestsStore } from '@/data/recent-requests-store';
import { StyleSessions } from '@/data/style-session';

import type { StyleServices } from './style-services';
import { useStylePrompt } from './use-style-prompt';
import { useStyleResults } from './use-style-results';

const mockCloset = [closetItem('t', 'top'), closetItem('b', 'bottom'), closetItem('s', 'shoes')];

jest.mock('expo-router', () => ({
  // Focus effects run like mount effects here (one screen, always focused).
  useFocusEffect: (effect: () => void | (() => void)) => {
    jest.requireActual('react').useEffect(effect, [effect]);
  },
}));

jest.mock('./closet-services', () => ({
  useClosetServices: () => ({ repository: { list: async () => mockCloset } }),
}));

/** A generator call that waits until the test answers, and records its signal. */
function hanging(generator: FakeOutfitGenerator) {
  const calls: { options: OutfitGenerateOptions; answer: (o: OutfitOutcome) => void }[] = [];
  generator.fallback = { ok: false, failure: 'offline' };
  generator.queue.push(
    (_input, options) =>
      new Promise<OutfitOutcome>((resolve) => {
        calls.push({ options, answer: resolve });
        options.signal?.addEventListener('abort', () => resolve({ ok: false, failure: 'cancelled' }));
      }),
  );
  return calls;
}

function services(recents: string[] = []): StyleServices & { generator: FakeOutfitGenerator; recentRequests: MemoryRecentRequestsStore } {
  return { sessions: new StyleSessions(), generator: new FakeOutfitGenerator(), recentRequests: new MemoryRecentRequestsStore(recents) };
}

describe('useStylePrompt', () => {
  it('loads the recent requests', async () => {
    const s = services(['emo vibes']);
    const { result } = await renderHook(() => useStylePrompt(s));
    await act(async () => undefined);
    expect(result.current.recents).toEqual(['emo vibes']);
  });

  it('cannot submit empty or too-long text', async () => {
    const s = services();
    const { result } = await renderHook(() => useStylePrompt(s));
    expect(result.current.canSubmit).toBe(false);
    expect(result.current.submit()).toBeNull();
    await act(async () => result.current.setText('x'.repeat(201)));
    expect(result.current.error).toBe('Keep it to 200 characters.');
    expect(result.current.submit()).toBeNull();
    expect(s.generator.inputs).toHaveLength(0);
  });

  it('a double tap on Get looks starts one request with the closet, and remembers it', async () => {
    const s = services(['older']);
    hanging(s.generator);
    const { result } = await renderHook(() => useStylePrompt(s));
    await act(async () => result.current.setText('  first   date '));
    let first: unknown;
    let second: unknown;
    await act(async () => {
      first = result.current.submit();
      second = result.current.submit();
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(s.generator.inputs).toHaveLength(1);
    expect(s.generator.inputs[0].input).toMatchObject({ request: 'first date', items: mockCloset });
    expect(result.current.recents).toEqual(['first date', 'older']);
  });
});

describe('useStyleResults', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the current request and closes it (aborting the call) when the screen goes away', async () => {
    const s = services();
    const calls = hanging(s.generator);
    const session = s.sessions.begin('emo vibes', { generator: s.generator, loadCloset: async () => mockCloset })!;
    const { result, unmount } = await renderHook(() => useStyleResults(s));
    expect(result.current.session).toBe(session);
    expect(result.current.snapshot?.status.kind).toBe('loading');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(calls).toHaveLength(1);

    await unmount();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(calls[0].options.signal?.aborted).toBe(true);
    expect(session.getSnapshot().closed).toBe(true);
    // A late answer changes nothing.
    calls[0].answer({ ok: true, outfits: [{ itemIds: ['t', 'b', 's'], rationale: 'x' }], stub: true, droppedOutfits: 0, omittedItems: 0 });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(session.getSnapshot().status.kind).toBe('loading');
  });

  it('a development Strict Mode remount does not close the request', async () => {
    const { StrictMode } = jest.requireActual('react');
    const s = services();
    hanging(s.generator);
    const session = s.sessions.begin('emo vibes', { generator: s.generator, loadCloset: async () => mockCloset })!;
    await renderHook(() => useStyleResults(s), { wrapper: StrictMode });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10);
    });
    expect(session.getSnapshot().closed).toBe(false);
  });

  it('gives nulls when there is no request', async () => {
    const { result } = await renderHook(() => useStyleResults(services()));
    expect(result.current).toEqual({ session: null, snapshot: null });
  });
});
