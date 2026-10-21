/**
 * Tests ExpoPhotoPicker against a fake expo-image-picker (the native module is
 * not available in Jest). jest.mock is hoisted above the import by babel-jest.
 */
import { ExpoPhotoPicker } from './expo-photo-picker';

const ASSET = { uri: 'file:///cache/ImagePicker/IMG.jpg', width: 4032, height: 3024 };

const mockPicker = {
  permission: { granted: true, canAskAgain: true },
  result: { canceled: false, assets: [ASSET] } as { canceled: boolean; assets: unknown[] | null },
  calls: [] as { fn: string; options?: unknown }[],
  fail: null as Error | null,
};

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: async () => {
    mockPicker.calls.push({ fn: 'requestCamera' });
    return mockPicker.permission;
  },
  launchCameraAsync: async (options: unknown) => {
    mockPicker.calls.push({ fn: 'camera', options });
    if (mockPicker.fail) throw mockPicker.fail;
    return mockPicker.result;
  },
  launchImageLibraryAsync: async (options: unknown) => {
    mockPicker.calls.push({ fn: 'library', options });
    if (mockPicker.fail) throw mockPicker.fail;
    return mockPicker.result;
  },
}));

beforeEach(() => {
  mockPicker.permission = { granted: true, canAskAgain: true };
  mockPicker.result = { canceled: false, assets: [ASSET] };
  mockPicker.calls = [];
  mockPicker.fail = null;
});

const OPTIONS = { mediaTypes: ['images'], allowsMultipleSelection: false, exif: false };

describe('ExpoPhotoPicker', () => {
  it('opens the library without asking for camera permission or re-compressing', async () => {
    expect(await new ExpoPhotoPicker().pick('library')).toEqual({ status: 'picked', photo: ASSET });
    expect(mockPicker.calls).toEqual([{ fn: 'library', options: OPTIONS }]);
  });

  it('asks for camera permission, then opens the camera', async () => {
    expect(await new ExpoPhotoPicker().pick('camera')).toEqual({ status: 'picked', photo: ASSET });
    expect(mockPicker.calls).toEqual([{ fn: 'requestCamera' }, { fn: 'camera', options: OPTIONS }]);
  });

  it('does not open the camera when permission is denied, and says whether it can ask again', async () => {
    mockPicker.permission = { granted: false, canAskAgain: false };
    expect(await new ExpoPhotoPicker().pick('camera')).toEqual({ status: 'permission-denied', canAskAgain: false });
    mockPicker.permission = { granted: false, canAskAgain: true };
    expect(await new ExpoPhotoPicker().pick('camera')).toEqual({ status: 'permission-denied', canAskAgain: true });
    expect(mockPicker.calls.map((c) => c.fn)).toEqual(['requestCamera', 'requestCamera']);
  });

  it('reports a cancel from either source', async () => {
    mockPicker.result = { canceled: true, assets: null };
    expect(await new ExpoPhotoPicker().pick('camera')).toEqual({ status: 'cancelled' });
    expect(await new ExpoPhotoPicker().pick('library')).toEqual({ status: 'cancelled' });
  });

  it('turns a thrown error (e.g. no camera on a simulator) into an error result', async () => {
    mockPicker.fail = new Error('Camera not available on simulator');
    expect(await new ExpoPhotoPicker().pick('camera')).toEqual({
      status: 'error',
      message: 'Camera not available on simulator',
    });
  });
});
