import { Directory, File, Paths } from 'expo-file-system';

import {
  IMAGE_DIRECTORY,
  hasUriScheme,
  imageRefFor,
  isStoredRef,
  randomSuffix,
  type ImageStore,
} from './image-store';

/** Real `ImageStore`: copies into `<document directory>/closet-images/`. iOS and Android only. */
export class ExpoImageStore implements ImageStore {
  constructor(private readonly nextSuffix: () => string = () => randomSuffix()) {}

  async save(sourceUri: string, itemId: string, extension?: string): Promise<string> {
    const ref = imageRefFor(itemId, sourceUri, this.nextSuffix(), extension);
    new Directory(Paths.document, IMAGE_DIRECTORY).create({ idempotent: true, intermediates: true });
    const destination = new File(Paths.document, ref);
    // Never replace an existing photo. `overwrite: false` is also the
    // expo-file-system default; the explicit check gives a clear error.
    if (destination.exists) throw new Error(`refusing to overwrite existing image ${ref}`);
    await new File(sourceUri).copy(destination, { overwrite: false });
    if (!destination.exists) throw new Error('image copy did not produce a file');
    return ref;
  }

  async remove(ref: string): Promise<void> {
    if (!isStoredRef(ref)) return;
    const file = new File(Paths.document, ref);
    if (file.exists) file.delete();
  }

  resolveUri(ref: string): string {
    return hasUriScheme(ref) ? ref : new File(Paths.document, ref).uri;
  }
}
