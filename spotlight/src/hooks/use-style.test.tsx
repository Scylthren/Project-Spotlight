/**
 * The Style and Results hooks: "Get looks" starts one request and remembers
 * it; leaving Results aborts the request in flight.
 */
import { act, renderHook } from '@testing-library/react-native';

import { FakeOutfitGenerator, type OutfitGenerateOptions, type OutfitOutcome } from '@/ai/outfit-generator';
import { closetItem } from '@/ai/testing/outfit-fixtures';
import { FakeWeatherClient } from '@/ai/weather-client';
import { MockLocationProvider } from '@/data/location-provider';
import { MemoryRecentRequestsStore } from '@/data/recent-requests-store';
import { StyleSessions } from '@/data/style-session';
import { MemoryWeatherDayCache } from '@/data/weather-day-cache';
import { MemoryWeatherSettingsStore, type WeatherSettings } from '@/data/weather-settings';

import type { StyleServices } from './style-services';
import { createWeatherServices } from './weather-services';
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

function services(
  recents: string[] = [],
  weather: { settings?: WeatherSettings; location?: MockLocationProvider } = {},
): StyleServices & { generator: FakeOutfitGenerator; recentRequests: MemoryRecentRequestsStore; location: MockLocationProvider; client: FakeWeatherClient } {
  const location = weather.location ?? new MockLocationProvider();
  const client = new FakeWeatherClient();
  return {
    sessions: new StyleSessions(),
    generator: new FakeOutfitGenerator(),
    recentRequests: new MemoryRecentRequestsStore(recents),
    weather: createWeatherServices({
      settings: new MemoryWeatherSettingsStore(weather.settings),
      location,
      client,
      cache: new MemoryWeatherDayCache(),
    }),
    location,
    client,
  };
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

describe('useStylePrompt: match today\'s weather', () => {
  const ON = { useLocalWeather: true, homeCity: null };

  it('is unavailable while Use local weather is off: the toggle does nothing', async () => {
    const s = services();
    const { result } = await renderHook(() => useStylePrompt(s));
    await act(async () => undefined);
    expect(result.current.weatherAvailable).toBe(false);
    await act(async () => result.current.setMatchWeather(true));
    expect(result.current.matchWeather).toBe(false);
    expect(result.current.canSubmit).toBe(false);
  });

  it('with the row on, text is optional; Get looks starts a match-weather request with the location already allowed', async () => {
    const s = services([], { settings: ON });
    hanging(s.generator);
    const { result } = await renderHook(() => useStylePrompt(s));
    await act(async () => undefined);
    await act(async () => result.current.setMatchWeather(true));
    expect(result.current.matchWeather).toBe(true);
    expect(result.current.canSubmit).toBe(true);
    let session: unknown;
    await act(async () => {
      session = await result.current.submitWeather();
    });
    expect(session).not.toBeNull();
    expect(result.current.locationIntro.visible).toBe(false);
    expect(s.sessions.current?.getSnapshot()).toMatchObject({ request: '', matchWeather: true });
    expect(s.client.queries[0].query).toEqual({ lat: 51.5, lon: -0.1 });
    expect(result.current.recents).toEqual([]);
  });

  it('shows the location intro first when never asked; Allow triggers the system prompt, then the request starts', async () => {
    const location = new MockLocationProvider({ status: 'undetermined', canAskAgain: true });
    const s = services([], { settings: ON, location });
    hanging(s.generator);
    const { result } = await renderHook(() => useStylePrompt(s));
    await act(async () => undefined);
    await act(async () => result.current.setMatchWeather(true));
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.submitWeather();
    });
    expect(result.current.locationIntro.visible).toBe(true);
    expect(s.sessions.current).toBeNull();
    // A second tap while the intro is up starts nothing.
    let second: unknown;
    await act(async () => {
      second = await result.current.submitWeather();
    });
    expect(second).toBeNull();
    await act(async () => result.current.locationIntro.allow());
    await act(async () => {
      await pending;
    });
    expect(location.requestCalls).toBe(1);
    expect(result.current.locationIntro.visible).toBe(false);
    expect(s.sessions.current?.getSnapshot().matchWeather).toBe(true);
  });

  it('Not now skips the system prompt and still starts (the session then says there is no location)', async () => {
    const location = new MockLocationProvider({ status: 'undetermined', canAskAgain: true });
    const s = services([], { settings: ON, location });
    const { result } = await renderHook(() => useStylePrompt(s));
    await act(async () => undefined);
    await act(async () => result.current.setMatchWeather(true));
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.submitWeather();
    });
    await act(async () => result.current.locationIntro.notNow());
    await act(async () => {
      await pending;
    });
    expect(location.requestCalls).toBe(0);
    await act(async () => undefined);
    expect(s.sessions.current?.getSnapshot().status).toEqual({ kind: 'failed', failure: 'no-location', missing: [], location: 'not-allowed' });
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
