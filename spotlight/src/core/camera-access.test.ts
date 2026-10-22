import {
  CAMERA_ACCESS_TEXT,
  cameraAccessReducer,
  deniedPanelAction,
  INITIAL_CAMERA_ACCESS,
  type CameraAccessEvent,
  type CameraAccessState,
  type CameraPermission,
} from './camera-access';

const UNDETERMINED: CameraPermission = { status: 'undetermined', canAskAgain: true };
const GRANTED: CameraPermission = { status: 'granted', canAskAgain: true };
const DENIED_SETTINGS: CameraPermission = { status: 'denied', canAskAgain: false };
const DENIED_ASK_AGAIN: CameraPermission = { status: 'denied', canAskAgain: true };

/** Runs events in order; returns the final state and every effect. */
function run(events: CameraAccessEvent[], from: CameraAccessState = INITIAL_CAMERA_ACCESS) {
  let state = from;
  const effects: string[] = [];
  for (const event of events) {
    const step = cameraAccessReducer(state, event);
    state = step.state;
    if (step.effect) effects.push(step.effect);
  }
  return { state, effects };
}

describe('cameraAccessReducer: entering the scan flow', () => {
  it('shows the intro when permission is undetermined', () => {
    const { state, effects } = run([
      { type: 'checked', permission: UNDETERMINED },
      { type: 'entered', allowed: true },
    ]);
    expect(state.surface).toBe('intro');
    expect(state.pendingTake).toBe(false);
    expect(effects).toEqual(['entry-prompt-shown']);
  });

  it('waits for the first check when entered before it finishes', () => {
    const waiting = run([{ type: 'entered', allowed: true }]);
    expect(waiting.state.surface).toBe('none');
    expect(waiting.state.entryPromptWaiting).toBe(true);
    const { state, effects } = run([{ type: 'checked', permission: UNDETERMINED }], waiting.state);
    expect(state.surface).toBe('intro');
    expect(state.entryPromptWaiting).toBe(false);
    expect(effects).toEqual(['entry-prompt-shown']);
  });

  it('shows nothing and never opens the camera when already granted', () => {
    const { state, effects } = run([
      { type: 'entered', allowed: true },
      { type: 'checked', permission: GRANTED },
    ]);
    expect(state.surface).toBe('none');
    expect(effects).toEqual([]);
  });

  it('shows the denied panel when denied', () => {
    const { state } = run([
      { type: 'checked', permission: DENIED_SETTINGS },
      { type: 'entered', allowed: true },
    ]);
    expect(state.surface).toBe('denied');
  });

  it('shows nothing when the entry prompt was already used this session', () => {
    const { state, effects } = run([
      { type: 'checked', permission: UNDETERMINED },
      { type: 'entered', allowed: false },
    ]);
    expect(state.surface).toBe('none');
    expect(effects).toEqual([]);
  });

  it('"Not now" after the entry prompt ends nothing (no pending tap)', () => {
    const { state, effects } = run([
      { type: 'checked', permission: UNDETERMINED },
      { type: 'entered', allowed: true },
      { type: 'dismissed' },
    ]);
    expect(state.surface).toBe('none');
    expect(effects).toEqual(['entry-prompt-shown']);
  });

  it('allowing access from the entry prompt does not open the camera', () => {
    const { state, effects } = run([
      { type: 'checked', permission: UNDETERMINED },
      { type: 'entered', allowed: true },
      { type: 'request-started' },
      { type: 'request-finished', permission: GRANTED },
    ]);
    expect(state.surface).toBe('none');
    expect(state.requesting).toBe(false);
    expect(effects).toEqual(['entry-prompt-shown']);
  });
});

