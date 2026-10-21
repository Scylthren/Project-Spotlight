import type { PickedPhoto } from './photo-picker';
import { discardQuietly, type TemporaryFiles } from './temporary-files';

/**
 * Holds the photo picked in a form that has not been saved yet, and deletes
 * the picker's temporary copy once the form no longer needs it: when another
 * photo replaces it, or when the form is cleared or closed. The add and edit
 * flows delete it themselves after a successful save, so clearing afterwards
 * is a harmless no-op. Deleting never throws.
 *
 * Saving reads the picked file, so run the save through `whileInUse`: any
 * deletion requested meanwhile (the user leaves the screen mid-save, say)
 * waits until the save has settled. Never await `clear`, `close`, or
 * `replace` from inside a `whileInUse` task; they would wait for that task
 * and never finish.
 *
 * After `close` (the form unmounted) the slot holds nothing and discards any
 * photo offered to it, e.g. one returned by a picker that was still open.
 */
export class PickedPhotoSlot {
  private photo: PickedPhoto | null = null;
  private closed = false;
  /** One settled-promise per running `whileInUse` task. */
  private readonly inUse = new Set<Promise<void>>();

  constructor(
    private readonly files: TemporaryFiles,
    private readonly onError?: (error: unknown, uri: string) => void,
  ) {}

  get current(): PickedPhoto | null {
    return this.photo;
  }

  /** True after `close` (and until `open`). */
  get isClosed(): boolean {
    return this.closed;
  }

  /**
   * Holds `next`, discarding the previous pick if it is a different file.
   * If the slot is closed, holds nothing and discards `next` instead.
   */
  async replace(next: PickedPhoto): Promise<void> {
    if (this.closed) {
      await this.discard(next.uri);
      return;
    }
    const previous = this.photo;
    this.photo = next;
    if (previous && previous.uri !== next.uri) await this.discard(previous.uri);
  }

  /** Discards the held pick (if any) and holds nothing. */
  async clear(): Promise<void> {
    const previous = this.photo;
    this.photo = null;
    if (previous) await this.discard(previous.uri);
  }

  /** Clears the slot and discards every photo offered from now on. Call when the form unmounts. */
  async close(): Promise<void> {
    this.closed = true;
    await this.clear();
  }

  /** Accepts photos again after `close` (React re-runs effects in development Strict Mode). */
  open(): void {
    this.closed = false;
  }

  /**
   * Runs `task` (a save that reads the held photo) and delays every deletion
   * this slot makes until it settles. Returns or rethrows the task's result.
   */
  async whileInUse<T>(task: () => Promise<T>): Promise<T> {
    const running = task();
    const settled = running.then(
      () => undefined,
      () => undefined,
    );
    this.inUse.add(settled);
    try {
      return await running;
    } finally {
      this.inUse.delete(settled);
    }
  }

  /** Waits for running saves, then deletes `uri` unless it is held again by then. */
  private async discard(uri: string): Promise<void> {
    while (this.inUse.size > 0) await Promise.all(this.inUse);
    if (this.photo?.uri === uri) return;
    await discardQuietly(this.files, uri, this.onError);
  }
}
