/**
 * Tagging eval (Gate 2 slice 4): preparing a photo like the app does. The
 * metadata check refuses to send anything that still carries metadata. The
 * sips argument building is tested with a fake `exec`; on macOS the real
 * `sips` also runs (HEIC, PNG, orientation, downscaling, GPS removal).
 */
import { decode, encode } from 'jpeg-js';

import {
  APP_JPEG_QUALITY,
  orientationOps,
  parseSipsSize,
  prepareWithSips,
  PrepareError,
  sipsConvertArgs,
  SIPS,
  stripAndVerify,
  UPLOAD_MAX_EDGE,
  type SipsDeps,
} from '../../../evals/tagging/prepare.ts';
import { findJpegMetadata, hasLocationMetadata, isMetadataFree } from '@/core/jpeg-metadata';
import { cameraLikeJpeg, exifSegment, TINY_JPEG, withSegmentsAfterSoi, xmpSegment } from '@/core/testing/jpeg-fixtures';
import { STORED_IMAGE_JPEG_QUALITY } from '@/data/image-processor';
import { TAG_IMAGE_MAX_EDGE } from '@/data/upload-tag-image-source';
import { makeTempDir, removeDir } from '@/data/testing/temp-dir';
import { fileExists, joinPath, mkdir, readBytes, walkFiles, writeFile } from '@/security/testing/node-files';

const SIZE = { width: 10, height: 10 };

describe('matches the app', () => {
  it('uses the app\'s JPEG quality and tag image edge', () => {
    expect(APP_JPEG_QUALITY).toBe(STORED_IMAGE_JPEG_QUALITY);
    expect(UPLOAD_MAX_EDGE).toBe(TAG_IMAGE_MAX_EDGE);
  });
});

describe('stripAndVerify', () => {
  it('strips a camera-like file (Exif with GPS, XMP with GPS, IPTC, comment, trailing image) and returns sendable bytes', () => {
    const input = cameraLikeJpeg(1);
    expect(hasLocationMetadata(input)).toBe(true);
    const prepared = stripAndVerify(input, SIZE);
    expect(isMetadataFree(findJpegMetadata(prepared.bytes))).toBe(true);
    expect(hasLocationMetadata(prepared.bytes)).toBe(false);
    expect(prepared.base64.startsWith('/9j/')).toBe(true);
    expect(prepared).toMatchObject(SIZE);
  });

  it('refuses to send when metadata survives stripping (a stripper that does nothing)', () => {
    const withGps = withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order: 'II', gps: true }));
    expect(() => stripAndVerify(withGps, SIZE, (bytes) => bytes)).toThrow(
      expect.objectContaining({ code: 'metadata_remains' }) as unknown as Error,
    );
  });

  it('refuses XMP left behind, even without a location', () => {
    const withXmp = withSegmentsAfterSoi(TINY_JPEG, xmpSegment(false));
    expect(() => stripAndVerify(withXmp, SIZE, (bytes) => bytes)).toThrow(PrepareError);
  });

  it('refuses a file that is not a JPEG', () => {
    expect(() => stripAndVerify(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), SIZE)).toThrow(
      expect.objectContaining({ code: 'unreadable' }) as unknown as Error,
    );
  });
});

describe('sips arguments', () => {
  it('converts to JPEG at quality 80 and downscales only over 1024 px, never upscaling', () => {
    expect(sipsConvertArgs('in.heic', 'out.jpg', { width: 3024, height: 4032 }, [])).toEqual([
      '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', '1024', 'in.heic', '--out', 'out.jpg',
    ]);
    expect(sipsConvertArgs('in.png', 'out.jpg', { width: 1024, height: 600 }, [])).toEqual([
      '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', 'in.png', '--out', 'out.jpg',
    ]);
    expect(sipsConvertArgs('in.jpg', 'out.jpg', { width: 300, height: 200 }, ['-r', '90'])).toEqual([
      '-r', '90', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', 'in.jpg', '--out', 'out.jpg',
    ]);
  });

  it('maps every Exif orientation to the operations that make it upright', () => {
    expect([null, 1, 2, 3, 4, 5, 6, 7, 8].map(orientationOps)).toEqual([
      [],
      [],
      ['-f', 'horizontal'],
      ['-r', '180'],
      ['-f', 'vertical'],
      ['-f', 'horizontal', '-r', '90'],
      ['-r', '90'],
      ['-f', 'vertical', '-r', '90'],
      ['-r', '270'],
    ]);
    expect(() => orientationOps(9)).toThrow(PrepareError);
  });

  it('reads the size sips prints', () => {
    expect(parseSipsSize('/x/a.heic\n  pixelWidth: 3024\n  pixelHeight: 4032\n')).toEqual({ width: 3024, height: 4032 });
    expect(() => parseSipsSize('Error: unknown format')).toThrow(PrepareError);
  });
});

