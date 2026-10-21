import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';

import { fitWithinMaxEdge, segmentGarment, type RgbaImage } from '@/core';

import { ExpoTemporaryFiles } from './expo-temporary-files';
import type { GarmentIsolation, GarmentIsolator } from './garment-isolator';
import { discardQuietly, type TemporaryFiles } from './temporary-files';

/** Longest edge of the copy the heuristic works on. Small enough to segment in a few ms. */
export const ISOLATION_IMAGE_EDGE = 96;

/**
 * On-device `GarmentIsolator` for color detection only (slice 4): a free
 * heuristic, no network, no stored cutout.
 *
 * 1. expo-image-manipulator loads the photo upright (see ExpoImageProcessor
 *    for why the pixels are upright on iOS and Android), scales it so the
 *    longest edge is `ISOLATION_IMAGE_EDGE`, and saves a JPEG in the cache.
 * 2. expo-file-system reads the bytes; the file is deleted right away.
 * 3. jpeg-js decodes them to RGBA in plain JS. `useTArray: true` makes it
 *    allocate a Uint8Array instead of a Node Buffer, which Hermes lacks; the
 *    tests decode with `Buffer` removed to prove it. Limits cap memory
 *    should the scaled copy somehow be large.
 * 4. core/garment-segmentation.ts finds the garment and its confidence.
 *
 * Never changes the source photo. iOS and Android only.
 */
export class LocalGarmentIsolator implements GarmentIsolator {
  constructor(private readonly temporaryFiles: TemporaryFiles = new ExpoTemporaryFiles()) {}

  async isolate(photoUri: string): Promise<GarmentIsolation> {
    const image = await this.loadSmall(photoUri);
    const result = segmentGarment(image);
    if (!result.ok) return { ok: false, reason: result.reason };
    return { ok: true, garment: { image, mask: result.segmentation.mask, confidence: result.segmentation.confidence } };
  }

  /** The photo scaled down and decoded to RGBA. Rejects if any step fails. */
  private async loadSmall(photoUri: string): Promise<RgbaImage> {
    const shared: { release(): void }[] = [];
    const track = <T extends { release(): void }>(object: T): T => {
      shared.push(object);
      return object;
    };
    let savedUri: string | null = null;
    try {
      let image: ImageRef = track(await track(ImageManipulator.manipulate(photoUri)).renderAsync());
      const target = fitWithinMaxEdge(image, ISOLATION_IMAGE_EDGE);
      if (target.width !== image.width || target.height !== image.height) {
        image = track(await track(ImageManipulator.manipulate(image).resize(target)).renderAsync());
      }
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
      savedUri = saved.uri;
      const bytes = await new File(saved.uri).bytes();
      const decoded = decode(bytes, {
        useTArray: true,
        formatAsRGBA: true,
        maxResolutionInMP: 1,
        maxMemoryUsageInMB: 32,
      });
      return { width: decoded.width, height: decoded.height, data: decoded.data };
    } finally {
      await discardQuietly(this.temporaryFiles, savedUri);
      for (const object of shared) {
        try {
          object.release();
        } catch {
          // Already released; nothing to do.
        }
      }
    }
  }
}
