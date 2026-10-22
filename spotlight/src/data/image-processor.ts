import type { ImageSize } from '@/core';

/** A downscaled, re-encoded copy of a photo, in a temporary location. */
export interface ProcessedImage extends ImageSize {
  /** Temporary file URI. Copy it into app storage with `ImageStore.save`. */
  uri: string;
}

/**
 * Prepares a picked or captured photo for storage: scales it so the longest
 * edge is at most `MAX_STORED_IMAGE_EDGE` (never upscaling) and re-encodes it
 * as JPEG at `STORED_IMAGE_JPEG_QUALITY`. The result is always a JPEG, so
 * store it with `STORED_IMAGE_EXTENSION` whatever the source file was named
 * (pickers can return `.heic` names).
 *
 * This works on the original photo only. Background-removed cutouts (Gate 2)
 * are a separate image and must not replace the original.
 *
 * The result must be upright and carry no metadata: no Exif (so no GPS or
 * camera details), XMP, IPTC, comments, or data after the image. Only the
 * JFIF header, an ICC color profile, and an Adobe APP14 marker may remain.
 * `ExpoImageProcessor` enforces this with core/jpeg-metadata.ts and rejects
 * if the check fails; see its tests. Only JPEG output is handled, which is
 * all this interface produces. The picked source file is not changed and
 * may still carry GPS until it is discarded.
 *
 * Implementations: `FakeImageProcessor` (tests) and `ExpoImageProcessor`.
 */
export interface ImageProcessor {
  /** Rejects if the image cannot be read, scaled, or written. */
  prepareForStorage(sourceUri: string): Promise<ProcessedImage>;
  /**
   * The same pipeline (upright, re-encoded JPEG, metadata stripped and
   * checked) with the longest edge at most `maxEdge` (never upscaling), for
   * sending to our backend. Returns the stripped bytes and deletes its
   * temporary file before resolving, also on failure.
   */
  prepareForUpload(sourceUri: string, maxEdge: number): Promise<UploadImage>;
}

/** A downscaled, re-encoded, metadata-free JPEG in memory. */
export interface UploadImage extends ImageSize {
  bytes: Uint8Array;
}

export const STORED_IMAGE_JPEG_QUALITY = 0.8;
export const STORED_IMAGE_EXTENSION = '.jpg';

/**
 * Mock `ImageProcessor`. Returns `file:///processed/p<n>.jpg` for each call
 * and records the inputs in order. Set `failNext` to simulate a failure.
 * `prepareForUpload` returns `uploadBytes` (a tiny clean JPEG unless a test
 * sets something else) and records its calls in `uploads`.
 */
export class FakeImageProcessor implements ImageProcessor {
  readonly inputs: string[] = [];
  /** processed URI -> source URI it was made from */
  readonly outputs = new Map<string, string>();
  failNext: Error | null = null;
  readonly uploads: { sourceUri: string; maxEdge: number }[] = [];
  uploadBytes: Uint8Array = FAKE_UPLOAD_JPEG;
  failNextUpload: Error | null = null;

  async prepareForUpload(sourceUri: string, maxEdge: number): Promise<UploadImage> {
    this.uploads.push({ sourceUri, maxEdge });
    if (this.failNextUpload) {
      const error = this.failNextUpload;
      this.failNextUpload = null;
      throw error;
    }
    return { bytes: this.uploadBytes.slice(), width: maxEdge, height: Math.round(maxEdge * 0.75) };
  }

  async prepareForStorage(sourceUri: string): Promise<ProcessedImage> {
    this.inputs.push(sourceUri);
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    const uri = `file:///processed/p${this.inputs.length}.jpg`;
    this.outputs.set(uri, sourceUri);
    return { uri, width: 1600, height: 1200 };
  }
}

/**
 * The smallest well-formed JPEG the metadata checker accepts (SOI, a DQT,
 * an SOF0, a DHT, an SOS with one byte of scan data, EOI). Not decodable as
 * a picture; only for fakes.
 */
const FAKE_UPLOAD_JPEG = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xdb, 0x00, 0x43, 0x00, ...new Array<number>(64).fill(1),
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, ...new Array<number>(15).fill(0), 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x00,
  0xff, 0xd9,
]);
