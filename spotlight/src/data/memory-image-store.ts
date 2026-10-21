import { hasUriScheme, imageRefFor, STRIPPING_SUFFIX, type ImageStore } from './image-store';

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
  /** Runs between a file's existence check and its delete in `remove`. */
  betweenCheckAndDelete: ((key: string) => void) | null = null;
  /** Keys whose delete throws (the file stays). */
  failDeleteOf = new Set<string>();
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
    // Same order and tolerance as the real store: the cleanup copy first,
    // then the photo, which is deleted even if the copy could not be.
    let pendingError: unknown = null;
    try {
      this.deleteIfPresent(ref + STRIPPING_SUFFIX);
    } catch (error) {
      pendingError = error;
    }
    this.deleteIfPresent(ref);
    if (pendingError !== null) throw pendingError;
  }

  /**
   * Like a file system: check, then delete, which throws if the file is gone.
   * `betweenCheckAndDelete` runs in the gap, so a test can finish a racing
   * move there; a file that vanished in the gap is not an error.
   */
  private deleteIfPresent(key: string): void {
    if (!this.files.has(key)) return;
    this.betweenCheckAndDelete?.(key);
    if (this.failDeleteOf.has(key)) throw new Error(`cannot delete ${key}`);
    if (!this.files.has(key)) return;
    this.files.delete(key);
  }

  resolveUri(ref: string): string {
    return hasUriScheme(ref) ? ref : `memory://${ref}`;
  }
}
