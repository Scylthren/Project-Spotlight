import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';

import {
  assertStrippedCopy,
  findJpegMetadata,
  fitWithinMaxEdge,
  MAX_STORED_IMAGE_EDGE,
  needsDownscale,
  orientationProblem,
  stripJpegMetadata,
} from '@/core';

import { ExpoTemporaryFiles } from './expo-temporary-files';
import { STORED_IMAGE_JPEG_QUALITY, type ImageProcessor, type ProcessedImage, type UploadImage } from './image-processor';
import { discardQuietly, type TemporaryFiles } from './temporary-files';

/**
 * Real `ImageProcessor` using expo-image-manipulator's context API (SDK 57)
 * and expo-file-system. iOS and Android only.
 *
 * 1. Loads the image. The decoded pixels are upright on both platforms, with
 *    or without a resize (expo-image-manipulator 57.0.21 in node_modules):
 *    - iOS: `manipulate()` itself adds ImageFixOrientationTransformer to
 *      every context, before any user transform
 *      (ios/ImageManipulatorModule.swift:13,28), and `renderAsync` returns the
 *      end of that chain (ios/ImageManipulatorContext.swift, addTransformer
 *      and render). The transformer returns a `.up` image either way: a
 *      plain `UIImage(cgImage:)` if already up, else a redraw through
 *      UIGraphicsImageRenderer
 *      (ios/Transformers/ImageFixOrientationTransformer.swift:13-20,
 *      ios/ImageManipulatorUtils.swift:99-108). ImageResizeTransformer also
 *      redraws into a renderer. So `jpegData` (ios/ImageManipulatorUtils.swift:76)
 *      encodes an `.up` image, which carries no non-1 Orientation.
 *    - Android: the image loads through Glide `asBitmap()`
 *      (expo-image-loader android/.../ImageLoaderService.kt:73-77), whose
 *      Downsampler applies the Exif orientation on decode, and
 *      `Bitmap.compress` (android/.../ImageManipulatorModule.kt:123) writes
 *      no Exif at all.
 * 2. Resizes only if the longest edge is over the limit, and saves a JPEG
 *    into the cache directory.
 * 3. Reads the JPEG back. If the encoder still declared an Exif Orientation
 *    other than 1, or wrote Exif too broken to read (neither is expected on
 *    either platform), fails: dropping such a tag could change how the photo
 *    looks, and guessing a rotation could get it wrong. The add and edit
 *    flows report this as `processFailed`.
 * 4. Strips metadata with `stripJpegMetadata`, overwrites the file, reads it
 *    back, and checks with `assertStrippedCopy` that the file on disk is
 *    exactly the stripped bytes and carries no metadata or location.
 *
 * Any failure rejects and deletes every file this call wrote.
 *
 * `prepareForUpload` runs the same steps with a smaller edge limit, returns
 * the verified stripped bytes, and then deletes the file too.
 */
export class ExpoImageProcessor implements ImageProcessor {
  constructor(private readonly temporaryFiles: TemporaryFiles = new ExpoTemporaryFiles()) {}

  async prepareForStorage(sourceUri: string): Promise<ProcessedImage> {
    const { uri, width, height } = await this.process(sourceUri, MAX_STORED_IMAGE_EDGE);
    return { uri, width, height };
  }

  async prepareForUpload(sourceUri: string, maxEdge: number): Promise<UploadImage> {
    const { uri, width, height, bytes } = await this.process(sourceUri, maxEdge);
    await discardQuietly(this.temporaryFiles, uri);
    return { bytes, width, height };
  }

  private async process(sourceUri: string, maxEdge: number): Promise<ProcessedImage & { bytes: Uint8Array }> {
    const shared: { release(): void }[] = [];
    const written: string[] = [];
    const track = <T extends { release(): void }>(object: T): T => {
      shared.push(object);
      return object;
    };
    const save = async (image: ImageRef) => {
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: STORED_IMAGE_JPEG_QUALITY });
      written.push(saved.uri);
      return { saved, bytes: await new File(saved.uri).bytes() };
    };
    try {
      let image: ImageRef = track(await track(ImageManipulator.manipulate(sourceUri)).renderAsync());

      if (needsDownscale(image, maxEdge)) {
        image = track(await track(ImageManipulator.manipulate(image).resize(fitWithinMaxEdge(image, maxEdge))).renderAsync());
      }

      const { saved, bytes } = await save(image);

      const problem = orientationProblem(findJpegMetadata(bytes));
      if (problem) throw new Error(`cannot store this photo upright: ${problem}`);

      const stripped = stripJpegMetadata(bytes);
      const file = new File(saved.uri);
      file.write(stripped);
      const onDisk = await file.bytes();
      assertStrippedCopy(onDisk, stripped);

      return { uri: saved.uri, width: saved.width, height: saved.height, bytes: onDisk };
    } catch (error) {
      for (const uri of written) await discardQuietly(this.temporaryFiles, uri);
      throw error;
    } finally {
      // Free native image memory now rather than waiting for GC.
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