describe('cameraAccessReducer: "Take photo"', () => {
  it('goes straight to the camera when granted', () => {
    const { state, effects } = run([{ type: 'take-tapped', permission: GRANTED }]);
    expect(state.surface).toBe('none');
    expect(effects).toEqual(['launch-camera']);
  });

  it('shows the intro when undetermined, and continues to the camera after Allow', () => {
    const shown = run([{ type: 'take-tapped', permission: UNDETERMINED }]);
    expect(shown.state).toMatchObject({ surface: 'intro', pendingTake: true });
    expect(shown.effects).toEqual([]);
    const requesting = run([{ type: 'request-started' }], shown.state);
    expect(requesting.state.requesting).toBe(true);
    const { state, effects } = run([{ type: 'request-finished', permission: GRANTED }], requesting.state);
    expect(state).toMatchObject({ surface: 'none', pendingTake: false, requesting: false });
    expect(effects).toEqual(['launch-camera']);
  });

  it('moves from the intro to the denied panel when the system prompt is refused', () => {
    const { state, effects } = run([
      { type: 'take-tapped', permission: UNDETERMINED },
      { type: 'request-started' },
      { type: 'request-finished', permission: DENIED_SETTINGS },
    ]);
    expect(state).toMatchObject({ surface: 'denied', pendingTake: true, requesting: false });
    expect(effects).toEqual([]);
  });

  it('shows the denied panel when denied, and "Not now" ends the tap', () => {
    const shown = run([{ type: 'take-tapped', permission: DENIED_SETTINGS }]);
    expect(shown.state.surface).toBe('denied');
    const { state, effects } = run([{ type: 'dismissed' }], shown.state);
    expect(state).toMatchObject({ surface: 'none', pendingTake: false });
    expect(effects).toEqual(['end-take']);
  });

  it('Android: asking again from the denied panel can continue to the camera', () => {
    const { effects } = run([
      { type: 'take-tapped', permission: DENIED_ASK_AGAIN },
      { type: 'request-started' },
      { type: 'request-finished', permission: GRANTED },
    ]);
    expect(effects).toEqual(['launch-camera']);
  });

  it('a tap covers an entry prompt still waiting for its check', () => {
    const { state } = run([
      { type: 'entered', allowed: true },
      { type: 'take-tapped', permission: UNDETERMINED },
      { type: 'checked', permission: UNDETERMINED },
    ]);
    expect(state).toMatchObject({ surface: 'intro', pendingTake: true, entryPromptWaiting: false });
  });

  it('"Choose from photo library" closes any surface and picks from the library', () => {
    for (const permission of [UNDETERMINED, DENIED_SETTINGS]) {
      const { state, effects } = run([{ type: 'take-tapped', permission }, { type: 'library-chosen' }]);
      expect(state).toMatchObject({ surface: 'none', pendingTake: false });
      expect(effects).toEqual(['pick-library']);
    }
  });

  it('the camera refusing (a race with Settings) shows the denied panel', () => {
    const { state } = run([
      { type: 'take-tapped', permission: GRANTED },
      { type: 'camera-refused', permission: DENIED_SETTINGS },
    ]);
    expect(state.surface).toBe('denied');
    // A stale 'granted' from the picker still counts as refused.
    expect(run([{ type: 'camera-refused', permission: GRANTED }]).state.surface).toBe('denied');
  });
});

describe('cameraAccessReducer: returning to the foreground', () => {
  it('closes the denied panel once access is on, without opening the camera', () => {
    const { state, effects } = run([
      { type: 'take-tapped', permission: DENIED_SETTINGS },
      { type: 'checked', permission: GRANTED },
    ]);
    expect(state).toMatchObject({ surface: 'none', pendingTake: false, permission: GRANTED });
    expect(effects).toEqual(['end-take']);
  });

  it('keeps the panel when access is still off, and switches to the prompt if the OS can ask again', () => {
    const still = run([
      { type: 'take-tapped', permission: DENIED_SETTINGS },
      { type: 'checked', permission: DENIED_SETTINGS },
    ]);
    expect(still.state.surface).toBe('denied');
    const reset = run([{ type: 'checked', permission: UNDETERMINED }], still.state);
    expect(reset.state.surface).toBe('intro');
  });

  it('ignores surface changes while the system prompt is up (iOS goes inactive then active)', () => {
    const { state } = run([
      { type: 'take-tapped', permission: UNDETERMINED },
      { type: 'request-started' },
      { type: 'checked', permission: GRANTED },
    ]);
    expect(state).toMatchObject({ surface: 'intro', requesting: true, permission: GRANTED });
  });

  it('only records the permission when nothing is shown', () => {
    const { state, effects } = run([{ type: 'checked', permission: DENIED_SETTINGS }]);
    expect(state).toMatchObject({ surface: 'none', permission: DENIED_SETTINGS });
    expect(effects).toEqual([]);
  });
});

describe('cameraAccessReducer: guards', () => {
  it('ignores a request start with no surface, or a second one', () => {
    expect(cameraAccessReducer(INITIAL_CAMERA_ACCESS, { type: 'request-started' }).state).toBe(INITIAL_CAMERA_ACCESS);
    const requesting = run([{ type: 'take-tapped', permission: UNDETERMINED }, { type: 'request-started' }]).state;
    expect(cameraAccessReducer(requesting, { type: 'request-started' }).state).toBe(requesting);
  });

  it('does not re-show the entry prompt over a surface already up', () => {
    const shown = run([{ type: 'take-tapped', permission: DENIED_SETTINGS }]).state;
    expect(cameraAccessReducer(shown, { type: 'entered', allowed: true })).toEqual({ state: shown, effect: null });
  });

  it('dismissing with nothing shown does nothing', () => {
    expect(cameraAccessReducer(INITIAL_CAMERA_ACCESS, { type: 'dismissed' })).toEqual({
      state: INITIAL_CAMERA_ACCESS,
      effect: null,
    });
  });
});

describe('deniedPanelAction', () => {
  it('offers the real prompt only when the OS can ask again', () => {
    expect(deniedPanelAction(DENIED_ASK_AGAIN)).toBe('ask-again');
    expect(deniedPanelAction(DENIED_SETTINGS)).toBe('open-settings');
    expect(deniedPanelAction(null)).toBe('open-settings');
  });
});

describe('camera intro copy (Gate 2 slice 3)', () => {
  it('no longer claims photos stay on the device, and says what is sent', () => {
    const { introBody } = CAMERA_ACCESS_TEXT;
    expect(introBody).not.toMatch(/stay on this device/i);
    expect(introBody).toContain('without location data');
    expect(introBody).toContain('Claude (Anthropic)');
  });
});
