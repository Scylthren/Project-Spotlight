/**
 * Tests ExpoImageProcessor against a fake expo-image-manipulator (the native
 * module is not available in Jest). Checks which transforms and save options
 * it uses, and that it frees native objects. jest.mock is hoisted by babel-jest.
 */
import { ExpoImageProcessor } from './expo-image-processor';

interface FakeImage {
  width: number;
  height: number;
  released: boolean;
  release(): void;
  saveAsync(options: unknown): Promise<{ uri: string; width: number; height: number }>;
}

const mockManip = {
  /** Size of the image the next `manipulate(uri)` loads. */
  sourceSize: { width: 4032, height: 3024 },
  manipulateCalls: [] as unknown[],
  resizeCalls: [] as unknown[],
  saveCalls: [] as unknown[],
  released: [] as string[],
  failRender: false,
  failSave: false,
};

jest.mock('expo-image-manipulator', () => {
  let n = 0;
  function makeImage(width: number, height: number): FakeImage {
    const id = `image${++n}`;
    return {
      width,
      height,
      released: false,
      release() {
        mockManip.released.push(id);
      },
      async saveAsync(options: unknown) {
        mockManip.saveCalls.push(options);
        if (mockManip.failSave) throw new Error('write failed');
        return { uri: `file:///cache/ImageManipulator/${id}.jpg`, width, height };
      },
    };
  }
  function makeContext(source: string | FakeImage) {
    let size = typeof source === 'string' ? { ...mockManip.sourceSize } : { width: source.width, height: source.height };
    const id = `context${++n}`;
    const context = {
      resize(target: { width: number; height: number }) {
        mockManip.resizeCalls.push(target);
        size = target;
        return context;
      },
      async renderAsync() {
        if (mockManip.failRender) throw new Error('cannot decode image');
        return makeImage(size.width, size.height);
      },
      release() {
        mockManip.released.push(id);
      },
    };
    return context;
  }
  return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
    ImageManipulator: {
      manipulate(source: string | FakeImage) {
        mockManip.manipulateCalls.push(typeof source === 'string' ? source : 'image-ref');
        return makeContext(source);
      },
    },
  };
});

beforeEach(() => {
  mockManip.sourceSize = { width: 4032, height: 3024 };
  mockManip.manipulateCalls = [];
  mockManip.resizeCalls = [];
  mockManip.saveCalls = [];
  mockManip.released = [];
  mockManip.failRender = false;
  mockManip.failSave = false;
});

describe('ExpoImageProcessor', () => {
  it('downscales a large photo to a 1600px longest edge and saves JPEG at 0.8', async () => {
    const result = await new ExpoImageProcessor().prepareForStorage('file:///cache/ImagePicker/IMG.HEIC');

    expect(mockManip.manipulateCalls).toEqual(['file:///cache/ImagePicker/IMG.HEIC', 'image-ref']);
    expect(mockManip.resizeCalls).toEqual([{ width: 1600, height: 1200 }]);
    expect(mockManip.saveCalls).toEqual([{ format: 'jpeg', compress: 0.8 }]);
    expect(result).toEqual({ uri: expect.stringMatching(/\.jpg$/), width: 1600, height: 1200 });
  });

  it('handles portrait photos', async () => {
    mockManip.sourceSize = { width: 3024, height: 4032 };
    const result = await new ExpoImageProcessor().prepareForStorage('file:///p.jpg');
    expect(mockManip.resizeCalls).toEqual([{ width: 1200, height: 1600 }]);
    expect(result).toMatchObject({ width: 1200, height: 1600 });
  });

  it('never upscales: a small photo is only re-encoded', async () => {
    mockManip.sourceSize = { width: 1600, height: 900 };
    const result = await new ExpoImageProcessor().prepareForStorage('file:///small.png');
    expect(mockManip.resizeCalls).toEqual([]);
    expect(mockManip.manipulateCalls).toEqual(['file:///small.png']);
    expect(mockManip.saveCalls).toEqual([{ format: 'jpeg', compress: 0.8 }]);
    expect(result).toMatchObject({ width: 1600, height: 900 });
  });

  it('releases every native object it created', async () => {
    await new ExpoImageProcessor().prepareForStorage('file:///big.jpg');
    // load context, loaded image, resize context, resized image
    expect(mockManip.released).toHaveLength(4);
  });

  it('rejects and still releases if the image cannot be decoded', async () => {
    mockManip.failRender = true;
    await expect(new ExpoImageProcessor().prepareForStorage('file:///bad.jpg')).rejects.toThrow('cannot decode');
    expect(mockManip.saveCalls).toEqual([]);
    expect(mockManip.released).toHaveLength(1);
  });

  it('rejects if writing the JPEG fails', async () => {
    mockManip.failSave = true;
    await expect(new ExpoImageProcessor().prepareForStorage('file:///big.jpg')).rejects.toThrow('write failed');
    expect(mockManip.released).toHaveLength(4);
  });
});
