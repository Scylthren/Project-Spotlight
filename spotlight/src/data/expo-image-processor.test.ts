/**
 * Tests ExpoImageProcessor against a fake expo-image-manipulator and a fake
 * expo-file-system (the native modules are not available in Jest). Checks
 * which transforms and save options it uses, that it frees native objects,
 * and that the file it returns has its metadata stripped. jest.mock is
 * hoisted by babel-jest.
 */
import {
  ascii,
  cameraLikeJpeg,
  concat,
  exifSegment,
  iccSegment,
  segment,
  TINY_JPEG,
  withSegmentsAfterSoi,
  xmpSegment,
} from '@/core/testing/jpeg-fixtures';
import * as jpegMetadata from '@/core/jpeg-metadata';

import { ExpoImageProcessor } from './expo-image-processor';
import type { TemporaryFiles } from './temporary-files';

interface FakeImage {
  width: number;
  height: number;
  /** Transforms applied since loading, e.g. ['rotate 90']. */
  transforms: string[];
  released: boolean;
  release(): void;
  saveAsync(options: unknown): Promise<{ uri: string; width: number; height: number }>;
}

const mockManip = {
  /** Size of the image the next `manipulate(uri)` loads. */
  sourceSize: { width: 4032, height: 3024 },
  manipulateCalls: [] as unknown[],
  resizeCalls: [] as unknown[],
  transformCalls: [] as string[],
  saveCalls: [] as unknown[],
  released: [] as string[],
  failRender: false,
  failSave: false,
  /** Bytes the fake JPEG encoder writes for an image. */
  encode: (() => new Uint8Array(0)) as (image: FakeImage) => Uint8Array,
};

/** Fake file system: uri -> contents. */
const mockFs = {
  files: new Map<string, Uint8Array>(),
  failRead: false,
  failWrite: false,
  /** Simulates a write that reports success but leaves the old contents. */
  dropWrites: false,
};

jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return mockFs.files.has(this.uri);
    }
    async bytes() {
      if (mockFs.failRead) throw new Error('read failed');
      const data = mockFs.files.get(this.uri);
      if (!data) throw new Error(`ENOENT ${this.uri}`);
      return data.slice();
    }
    write(content: Uint8Array) {
      if (mockFs.failWrite) throw new Error('disk full');
      if (!mockFs.dropWrites) mockFs.files.set(this.uri, content.slice());
    }
    delete() {
      mockFs.files.delete(this.uri);
    }
  }
  return { File, Paths: { cache: { uri: 'file:///cache/' } } };
});

jest.mock('@/core/jpeg-metadata', () => {
  const actual = jest.requireActual('@/core/jpeg-metadata');
  return { ...actual, stripJpegMetadata: jest.fn(actual.stripJpegMetadata) };
});

