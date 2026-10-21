import { File, Paths } from 'expo-file-system';

import { isInsideDirectory, type TemporaryFiles } from './temporary-files';

/**
 * Real `TemporaryFiles`: deletes files under the app cache directory
 * (`Paths.cache`), where expo-image-picker and expo-image-manipulator write
 * their output on iOS and Android. Anything else (photo library `ph://` or
 * `content://` URIs, app documents, other paths) is ignored. iOS and Android only.
 */
export class ExpoTemporaryFiles implements TemporaryFiles {
  async discard(uri: string): Promise<void> {
    if (!isInsideDirectory(uri, Paths.cache.uri)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  }
}
