import { hasUriScheme, imageRefFor, type ImageStore } from './image-store';

/**
 * Mock `ImageStore`. Records copies in memory. Suffixes are a counter
 * (`m1`, `m2`, ...) so refs are predictable in tests. Like the real store it
 * never overwrites. `failNextSave` / `failNextRemove` simulate disk errors.
 */
export class MemoryImageStore implements ImageStore {
  /** stored ref -> source URI it was copied from */
  readonly files = new Map<string, string>();
  failNextSave: Error | null = null;
  failNextRemove: Error | null = null;
  private saves = 0;

  async save(sourceUri: string, itemId: string, extension?: string): Promise<string> {
    if (this.failNextSave) {
      const error = this.failNextSave;
      this.failNextSave = null;
      throw error;
    }
    const ref = imageRefFor(itemId, sourceUri, `m${++this.saves}`, extension);
    if (this.files.has(ref)) throw new Error(`refusing to overwrite existing image ${ref}`);
    this.files.set(ref, sourceUri);
    return ref;
  }

  async remove(ref: string): Promise<void> {
    if (this.failNextRemove) {
      const error = this.failNextRemove;
      this.failNextRemove = null;
      throw error;
    }
    this.files.delete(ref);
  }

  resolveUri(ref: string): string {
    return hasUriScheme(ref) ? ref : `memory://${ref}`;
  }
}
