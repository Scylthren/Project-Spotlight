import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';

import { fitWithinMaxEdge, needsDownscale } from '@/core';

import { STORED_IMAGE_JPEG_QUALITY, type ImageProcessor, type ProcessedImage } from './image-processor';

/**
 * Real `ImageProcessor` using expo-image-manipulator's context API (SDK 57).
 * Loads the image (iOS applies EXIF orientation on load), reads its pixel
 * size, resizes only if the longest edge is over the limit, and saves a JPEG
 * into the cache directory. See `ImageProcessor` for what is not guaranteed
 * (metadata removal).
 */
export class ExpoImageProcessor implements ImageProcessor {
  async prepareForStorage(sourceUri: string): Promise<ProcessedImage> {
    const shared: { release(): void }[] = [];
    try {
      const loadContext = ImageManipulator.manipulate(sourceUri);
      shared.push(loadContext);
      let image: ImageRef = await loadContext.renderAsync();
      shared.push(image);

      if (needsDownscale(image)) {
        const resizeContext = ImageManipulator.manipulate(image).resize(fitWithinMaxEdge(image));
        shared.push(resizeContext);
        image = await resizeContext.renderAsync();
        shared.push(image);
      }

      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: STORED_IMAGE_JPEG_QUALITY });
      return { uri: saved.uri, width: saved.width, height: saved.height };
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
