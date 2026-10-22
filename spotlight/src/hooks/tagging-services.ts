import type { ClosetTagger } from '@/ai/closet-tagger';
import type { ImageProcessor } from '@/data/image-processor';
import type { TagImageSource } from '@/data/item-suggestions';
import { UploadTagImageSource } from '@/data/upload-tag-image-source';

import { devBackendServices } from './dev-backend-services';

export interface TaggingServices {
  closetTagger: ClosetTagger;
  tagImageSource: TagImageSource;
}

/**
 * The add/edit form's tagger and the image it is given, always created
 * together so the remote tagger can never be paired with anything but the
 * real image source (downscaled, metadata-free JPEG). The tagger is the
 * session's `RemoteClosetTagger` (shared with the Me tab's connection test);
 * tests pass their own.
 */
export function createTaggingServices(
  imageProcessor: ImageProcessor,
  tagger: ClosetTagger = devBackendServices().tagger,
): TaggingServices {
  return { closetTagger: tagger, tagImageSource: new UploadTagImageSource(imageProcessor) };
}
