import { Directory, File, Paths } from 'expo-file-system';

import { IMAGE_DIRECTORY } from './image-store';
import { assertSafeFileName, type StoredPhotoFiles } from './stored-photo-files';

/** Real `StoredPhotoFiles` over `<document directory>/closet-images/`. iOS and Android only. */
export class ExpoStoredPhotoFiles implements StoredPhotoFiles {
  private directory(): Directory {
    return new Directory(Paths.document, IMAGE_DIRECTORY);
  }

  private file(name: string): File {
    assertSafeFileName(name);
    return new File(this.directory(), name);
  }

  async list(): Promise<string[]> {
    const directory = this.directory();
    if (!directory.exists) return [];
    return directory
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((file) => file.name);
  }

  async exists(name: string): Promise<boolean> {
    return this.file(name).exists;
  }

  async read(name: string): Promise<Uint8Array> {
    return this.file(name).bytes();
  }

  async write(name: string, bytes: Uint8Array): Promise<void> {
    const file = this.file(name);
    if (!file.exists) file.create();
    file.write(bytes);
  }

  async replace(from: string, to: string): Promise<void> {
    await this.file(from).move(this.file(to), { overwrite: true });
  }

  async remove(name: string): Promise<void> {
    const file = this.file(name);
    if (file.exists) file.delete();
  }
}