/** A fake sips over an in-memory file map. */
function fakeSips(outputs: Uint8Array[], sizes: string[] = ['pixelWidth: 2000\npixelHeight: 1000', 'pixelWidth: 1024\npixelHeight: 512']) {
  const files = new Map<string, Uint8Array>();
  const calls: string[][] = [];
  const removed: string[] = [];
  let converts = 0;
  let sizeCalls = 0;
  const deps: SipsDeps = {
    exec: async (file, args) => {
      expect(file).toBe(SIPS);
      calls.push(args);
      if (args[0] === '-g') return sizes[Math.min(sizeCalls++, sizes.length - 1)];
      const out = args[args.indexOf('--out') + 1];
      files.set(out, outputs[Math.min(converts++, outputs.length - 1)]);
      return '';
    },
    readBytes: async (path) => {
      const bytes = files.get(path);
      if (!bytes) throw new Error('no file');
      return bytes;
    },
    tempPath: (name) => `/tmp/x/${name}`,
    remove: async (path) => {
      removed.push(path);
    },
  };
  return { deps, calls, removed };
}

describe('prepareWithSips (fake sips)', () => {
  it('converts once when the result is upright, and removes its temporary file', async () => {
    const { deps, calls, removed } = fakeSips([cameraLikeJpeg(1)]);
    const prepared = await prepareWithSips('/photos/a.heic', deps);
    expect(calls.map((args) => args[0])).toEqual(['-g', '-s', '-g']);
    expect(calls[1]).toContain('-Z');
    expect(prepared).toMatchObject({ width: 1024, height: 512 });
    expect(isMetadataFree(findJpegMetadata(prepared.bytes))).toBe(true);
    expect(removed).toEqual(['/tmp/x/prepared-0.jpg']);
  });

  it('converts again from the original with the rotation when sips kept a sideways orientation', async () => {
    const { deps, calls, removed } = fakeSips([cameraLikeJpeg(6), cameraLikeJpeg(6)]);
    await prepareWithSips('/photos/a.heic', deps);
    expect(calls[2].slice(0, 2)).toEqual(['-r', '90']);
    expect(calls[2]).toContain('/photos/a.heic');
    expect(removed).toEqual(['/tmp/x/prepared-0.jpg', '/tmp/x/prepared-1.jpg']);
  });

  it('refuses a file whose Exif cannot be read (orientation unknown) and still cleans up', async () => {
    const broken = withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order: 'II', orientation: 6, orientationEntry: { type: 4, count: 2 } }));
    const { deps, removed } = fakeSips([broken]);
    await expect(prepareWithSips('/photos/a.heic', deps)).rejects.toMatchObject({ code: 'orientation' });
    expect(removed).toEqual(['/tmp/x/prepared-0.jpg']);
  });

  it('reports a file sips cannot read', async () => {
    const { deps } = fakeSips([TINY_JPEG]);
    deps.exec = async () => {
      throw new Error('sips: Error 13');
    };
    await expect(prepareWithSips('/photos/a.txt', deps)).rejects.toMatchObject({ code: 'unreadable' });
  });

  it('refuses a result over 1024 px', async () => {
    const { deps } = fakeSips([cameraLikeJpeg(1)], ['pixelWidth: 2000\npixelHeight: 1000', 'pixelWidth: 2000\npixelHeight: 1000']);
    await expect(prepareWithSips('/photos/a.heic', deps)).rejects.toMatchObject({ code: 'too_large' });
  });
});

// ---------------------------------------------------------------------------
// The real sips (macOS only)

declare const process: { platform: string };

/* eslint-disable @typescript-eslint/no-require-imports */
const childProcess = require('node:child_process') as {
  execFile(file: string, args: string[], options: { encoding: 'utf8' }, callback: (error: Error | null, stdout: string) => void): void;
};
const fs = require('node:fs') as { rmSync(path: string, options: { force: boolean }): void };
/* eslint-enable @typescript-eslint/no-require-imports */

const hasSips = process.platform === 'darwin' && fileExists(SIPS);
const describeSips = hasSips ? describe : describe.skip;

function realDeps(dir: string): SipsDeps {
  let n = 0;
  return {
    exec: (file, args) =>
      new Promise((resolve, reject) => childProcess.execFile(file, args, { encoding: 'utf8' }, (error, stdout) => (error ? reject(error) : resolve(stdout)))),
    readBytes: async (path) => readBytes(path),
    tempPath: (name) => joinPath(dir, `t${++n}-${name}`),
    remove: async (path) => fs.rmSync(path, { force: true }),
  };
}

function sips(args: string[]): Promise<string> {
  return realDeps('').exec(SIPS, args);
}

type Rgb = [number, number, number];
const QUADRANTS: Record<'tl' | 'tr' | 'bl' | 'br', Rgb> = { tl: [255, 0, 0], tr: [0, 0, 255], bl: [0, 255, 0], br: [255, 255, 255] };