jest.mock('expo-image-manipulator', () => {
  let n = 0;
  function makeImage(width: number, height: number, transforms: string[]): FakeImage {
    const id = `image${++n}`;
    const image: FakeImage = {
      width,
      height,
      transforms,
      released: false,
      release() {
        mockManip.released.push(id);
      },
      async saveAsync(options: unknown) {
        mockManip.saveCalls.push(options);
        if (mockManip.failSave) throw new Error('write failed');
        const uri = `file:///cache/ImageManipulator/${id}.jpg`;
        mockFs.files.set(uri, mockManip.encode(image));
        return { uri, width, height };
      },
    };
    return image;
  }
  function makeContext(source: string | FakeImage) {
    let size = typeof source === 'string' ? { ...mockManip.sourceSize } : { width: source.width, height: source.height };
    const transforms = typeof source === 'string' ? [] : [...source.transforms];
    const id = `context${++n}`;
    const context = {
      resize(target: { width: number; height: number }) {
        mockManip.resizeCalls.push(target);
        size = target;
        return context;
      },
      rotate(degrees: number) {
        mockManip.transformCalls.push(`rotate ${degrees}`);
        transforms.push(`rotate ${degrees}`);
        if (degrees % 180 !== 0) size = { width: size.height, height: size.width };
        return context;
      },
      flip(type: string) {
        mockManip.transformCalls.push(`flip ${type}`);
        transforms.push(`flip ${type}`);
        return context;
      },
      async renderAsync() {
        if (mockManip.failRender) throw new Error('cannot decode image');
        return makeImage(size.width, size.height, [...transforms]);
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

/** Encoder output carrying Exif GPS, XMP GPS, and ICC: the worst case the stripper must handle. */
const WITH_LOCATION = withSegmentsAfterSoi(
  TINY_JPEG,
  exifSegment({ order: 'II', gps: true, orientation: 1 }),
  xmpSegment(true),
  iccSegment(),
);
const CLEAN_WITH_ICC = withSegmentsAfterSoi(TINY_JPEG, iccSegment());

/** Fake cache cleanup that really deletes from the fake file system. */
class FakeTemporaryFiles implements TemporaryFiles {
  readonly discarded: string[] = [];
  async discard(uri: string): Promise<void> {
    this.discarded.push(uri);
    mockFs.files.delete(uri);
  }
}

const strip = jpegMetadata.stripJpegMetadata as jest.MockedFunction<typeof jpegMetadata.stripJpegMetadata>;

beforeEach(() => {
  mockManip.sourceSize = { width: 4032, height: 3024 };
  mockManip.manipulateCalls = [];
  mockManip.resizeCalls = [];
  mockManip.saveCalls = [];
  mockManip.released = [];
  mockManip.failRender = false;
  mockManip.failSave = false;
  mockManip.transformCalls = [];
  mockManip.encode = () => WITH_LOCATION;
  mockFs.files = new Map();
  mockFs.failRead = false;
  mockFs.failWrite = false;
  mockFs.dropWrites = false;
  strip.mockClear();
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

describe('ExpoImageProcessor metadata stripping', () => {
  it('overwrites the saved JPEG with a stripped copy: no Exif, GPS, or XMP; ICC kept', async () => {
    const result = await new ExpoImageProcessor(new FakeTemporaryFiles()).prepareForStorage('file:///p.jpg');

    expect(jpegMetadata.hasLocationMetadata(WITH_LOCATION)).toBe(true);
    const onDisk = mockFs.files.get(result.uri);
    expect(onDisk).toEqual(CLEAN_WITH_ICC);
    const report = jpegMetadata.findJpegMetadata(onDisk!);
    expect(report).toMatchObject({ exif: false, gps: false, xmp: false, icc: true });
    expect(jpegMetadata.hasLocationMetadata(onDisk!)).toBe(false);
    expect([...mockFs.files.keys()]).toEqual([result.uri]);
  });

  it('cleans a camera-like file, including a second image appended after EOI', async () => {
    // An encoder that kept everything a camera writes, with an upright Orientation 1.
    mockManip.encode = () => cameraLikeJpeg(1);
    const result = await new ExpoImageProcessor(new FakeTemporaryFiles()).prepareForStorage('file:///p.jpg');
    const onDisk = mockFs.files.get(result.uri)!;
    expect(onDisk).toEqual(CLEAN_WITH_ICC);
    expect(jpegMetadata.isMetadataFree(jpegMetadata.findJpegMetadata(onDisk))).toBe(true);
    expect(jpegMetadata.hasLocationMetadata(onDisk)).toBe(false);
    expect([...mockFs.files.keys()]).toEqual([result.uri]);
  });

  it.each([2, 3, 4, 5, 6, 7, 8, 0, 9])(
    'fails, rotates nothing, and leaves no files if the saved JPEG still declares Orientation %i',
    async (orientation) => {
      mockManip.sourceSize = { width: 1600, height: 1200 };
      mockManip.encode = () => withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order: 'MM', gps: true, orientation }));
      const temporaryFiles = new FakeTemporaryFiles();

      await expect(new ExpoImageProcessor(temporaryFiles).prepareForStorage('file:///p.jpg')).rejects.toThrow(
        new RegExp(`orientation ${orientation} is not upright`),
      );

      expect(mockManip.transformCalls).toEqual([]);
      expect(mockManip.saveCalls).toHaveLength(1);
      expect(strip).not.toHaveBeenCalled();
      expect(mockFs.files.size).toBe(0);
      expect(temporaryFiles.discarded).toHaveLength(1);
      // load context and loaded image only: no rotate context was created.
      expect(mockManip.released).toHaveLength(2);
    },
  );

  it('fails if the camera-like output keeps its sideways Orientation 6', async () => {
    mockManip.encode = () => cameraLikeJpeg();
    await expect(new ExpoImageProcessor(new FakeTemporaryFiles()).prepareForStorage('file:///p.jpg')).rejects.toThrow(
      /orientation 6/,
    );
    expect(mockFs.files.size).toBe(0);
  });

  it('fails if the saved JPEG has Exif too broken to read its orientation', async () => {
    const broken = segment(0xe1, concat(ascii('Exif\0\0'), ascii('XX'), new Uint8Array([0, 42, 0, 0, 0, 8])));
    mockManip.encode = () => withSegmentsAfterSoi(TINY_JPEG, broken);
    await expect(new ExpoImageProcessor(new FakeTemporaryFiles()).prepareForStorage('file:///p.jpg')).rejects.toThrow(
      /orientation is unknown/,
    );
    expect(mockFs.files.size).toBe(0);
  });

  it('does not re-save for Orientation 1 or no Orientation', async () => {
    for (const encoded of [WITH_LOCATION, TINY_JPEG]) {
      mockManip.saveCalls = [];
      mockManip.encode = () => encoded;
      await new ExpoImageProcessor(new FakeTemporaryFiles()).prepareForStorage('file:///p.jpg');
      expect(mockManip.saveCalls).toHaveLength(1);
      expect(mockManip.transformCalls).toEqual([]);
    }
  });

  it('fails and leaves no files if the encoder keeps a sideways orientation', async () => {
    mockManip.encode = () => withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order: 'II', orientation: 6 }));
    await expect(new ExpoImageProcessor(new FakeTemporaryFiles()).prepareForStorage('file:///p.jpg')).rejects.toThrow(
      /orientation/,
    );
    expect(mockFs.files.size).toBe(0);
  });

  it('fails and leaves no files if the encoder output is not a JPEG', async () => {
    mockManip.encode = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    await expect(new ExpoImageProcessor(new FakeTemporaryFiles()).prepareForStorage('file:///p.jpg')).rejects.toThrow(
      jpegMetadata.JpegFormatError,
    );
    expect(mockFs.files.size).toBe(0);
    expect(mockManip.released).toHaveLength(4);
  });

  it('fails and leaves no files if reading the saved JPEG fails', async () => {
    mockFs.failRead = true;
    await expect(new ExpoImageProcessor(new FakeTemporaryFiles()).prepareForStorage('file:///p.jpg')).rejects.toThrow(
      'read failed',
    );
    expect(mockFs.files.size).toBe(0);
  });

  it('fails and leaves no files if overwriting with the stripped copy fails', async () => {
    mockFs.failWrite = true;
    await expect(new ExpoImageProcessor(new FakeTemporaryFiles()).prepareForStorage('file:///p.jpg')).rejects.toThrow(
      'disk full',
    );
    expect(mockFs.files.size).toBe(0);
  });

  it('fails if the file on disk is not the stripped copy (write silently lost)', async () => {
    mockFs.dropWrites = true;
    await expect(new ExpoImageProcessor(new FakeTemporaryFiles()).prepareForStorage('file:///p.jpg')).rejects.toThrow(
      /not written correctly/,
    );
    expect(mockFs.files.size).toBe(0);
  });

  it('fails closed if location metadata is somehow still present after stripping', async () => {
    strip.mockImplementationOnce((bytes) => bytes.slice());
    await expect(new ExpoImageProcessor(new FakeTemporaryFiles()).prepareForStorage('file:///p.jpg')).rejects.toThrow(
      /metadata is still present/,
    );
    expect(mockFs.files.size).toBe(0);
  });

  it('cleans up with the real cache rules by default (ExpoTemporaryFiles)', async () => {
    mockFs.dropWrites = true;
    await expect(new ExpoImageProcessor().prepareForStorage('file:///p.jpg')).rejects.toThrow();
    expect(mockFs.files.size).toBe(0);
  });
});
