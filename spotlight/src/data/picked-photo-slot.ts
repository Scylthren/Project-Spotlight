import type { PickedPhoto } from './photo-picker';
import { PickedPhotoSet } from './picked-photo-set';
import type { TemporaryFiles } from './temporary-files';

const KEY = 'photo';

/**
 * A `PickedPhotoSet` that holds at most one photo: the single-photo form of
 * the same guarantees (deletions wait for `whileInUse` saves; after `close`
 * every offered photo is discarded). See `PickedPhotoSet` for the rules,
 * including: never await `clear`, `close`, or `replace` from inside a
 * `whileInUse` task.
 */
export class PickedPhotoSlot {
  private readonly set: PickedPhotoSet;

  constructor(files: TemporaryFiles, onError?: (error: unknown, uri: string) => void) {
    this.set = new PickedPhotoSet(files, onError);
  }

  get current(): PickedPhoto | null {
    return this.set.get(KEY);
  }

  /** True after `close` (and until `open`). */
  get isClosed(): boolean {
    return this.set.isClosed;
  }

  /**
   * Holds `next`, discarding the previous pick if it is a different file.
   * If the slot is closed, holds nothing and discards `next` instead.
   */
  replace(next: PickedPhoto): Promise<void> {
    return this.set.hold(KEY, next);
  }

  /** Discards the held pick (if any) and holds nothing. */
  clear(): Promise<void> {
    return this.set.clear();
  }

  /** Clears the slot and discards every photo offered from now on. Call when the form unmounts. */
  close(): Promise<void> {
    return this.set.close();
  }

  /** Accepts photos again after `close`. */
  open(): void {
    this.set.open();
  }

  /** Runs `task` and delays every deletion this slot makes until it settles. */
  whileInUse<T>(task: () => Promise<T>): Promise<T> {
    return this.set.whileInUse(task);
  }
}