/** Upright image: four colored quadrants, `w` x `h`. */
function upright(x: number, y: number, w: number, h: number): Rgb {
  if (y < h / 2) return x < w / 2 ? QUADRANTS.tl : QUADRANTS.tr;
  return x < w / 2 ? QUADRANTS.bl : QUADRANTS.br;
}

/** Where stored pixel (x, y) shows on screen for each Exif orientation (stored size rw x rh). */
const DISPLAY: Record<number, (x: number, y: number, rw: number, rh: number) => [number, number]> = {
  1: (x, y) => [x, y],
  2: (x, y, rw) => [rw - 1 - x, y],
  3: (x, y, rw, rh) => [rw - 1 - x, rh - 1 - y],
  4: (x, y, _rw, rh) => [x, rh - 1 - y],
  5: (x, y) => [y, x],
  6: (x, y, _rw, rh) => [rh - 1 - y, x],
  7: (x, y, rw, rh) => [rh - 1 - y, rw - 1 - x],
  8: (x, y, rw) => [y, rw - 1 - x],
};

/** A JPEG whose stored pixels, shown with `orientation`, look like the upright quadrants (w x h on screen). */
function orientedJpeg(orientation: number, w: number, h: number, gps = false): Uint8Array {
  const [rw, rh] = orientation >= 5 ? [h, w] : [w, h];
  const data = new Uint8Array(rw * rh * 4);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const [dx, dy] = DISPLAY[orientation](x, y, rw, rh);
      data.set([...upright(dx, dy, w, h), 255], (y * rw + x) * 4);
    }
  }
  const jpeg = new Uint8Array(encode({ data, width: rw, height: rh }, 100).data);
  return withSegmentsAfterSoi(jpeg, exifSegment({ order: 'MM', orientation, gps }));
}

function expectUpright(bytes: Uint8Array, w: number, h: number): void {
  const image = decode(bytes, { useTArray: true });
  expect([image.width, image.height]).toEqual([w, h]);
  const at = (x: number, y: number) => Array.from(image.data.slice((y * w + x) * 4, (y * w + x) * 4 + 3));
  const near = (got: number[], want: Rgb) => got.every((v, i) => Math.abs(v - want[i]) < 60);
  const m = 3;
  expect([near(at(m, m), QUADRANTS.tl), near(at(w - 1 - m, m), QUADRANTS.tr), near(at(m, h - 1 - m), QUADRANTS.bl), near(at(w - 1 - m, h - 1 - m), QUADRANTS.br)]).toEqual([
    true,
    true,
    true,
    true,
  ]);
}

describeSips('prepareWithSips (real sips, macOS)', () => {
  let dir: string;
  beforeAll(() => {
    dir = makeTempDir('tagging-eval-sips-');
  });
  afterAll(() => removeDir(dir));

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('turns a HEIC with Exif orientation %i upright, strips everything and removes its temp files', async (orientation) => {
    const jpg = joinPath(dir, `o${orientation}.jpg`);
    const heic = joinPath(dir, `o${orientation}.heic`);
    writeFile(jpg, orientedJpeg(orientation, 40, 20, true));
    await sips(['-s', 'format', 'heic', jpg, '--out', heic]);
    const work = joinPath(dir, `work${orientation}`);
    mkdir(work);
    const prepared = await prepareWithSips(heic, realDeps(work));
    expectUpright(prepared.bytes, 40, 20);
    expect(isMetadataFree(findJpegMetadata(prepared.bytes))).toBe(true);
    expect(hasLocationMetadata(prepared.bytes)).toBe(false);
    expect(walkFiles(work)).toEqual([]);
  });

  it('downscales a large photo to 1024 px on the long edge and keeps a small one as is', async () => {
    const big = joinPath(dir, 'big.jpg');
    writeFile(big, orientedJpeg(1, 2000, 1000, true));
    const prepared = await prepareWithSips(big, realDeps(dir));
    expect(prepared).toMatchObject({ width: 1024, height: 512 });
    expect(hasLocationMetadata(prepared.bytes)).toBe(false);

    const small = joinPath(dir, 'small.jpg');
    writeFile(small, orientedJpeg(1, 300, 200));
    expect(await prepareWithSips(small, realDeps(dir))).toMatchObject({ width: 300, height: 200 });
  });

  it('reads a PNG', async () => {
    const jpg = joinPath(dir, 'p.jpg');
    const png = joinPath(dir, 'p.png');
    writeFile(jpg, orientedJpeg(1, 40, 20));
    await sips(['-s', 'format', 'png', jpg, '--out', png]);
    expectUpright((await prepareWithSips(png, realDeps(dir))).bytes, 40, 20);
  });

  it('reports a file that is not an image', async () => {
    const text = joinPath(dir, 'notes.jpg');
    writeFile(text, 'not an image');
    await expect(prepareWithSips(text, realDeps(dir))).rejects.toMatchObject({ code: 'unreadable' });
  });
});
