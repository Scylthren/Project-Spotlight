import type { TagImage } from '@/ai/closet-tagger';
import { TAG_ITEM_MAX_IMAGE_BASE64_LENGTH } from '@/ai/tag-item-contract';
import { encodeBase64, findJpegMetadata, hasLocationMetadata, isMetadataFree } from '@/core';

import type { ImageProcessor } from './image-processor';
import type { TagImageSource } from './item-suggestions';

/** Longest edge, in pixels, of the photo sent for tagging (never upscaled). */
export const TAG_IMAGE_MAX_EDGE = 1024;

/**
 * The real `TagImageSource` (Gate 2 slice 3): turns the front photo into the
 * image sent to the tag-item function.
 *
 * 1. `ImageProcessor.prepareForUpload` downscales to TAG_IMAGE_MAX_EDGE on
 *    the long edge (never upscaling), re-encodes as JPEG, strips metadata,
 *    verifies the file, and deletes its temporary file.
 * 2. The exact bytes that will be encoded are checked again here: a JPEG
 *    (SOI marker) with no Exif, GPS, XMP, IPTC, comments or trailing data
 *    (only JFIF, an ICC profile and Adobe APP14 may remain), no location.
 *    Anything else rejects, so nothing is sent.
 * 3. Those bytes are base64-encoded; an image over the contract limit
 *    rejects instead of being sent.
 *
 * Rejections become "no suggestion" in `suggestFromPhoto`; they never block
 * saving.
 */
export class UploadTagImageSource implements TagImageSource {
  constructor(private readonly processor: ImageProcessor) {}

  async read(photoUri: string): Promise<TagImage> {
    const { bytes } = await this.processor.prepareForUpload(photoUri, TAG_IMAGE_MAX_EDGE);
    if (!isMetadataFree(findJpegMetadata(bytes)) || hasLocationMetadata(bytes)) {
      throw new Error('the tag image still carries metadata; not sending it');
    }
    const base64 = encodeBase64(bytes);
    if (base64.length > TAG_ITEM_MAX_IMAGE_BASE64_LENGTH) {
      throw new Error(`the tag image is too large to send (${base64.length} base64 characters)`);
    }
    return { base64, contentType: 'image/jpeg' };
  }
}
