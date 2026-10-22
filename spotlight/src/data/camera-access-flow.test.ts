import type { CameraPermission, PhotoTarget } from '@/core';

import { CameraAccessFlow, type CameraFlowPick } from './camera-access-flow';
import { EntryPromptSession, FakeCameraPermissions } from './camera-permissions';
import { FormColorDetection } from './form-color-detection';
import { NoGarmentIsolator } from './garment-isolator';
import type { PhotoSource } from './photo-picker';

const UNDETERMINED: CameraPermission = { status: 'undetermined', canAskAgain: true };
const GRANTED: CameraPermission = { status: 'granted', canAskAgain: true };
const DENIED: CameraPermission = { status: 'denied', canAskAgain: false };
const DENIED_ASK_AGAIN: CameraPermission = { status: 'denied', canAskAgain: true };

const FRONT: PhotoTarget = { kind: 'add', role: 'front' };
const BACK: PhotoTarget = { kind: 'add', role: 'back' };

/** Lets pending promise callbacks run. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function setup(permission: CameraPermission = UNDETERMINED, { session = new EntryPromptSession() } = {}) {
  const permissions = new FakeCameraPermissions(permission);
  const picks: { source: PhotoSource; target: PhotoTarget }[] = [];
  const pickResults: CameraFlowPick[] = [];
  const introVisible: boolean[] = [];
  const flow = new CameraAccessFlow(
    permissions,
    session,
    {
      pick: async (source, target) => {
        picks.push({ source, target });
        return pickResults.shift() ?? { id: `draft-${picks.length}` };
      },
      defaultTarget: () => FRONT,
      onIntroVisible: (visible) => introVisible.push(visible),
    },
    { introCloseTimeoutMs: 50 },
  );
  return { flow, permissions, picks, pickResults, introVisible, session };
}

describe('CameraAccessFlow: entering Add', () => {
  it('shows the intro once per session when undetermined; "Not now" hides it', async () => {
    const { flow, session, picks } = setup(UNDETERMINED);
    flow.enter();
    await flow.check();
    expect(flow.getState().surface).toBe('intro');
    expect(session.shown).toBe(true);
    flow.notNow();
    expect(flow.getState().surface).toBe('none');
    // Second visit in the same app session: no prompt.
    flow.enter();
    expect(flow.getState().surface).toBe('none');
    // A new form in the same session (e.g. the screen remounted) shares the session.
    const again = setup(UNDETERMINED, { session });
    await again.flow.check();
    again.flow.enter();
    expect(again.flow.getState().surface).toBe('none');
    expect(picks).toEqual([]);
  });

  it('never opens the camera on entry, even after Allow', async () => {
    const { flow, permissions, picks } = setup(UNDETERMINED);
    await flow.check();
    flow.enter();
    permissions.requests.push(GRANTED);
    await flow.allow();
    expect(flow.getState().surface).toBe('none');
    flow.introClosed();
    await flush();
    expect(picks).toEqual([]);
  });

  it('library from the entry prompt picks into the default target after the modal closes', async () => {
    const { flow, picks, introVisible } = setup(UNDETERMINED);
    await flow.check();
    flow.enter();
    expect(introVisible).toEqual([true]);
    flow.chooseLibrary();
    expect(picks).toEqual([]); // still closing
    flow.introClosed();
    await flush();
    expect(picks).toEqual([{ source: 'library', target: FRONT }]);
    expect(introVisible).toEqual([true, false]);
  });
});

describe('CameraAccessFlow: "Take photo"', () => {
  it('opens the camera at once when granted', async () => {
    const { flow, picks } = setup(GRANTED);
    expect(await flow.takePhoto(BACK)).toBe('draft-1');
    expect(picks).toEqual([{ source: 'camera', target: BACK }]);
  });

  it('undetermined: intro, Allow, then the camera once the modal has closed', async () => {
    const { flow, permissions, picks } = setup(UNDETERMINED);
    const taking = flow.takePhoto(BACK);
    await flush();
    expect(flow.getState()).toMatchObject({ surface: 'intro', pendingTake: true });
    permissions.requests.push(GRANTED);
    await flow.allow();
    expect(permissions.requestCalls).toBe(1);
    expect(picks).toEqual([]);
    flow.introClosed();
    expect(await taking).toBe('draft-1');
    expect(picks).toEqual([{ source: 'camera', target: BACK }]);
  });

  it('opens the camera after a timeout if the modal never reports closing', async () => {
    const { flow, permissions, picks } = setup(UNDETERMINED);
    const taking = flow.takePhoto(FRONT);
    await flush();
    permissions.requests.push(GRANTED);
    await flow.allow();
    expect(await taking).toBe('draft-1');
    expect(picks).toHaveLength(1);
  });

  it('refusing the system prompt shows the denied panel; library from it picks for the tap', async () => {
    const { flow, permissions, picks } = setup(UNDETERMINED);
    const taking = flow.takePhoto(BACK);
    await flush();
    permissions.requests.push(DENIED);
    await flow.allow();
    expect(flow.getState()).toMatchObject({ surface: 'denied', pendingTake: true });
    flow.introClosed();
    flow.chooseLibrary();
    expect(await taking).toBe('draft-1');
    expect(picks).toEqual([{ source: 'library', target: BACK }]);
  });

  it('denied: the panel opens Settings; coming back with access on closes it without the camera', async () => {
    const { flow, permissions, picks } = setup(DENIED);
    const taking = flow.takePhoto(FRONT);
    await flush();
    expect(flow.getState().surface).toBe('denied');
    await flow.openSettings();
    expect(permissions.settingsOpened).toBe(1);
    permissions.current = GRANTED;
    await flow.check(); // AppState 'active'
    expect(flow.getState().surface).toBe('none');
    expect(await taking).toBeNull();
    expect(picks).toEqual([]);
  });

  it('Android: the denied panel can ask again and continue to the camera', async () => {
    const { flow, permissions, picks } = setup(DENIED_ASK_AGAIN);
    const taking = flow.takePhoto(FRONT);
    await flush();
    permissions.requests.push(GRANTED);
    await flow.allow();
    expect(await taking).toBe('draft-1'); // no modal was up: no wait
    expect(picks).toEqual([{ source: 'camera', target: FRONT }]);
  });

  it('"Not now" ends the tap with null', async () => {
    const { flow } = setup(UNDETERMINED);
    const taking = flow.takePhoto(FRONT);
    await flush();
    flow.notNow();
    expect(await taking).toBeNull();
  });

  it('a second tap replaces a waiting one', async () => {
    const { flow } = setup(DENIED);
    const first = flow.takePhoto(FRONT);
    await flush();
    const second = flow.takePhoto(BACK);
    expect(await first).toBeNull();
    flow.notNow();
    expect(await second).toBeNull();
  });

  it('shows the denied panel when the camera itself refuses (changed in Settings meanwhile)', async () => {
    const { flow, pickResults } = setup(GRANTED);
    pickResults.push({ id: null, cameraRefused: DENIED });
    expect(await flow.takePhoto(FRONT)).toBeNull();
    expect(flow.getState().surface).toBe('denied');
  });

  it('a pick that throws resolves the tap to null', async () => {
    const permissions = new FakeCameraPermissions(GRANTED);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const flow = new CameraAccessFlow(permissions, new EntryPromptSession(), {
      pick: async () => {
        throw new Error('boom');
      },
      defaultTarget: () => FRONT,
    });
    expect(await flow.takePhoto(FRONT)).toBeNull();
    warn.mockRestore();
  });
});

describe('CameraAccessFlow: closing the intro (slice 5 review)', () => {
  it('introClosed and then the timeout: exactly one pick', async () => {
    const { flow, permissions, picks, introVisible } = setup(UNDETERMINED);
    const taking = flow.takePhoto(FRONT);
    await flush();
    permissions.requests.push(GRANTED);
    await flow.allow();
    flow.introClosed();
    expect(await taking).toBe('draft-1');
    await new Promise((r) => setTimeout(r, 80)); // past the 50 ms timeout
    flow.introClosed(); // a late onDismiss too
    await flush();
    expect(picks).toHaveLength(1);
    expect(introVisible).toEqual([true, false]);
  });

  it('a "Take photo" tap while the intro is closing replaces the waiting picker: only one picker opens', async () => {
    const { flow, permissions, picks } = setup(UNDETERMINED);
    const first = flow.takePhoto(BACK);
    await flush();
    permissions.requests.push(GRANTED);
    await flow.allow(); // the camera for BACK now waits for the close
    const second = flow.takePhoto(FRONT);
    expect(await first).toBeNull();
    await flush();
    expect(picks).toEqual([]); // the replacing picker also waits for the close
    flow.introClosed();
    expect(await second).toBe('draft-1');
    await new Promise((r) => setTimeout(r, 80)); // past the 50 ms timeout too
    expect(picks).toEqual([{ source: 'camera', target: FRONT }]);
  });

  it('the same during the entry prompt: library chosen, then "Take photo" before the close opens only the camera', async () => {
    const { flow, permissions, picks } = setup(UNDETERMINED);
    await flow.check();
    flow.enter();
    flow.chooseLibrary(); // the library waits for the close
    permissions.current = GRANTED;
    const taking = flow.takePhoto(BACK);
    await flush();
    expect(picks).toEqual([]); // waits for the close
    flow.introClosed();
    expect(await taking).toBe('draft-1');
    await new Promise((r) => setTimeout(r, 80));
    expect(picks).toEqual([{ source: 'camera', target: BACK }]);
  });

  it('dispose after Allow but before the intro has closed: no pick, the tap ends with null', async () => {
    const { flow, permissions, picks } = setup(UNDETERMINED);
    const taking = flow.takePhoto(FRONT);
    await flush();
    permissions.requests.push(GRANTED);
    await flow.allow(); // camera is now waiting for the close
    flow.dispose();
    expect(await taking).toBeNull();
    flow.introClosed();
    await new Promise((r) => setTimeout(r, 80));
    expect(picks).toEqual([]);
  });

  it('the intro shown again while closing: the old close timer cannot hide it, and the old wait ends', async () => {
    const { flow, permissions, picks, introVisible } = setup(UNDETERMINED);
    const first = flow.takePhoto(FRONT);
    await flush();
    flow.chooseLibrary(); // intro closing, library waits for it
    const second = flow.takePhoto(BACK); // before the close finished
    await flush();
    expect(flow.getState().surface).toBe('intro');
    expect(await first).toBeNull(); // replaced by the second tap
    await new Promise((r) => setTimeout(r, 80)); // the old timer would have fired here
    expect(flow.getState().surface).toBe('intro');
    expect(introVisible).toEqual([true]); // never reported closed while on screen
    flow.introClosed(); // ignored: still on screen
    expect(introVisible).toEqual([true]);
    expect(picks).toEqual([]);
    permissions.requests.push(GRANTED);
    await flow.allow();
    flow.introClosed();
    expect(await second).toBe('draft-1');
    expect(picks).toEqual([{ source: 'camera', target: BACK }]);
    expect(introVisible).toEqual([true, false]);
  });

  it('opens the picker before reporting the intro closed (the picker hold comes first)', async () => {
    const events: string[] = [];
    const permissions = new FakeCameraPermissions(UNDETERMINED);
    const flow = new CameraAccessFlow(
      permissions,
      new EntryPromptSession(),
      {
        pick: async (source) => {
          events.push(`pick ${source}`);
          return { id: 'draft' };
        },
        defaultTarget: () => FRONT,
        onIntroVisible: (visible) => events.push(visible ? 'intro shown' : 'intro closed'),
      },
      { introCloseTimeoutMs: 50 },
    );
    const taking = flow.takePhoto(FRONT);
    await flush();
    permissions.requests.push(GRANTED);
    await flow.allow();
    flow.introClosed();
    expect(await taking).toBe('draft');
    expect(events).toEqual(['intro shown', 'pick camera', 'intro closed']);
  });

  it('with the real notice holds: a held color notice does not open the matrix over the camera', async () => {
    const opened: string[] = [];
    const detection = new FormColorDetection(new NoGarmentIsolator(), {
      colors: () => [],
      frontPhotoId: () => null,
      setColors: () => undefined,
      openMatrix: (notice) => opened.push(notice),
      setDetecting: () => undefined,
      isActive: () => true,
    });
    let finishPick!: (pick: CameraFlowPick) => void;
    const permissions = new FakeCameraPermissions(UNDETERMINED);
    const flow = new CameraAccessFlow(
      permissions,
      new EntryPromptSession(),
      {
        // Like the form: the picker hold is taken synchronously when the pick starts.
        pick: (): Promise<CameraFlowPick> => {
          detection.hold('picker');
          return new Promise((resolve) => (finishPick = resolve));
        },
        defaultTarget: () => FRONT,
        onIntroVisible: (visible) => (visible ? detection.hold('camera-intro') : detection.release('camera-intro')),
      },
      { introCloseTimeoutMs: 50 },
    );
    const taking = flow.takePhoto(FRONT);
    await flush();
    detection.apply([], 'Check the colors'); // a notice arrives while the intro is up
    permissions.requests.push(GRANTED);
    await flow.allow();
    flow.introClosed();
    expect(opened).toEqual([]); // camera is open: still held
    detection.release('picker');
    finishPick({ id: 'draft' });
    expect(await taking).toBe('draft');
    expect(opened).toEqual(['Check the colors']);
  });
});

describe('CameraAccessFlow: double taps', () => {
  it('two quick taps both checking: the first ends with null, the second goes on', async () => {
    const { flow, permissions, picks } = setup(GRANTED);
    const releases: (() => void)[] = [];
    const realCheck = permissions.check.bind(permissions);
    permissions.check = async () => {
      const result = await realCheck();
      await new Promise<void>((r) => releases.push(r));
      return result;
    };
    const first = flow.takePhoto(FRONT);
    const second = flow.takePhoto(BACK);
    await flush();
    expect(releases).toHaveLength(2);
    releases[0]();
    expect(await first).toBeNull();
    releases[1]();
    expect(await second).toBe('draft-1');
    expect(picks).toEqual([{ source: 'camera', target: BACK }]);
  });

  it('two quick taps, checks finishing in reverse order: neither promise is left hanging', async () => {
    const { flow, permissions } = setup(DENIED);
    const releases: (() => void)[] = [];
    const realCheck = permissions.check.bind(permissions);
    permissions.check = async () => {
      const result = await realCheck();
      await new Promise<void>((r) => releases.push(r));
      return result;
    };
    const first = flow.takePhoto(FRONT);
    const second = flow.takePhoto(BACK);
    await flush();
    releases[1]();
    await flush();
    expect(flow.getState().surface).toBe('denied');
    releases[0]();
    expect(await first).toBeNull();
    expect(flow.getState()).toMatchObject({ surface: 'denied', pendingTake: true });
    flow.notNow();
    expect(await second).toBeNull();
  });
});

describe('CameraAccessFlow: checks and lifetime', () => {
  it('a slow older check cannot overwrite a newer one', async () => {
    const { flow, permissions } = setup(DENIED);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const realCheck = permissions.check.bind(permissions);
    permissions.check = async () => {
      const result = await realCheck();
      if (result.status === 'denied') await gate;
      return result;
    };
    const slow = flow.check();
    permissions.current = GRANTED;
    await flow.check();
    release();
    await slow;
    expect(flow.getState().permission).toEqual(GRANTED);
  });

  it('notifies subscribers and stops after dispose', async () => {
    const { flow } = setup(DENIED);
    const listener = jest.fn();
    const unsubscribe = flow.subscribe(listener);
    await flow.check();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await flow.check();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('dispose ends a waiting tap and ignores late results', async () => {
    const { flow, permissions, picks } = setup(UNDETERMINED);
    const taking = flow.takePhoto(FRONT);
    await flush();
    let answer!: (p: CameraPermission) => void;
    permissions.requests.push(() => new Promise((r) => (answer = r)));
    const allowing = flow.allow();
    flow.dispose();
    expect(await taking).toBeNull();
    answer(GRANTED);
    await allowing;
    await new Promise((r) => setTimeout(r, 60));
    expect(picks).toEqual([]);
  });

  it('start after dispose works again (Strict Mode remount)', async () => {
    const { flow, picks } = setup(GRANTED);
    flow.dispose();
    expect(await flow.takePhoto(FRONT)).toBeNull();
    flow.start();
    expect(await flow.takePhoto(FRONT)).toBe('draft-1');
    expect(picks).toHaveLength(1);
  });

  it('uses the latest host after setHost', async () => {
    const { flow } = setup(GRANTED);
    flow.setHost({ pick: async () => ({ id: 'from-new-host' }), defaultTarget: () => FRONT });
    expect(await flow.takePhoto(FRONT)).toBe('from-new-host');
  });

  it('ignores Allow and library with nothing on screen', async () => {
    const { flow, permissions, picks } = setup(UNDETERMINED);
    await flow.allow();
    flow.chooseLibrary();
    expect(permissions.requestCalls).toBe(0);
    expect(picks).toEqual([]);
  });
});
