import * as Location from 'expo-location';

import { ExpoLocationProvider, LAST_KNOWN_MAX_AGE_MS, toLocationPermission } from './expo-location-provider';
import { MockLocationProvider } from './location-provider';

jest.mock('expo-location', () => ({
  Accuracy: { Low: 2 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}));

const mocked = Location as jest.Mocked<typeof Location>;
const granted = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' } as unknown as Location.LocationPermissionResponse;
const fixAt = (latitude: number, longitude: number) => ({ coords: { latitude, longitude, accuracy: 5 }, timestamp: 0 }) as unknown as Location.LocationObject;

beforeEach(() => {
  jest.resetAllMocks();
  mocked.getForegroundPermissionsAsync.mockResolvedValue(granted);
  mocked.hasServicesEnabledAsync.mockResolvedValue(true);
  mocked.getCurrentPositionAsync.mockResolvedValue(fixAt(51.507351, -0.127758));
  mocked.getLastKnownPositionAsync.mockResolvedValue(null);
});

describe('ExpoLocationProvider', () => {
  it('rounds a fresh low-accuracy fix to 0.1 degree before returning it', async () => {
    const outcome = await new ExpoLocationProvider().currentPosition();
    expect(outcome).toEqual({ ok: true, position: { lat: 51.5, lon: -0.1 }, source: 'current' });
    expect(mocked.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Location.Accuracy.Low });
    expect(JSON.stringify(outcome)).not.toContain('51.507');
  });

  it('never prompts: without permission it is not-allowed and asks for no fix', async () => {
    mocked.getForegroundPermissionsAsync.mockResolvedValue({ ...granted, granted: false, status: 'denied' } as never);
    expect(await new ExpoLocationProvider().currentPosition()).toEqual({ ok: false, problem: 'not-allowed' });
    expect(mocked.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mocked.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('reports location services off', async () => {
    mocked.hasServicesEnabledAsync.mockResolvedValue(false);
    expect(await new ExpoLocationProvider().currentPosition()).toEqual({ ok: false, problem: 'services-off' });
  });

  it('falls back to the last known position (rounded) when no fix comes in time, then to unavailable', async () => {
    jest.useFakeTimers();
    try {
      mocked.getCurrentPositionAsync.mockReturnValue(new Promise(() => undefined));
      mocked.getLastKnownPositionAsync.mockResolvedValue(fixAt(48.85661, 2.35222));
      const pending = new ExpoLocationProvider().currentPosition({ timeoutMs: 1000 });
      await jest.advanceTimersByTimeAsync(1000);
      expect(await pending).toEqual({ ok: true, position: { lat: 48.9, lon: 2.4 }, source: 'last-known' });
      expect(mocked.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: LAST_KNOWN_MAX_AGE_MS });

      mocked.getLastKnownPositionAsync.mockResolvedValue(null);
      const none = new ExpoLocationProvider().currentPosition({ timeoutMs: 1000 });
      await jest.advanceTimersByTimeAsync(1000);
      expect(await none).toEqual({ ok: false, problem: 'unavailable' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('falls back when the fix fails outright', async () => {
    mocked.getCurrentPositionAsync.mockRejectedValue(new Error('Location unavailable'));
    mocked.getLastKnownPositionAsync.mockRejectedValue(new Error('none'));
    expect(await new ExpoLocationProvider().currentPosition()).toEqual({ ok: false, problem: 'unavailable' });
  });

  it('maps permissions and survives failing checks', async () => {
    expect(toLocationPermission(granted)).toEqual({ status: 'granted', canAskAgain: true });
    expect(toLocationPermission({ ...granted, granted: false, status: 'undetermined' } as never)).toEqual({ status: 'undetermined', canAskAgain: true });
    expect(toLocationPermission({ ...granted, granted: false, status: 'denied', canAskAgain: false } as never)).toEqual({ status: 'denied', canAskAgain: false });
    mocked.getForegroundPermissionsAsync.mockRejectedValue(new Error('x'));
    expect(await new ExpoLocationProvider().permission()).toEqual({ status: 'undetermined', canAskAgain: true });
    mocked.requestForegroundPermissionsAsync.mockRejectedValue(new Error('x'));
    expect(await new ExpoLocationProvider().requestPermission()).toEqual({ status: 'denied', canAskAgain: true });
    mocked.requestForegroundPermissionsAsync.mockResolvedValue(granted);
    expect(await new ExpoLocationProvider().requestPermission()).toEqual({ status: 'granted', canAskAgain: true });
  });
});

describe('MockLocationProvider', () => {
  it('rounds its fix too, and follows its permission', async () => {
    const mock = new MockLocationProvider({ status: 'undetermined', canAskAgain: true });
    expect(await mock.currentPosition()).toEqual({ ok: false, problem: 'not-allowed' });
    expect(await mock.requestPermission()).toEqual({ status: 'granted', canAskAgain: true });
    expect(await mock.currentPosition()).toEqual({ ok: true, position: { lat: 51.5, lon: -0.1 }, source: 'current' });
    mock.fix = 'services-off';
    expect(await mock.currentPosition()).toEqual({ ok: false, problem: 'services-off' });
    mock.current = { status: 'denied', canAskAgain: false };
    expect(await mock.requestPermission()).toEqual({ status: 'denied', canAskAgain: false });
  });
});
