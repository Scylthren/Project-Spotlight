/**
 * Tests ExpoPhotoPicker against a fake expo-image-picker (the native module is
 * not available in Jest). jest.mock is hoisted above the import by babel-jest.
 */
import { ExpoPhotoPicker, multiSelectOptions } from './expo-photo-picker';

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

describe('ExpoPhotoPicker.pickMany', () => {
  it('opens the library with multi-select, the limit, and selection order, without camera permission', async () => {
    mockPicker.result = {
      canceled: false,
      assets: [
        { ...ASSET, assetId: 'A' },
        { uri: 'file:///cache/ImagePicker/B.jpg', width: 3024, height: 4032, assetId: null },
      ],
    };
    expect(await new ExpoPhotoPicker().pickMany(20)).toEqual({
      status: 'picked',
      photos: [
        { ...ASSET, assetId: 'A' },
        { uri: 'file:///cache/ImagePicker/B.jpg', width: 3024, height: 4032, assetId: null },
      ],
    });
    expect(mockPicker.calls).toEqual([
      { fn: 'library', options: { ...OPTIONS, allowsMultipleSelection: true, selectionLimit: 20, orderedSelection: true } },
    ]);
    expect(multiSelectOptions(20).selectionLimit).toBe(20);
  });

  it('keeps every returned photo even beyond the limit (the import enforces it), with a missing file as an empty uri', async () => {
    const assets = Array.from({ length: 22 }, (_, i) => ({ uri: `file:///cache/${i}.jpg`, width: 1, height: 1 }));
    mockPicker.result = { canceled: false, assets: [...assets, { width: 1, height: 1 }] };
    const result = await new ExpoPhotoPicker().pickMany(20);
    expect(result.status === 'picked' && result.photos.length).toBe(23);
    expect(result.status === 'picked' && result.photos[22]).toEqual({ uri: '', width: 1, height: 1, assetId: null });
  });

  it('reports a cancel, an empty result, and a thrown error (e.g. an iCloud download that failed)', async () => {
    mockPicker.result = { canceled: true, assets: null };
    expect(await new ExpoPhotoPicker().pickMany(20)).toEqual({ status: 'cancelled' });
    mockPicker.result = { canceled: false, assets: [] };
    expect(await new ExpoPhotoPicker().pickMany(20)).toEqual({ status: 'cancelled' });
    mockPicker.fail = new Error('The operation could not be completed');
    expect(await new ExpoPhotoPicker().pickMany(20)).toEqual({
      status: 'error',
      message: 'The operation could not be completed',
    });
  });
});
