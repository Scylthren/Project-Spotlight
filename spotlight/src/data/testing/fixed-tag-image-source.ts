import type { TagImage } from '@/ai/closet-tagger';
import { CONNECTION_CHECK_IMAGE } from '@/ai/connection-check';

import type { TagImageSource } from '../item-suggestions';

/** TEST-ONLY `TagImageSource`: returns the same small clean JPEG for every photo and records the URIs. */
export class FixedTagImageSource implements TagImageSource {
  readonly reads: string[] = [];

  async read(photoUri: string): Promise<TagImage> {
    this.reads.push(photoUri);
    return { ...CONNECTION_CHECK_IMAGE };
  }
}
