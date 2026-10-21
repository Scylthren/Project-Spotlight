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
}

export const STORED_IMAGE_JPEG_QUALITY = 0.8;
export const STORED_IMAGE_EXTENSION = '.jpg';

/**
 * Mock `ImageProcessor`. Returns `file:///processed/p<n>.jpg` for each call
 * and records the inputs in order. Set `failNext` to simulate a failure.
 */
export class FakeImageProcessor implements ImageProcessor {
  readonly inputs: string[] = [];
  /** processed URI -> source URI it was made from */
  readonly outputs = new Map<string, string>();
  failNext: Error | null = null;

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
