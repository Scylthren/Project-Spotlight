/**
 * Tests ExpoCameraPermissions against a fake expo-image-picker and Linking
 * (the native modules are not available in Jest).
 */
import { Linking } from 'react-native';

import { ExpoCameraPermissions, toCameraPermission } from './expo-camera-permissions';

type Response = { status: string; granted: boolean; canAskAgain: boolean; expires: 'never' };

const mockOs = {
  get: [] as (Response | Error)[],
  request: [] as (Response | Error)[],
  settings: 0,
  settingsFail: null as Error | null,
};

function mockNext(queue: (Response | Error)[]): Response {
  const value = queue.shift();
  if (!value) throw new Error('nothing queued');
  if (value instanceof Error) throw value;
  return value;
}

jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: async () => mockNext(mockOs.get),
  requestCameraPermissionsAsync: async () => mockNext(mockOs.request),
}));

const openSettings = jest.spyOn(Linking, 'openSettings').mockImplementation(async () => {
  mockOs.settings++;
  if (mockOs.settingsFail) throw mockOs.settingsFail;
});
afterAll(() => openSettings.mockRestore());

const response = (status: string, granted: boolean, canAskAgain: boolean): Response => ({
  status,
  granted,
  canAskAgain,
  expires: 'never',
});

beforeEach(() => {
  mockOs.get = [];
  mockOs.request = [];
  mockOs.settings = 0;
  mockOs.settingsFail = null;
});

describe('toCameraPermission', () => {
  it('maps the three OS states', () => {
    expect(toCameraPermission(response('granted', true, true) as never)).toEqual({ status: 'granted', canAskAgain: true });
    expect(toCameraPermission(response('undetermined', false, true) as never)).toEqual({
      status: 'undetermined',
      canAskAgain: true,
    });
    expect(toCameraPermission(response('denied', false, false) as never)).toEqual({ status: 'denied', canAskAgain: false });
  });

  it('never reports granted unless `granted` is true', () => {
    expect(toCameraPermission(response('granted', false, true) as never).status).toBe('denied');
  });
});

describe('ExpoCameraPermissions', () => {
  const permissions = new ExpoCameraPermissions();

  it('checks without prompting', async () => {
    mockOs.get.push(response('denied', false, false));
    expect(await permissions.check()).toEqual({ status: 'denied', canAskAgain: false });
    expect(mockOs.request).toHaveLength(0);
  });

  it('a failed check falls back to undetermined (the real prompt decides)', async () => {
    mockOs.get.push(new Error('no module'));
    expect(await permissions.check()).toEqual({ status: 'undetermined', canAskAgain: true });
  });

  it('requests through the system prompt', async () => {
    mockOs.request.push(response('granted', true, true));
    expect(await permissions.request()).toEqual({ status: 'granted', canAskAgain: true });
  });

  it('a failed request falls back to a check, then to denied-but-askable', async () => {
    mockOs.request.push(new Error('boom'));
    mockOs.get.push(response('undetermined', false, true));
    expect(await permissions.request()).toEqual({ status: 'undetermined', canAskAgain: true });
    mockOs.request.push(new Error('boom'));
    mockOs.get.push(new Error('boom again'));
    expect(await permissions.request()).toEqual({ status: 'denied', canAskAgain: true });
  });

  it('opens Settings and swallows a failure', async () => {
    await permissions.openSettings();
    expect(mockOs.settings).toBe(1);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockOs.settingsFail = new Error('no settings');
    await expect(permissions.openSettings()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
