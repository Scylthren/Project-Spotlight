/**
 * Tests LocalGarmentIsolator against a fake expo-image-manipulator and
 * expo-file-system (native modules are not available in Jest) and the real
 * jpeg-js decoder. The fake encoder writes real JPEG bytes (jpeg-js encode)
 * of a synthetic photo. jest.mock is hoisted by babel-jest.
 */
import { decode, encode } from 'jpeg-js';

import { garmentPhoto, paintImage, rgb } from '@/core/testing/synthetic-images';

import { ISOLATION_IMAGE_EDGE, LocalGarmentIsolator } from './local-garment-isolator';
import type { TemporaryFiles } from './temporary-files';

const mockManip = {
  sourceSize: { width: 3024, height: 4032 },
  resizeCalls: [] as unknown[],
  saveCalls: [] as unknown[],
  created: 0,
  released: 0,
  failRender: false,
  /** JPEG bytes the fake encoder writes, by image size "WxH". */
  jpegFor: (() => new Uint8Array(0)) as (width: number, height: number) => Uint8Array,
};

const mockFs = { files: new Map<string, Uint8Array>() };

jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    async bytes() {
      const data = mockFs.files.get(this.uri);
      if (!data) throw new Error(`ENOENT ${this.uri}`);
      return data.slice();
    }
  },
  Paths: { cache: { uri: 'file:///cache/' } },
}));

jest.mock('expo-image-manipulator', () => {
  function makeImage(width: number, height: number) {
    mockManip.created += 1;
    return {
      width,
      height,
      release() {
        mockManip.released += 1;
      },
      async saveAsync(options: unknown) {
        mockManip.saveCalls.push(options);
        const uri = `file:///cache/manip-${mockManip.saveCalls.length}.jpg`;
        mockFs.files.set(uri, mockManip.jpegFor(width, height));
        return { uri, width, height };
      },
    };
  }
  function context(size: { width: number; height: number }) {
    let next = size;
    mockManip.created += 1;
    return {
      resize(target: { width: number; height: number }) {
        mockManip.resizeCalls.push(target);
        next = target;
        return this;
      },
      async renderAsync() {
        if (mockManip.failRender) throw new Error('render failed');
        return makeImage(next.width, next.height);
      },
      release() {
        mockManip.released += 1;
      },
    };
  }
  return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
    ImageManipulator: {
      manipulate(source: string | { width: number; height: number }) {
        return context(typeof source === 'string' ? mockManip.sourceSize : source);
      },
    },
  };
});

class RecordingFiles implements TemporaryFiles {
  readonly discarded: string[] = [];
  async discard(uri: string) {
    this.discarded.push(uri);
    mockFs.files.delete(uri);
  }
}

/** A navy garment in the middle of a white frame of any size, as JPEG bytes. */
function photoJpeg(width: number, height: number): Uint8Array {
  const box = {
    x0: Math.round(width * 0.25),
    y0: Math.round(height * 0.2),
    x1: Math.round(width * 0.75),
    y1: Math.round(height * 0.8),
  };
  const image = garmentPhoto(() => rgb('#202A60'), () => rgb('#F4F4F2'), box, width, height);
  return new Uint8Array(encode({ width, height, data: image.data }, 90).data);
}

beforeEach(() => {
  mockManip.sourceSize = { width: 3024, height: 4032 };
  mockManip.resizeCalls = [];
  mockManip.saveCalls = [];
  mockManip.created = 0;
  mockManip.released = 0;
  mockManip.failRender = false;
  mockManip.jpegFor = photoJpeg;
  mockFs.files.clear();
});

describe('LocalGarmentIsolator', () => {
  it('scales the photo to a small JPEG, decodes it, and finds the garment', async () => {
    const files = new RecordingFiles();
    const result = await new LocalGarmentIsolator(files).isolate('file:///cache/picked.jpg');
    if (!result.ok) throw new Error(result.reason);
    expect(mockManip.resizeCalls).toEqual([{ width: 72, height: ISOLATION_IMAGE_EDGE }]);
    expect(mockManip.saveCalls).toEqual([{ format: 'jpeg', compress: 0.9 }]);
    const { image, mask, confidence } = result.garment;
    expect([image.width, image.height]).toEqual([72, 96]);
    expect(image.data).toBeInstanceOf(Uint8Array);
    expect(image.data.length).toBe(72 * 96 * 4);
    expect(mask.length).toBe(72 * 96);
    expect(confidence).toBeGreaterThan(0.8);
    // Its temporary JPEG is deleted and every native object released.
    expect(files.discarded).toEqual(['file:///cache/manip-1.jpg']);
    expect(mockFs.files.size).toBe(0);
    expect(mockManip.released).toBe(mockManip.created);
  });

  it('decodes without a global Buffer (Hermes has none)', async () => {
    const bytes = photoJpeg(72, 96); // the encoder needs Buffer; the decoder must not
    mockManip.jpegFor = () => bytes;
    const g = globalThis as { Buffer?: unknown };
    const saved = g.Buffer;
    delete g.Buffer;
    try {
      // Sanity check that Buffer is really gone for jpeg-js: its Buffer path fails.
      expect(() => decode(bytes)).toThrow(/Buffer is not globally defined/);
      const result = await new LocalGarmentIsolator(new RecordingFiles()).isolate('file:///cache/picked.jpg');
      expect(result.ok).toBe(true);
    } finally {
      g.Buffer = saved;
    }
  });

  it('does not resize a photo that is already small', async () => {
    mockManip.sourceSize = { width: 80, height: 60 };
    const result = await new LocalGarmentIsolator(new RecordingFiles()).isolate('file:///cache/small.jpg');
    expect(mockManip.resizeCalls).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('reports no garment for a photo of only backdrop', async () => {
    mockManip.jpegFor = (w, h) =>
      new Uint8Array(encode({ width: w, height: h, data: paintImage(w, h, () => rgb('#F4F4F2')).data }, 90).data);
    const files = new RecordingFiles();
    expect(await new LocalGarmentIsolator(files).isolate('file:///cache/wall.jpg')).toEqual({
      ok: false,
      reason: 'no_garment',
    });
    expect(files.discarded).toHaveLength(1);
  });

  it('rejects on bytes that are not a JPEG, still cleaning up', async () => {
    mockManip.jpegFor = () => new Uint8Array([1, 2, 3, 4]);
    const files = new RecordingFiles();
    await expect(new LocalGarmentIsolator(files).isolate('file:///cache/x.jpg')).rejects.toThrow();
    expect(files.discarded).toEqual(['file:///cache/manip-1.jpg']);
    expect(mockManip.released).toBe(mockManip.created);
  });

  it('rejects when the photo cannot be loaded, writing nothing', async () => {
    mockManip.failRender = true;
    const files = new RecordingFiles();
    await expect(new LocalGarmentIsolator(files).isolate('file:///cache/x.jpg')).rejects.toThrow('render failed');
    expect(files.discarded).toEqual([]);
    expect(mockManip.released).toBe(mockManip.created);
  });
});
