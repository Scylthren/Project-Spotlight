import { applyPickedPhoto, type PhotoDraft, type PhotoSetProblem, type PhotoTarget } from '@/core';

import type { PickedPhoto } from './photo-picker';
import { discardQuietly, type TemporaryFiles } from './temporary-files';

/**
 * Holds the photos picked in a form that has not been saved yet, one per key
 * (the form uses the photo draft's id), and deletes the picker's temporary
 * copy once the form no longer needs it: when a retake replaces it, when the
 * photo is removed from the form, or when the form is cleared or closed. The
 * add and edit flows delete them themselves after a successful save, so
 * clearing afterwards is a harmless no-op. Deleting never throws.
 *
 * Saving reads the picked files, so run the save through `whileInUse`: any
 * deletion requested meanwhile (the user leaves the screen mid-save, say)
 * waits until the save has settled. Never await `hold`, `release`, `clear`,
 * or `close` from inside a `whileInUse` task; they would wait for that task
 * and never finish.
 *
 * After `close` (the form unmounted) the set holds nothing and discards any
 * photo offered to it, e.g. one returned by a picker that was still open.
 * A file is never deleted while any key still holds it.
 */
export class PickedPhotoSet {
  private readonly photos = new Map<string, PickedPhoto>();
  private closed = false;
  /** One settled-promise per running `whileInUse` task. */
  private readonly inUse = new Set<Promise<void>>();

  constructor(
    private readonly files: TemporaryFiles,
    private readonly onError?: (error: unknown, uri: string) => void,
  ) {}

  get(key: string): PickedPhoto | null {
    return this.photos.get(key) ?? null;
  }

  /** Keys currently held, in the order they were first held. */
  get keys(): string[] {
    return [...this.photos.keys()];
  }

  /** True after `close` (and until `open`). */
  get isClosed(): boolean {
    return this.closed;
  }

  /**
   * Holds `photo` under `key`, discarding the photo previously held under
   * that key if it is a different file. If the set is closed, holds nothing
   * and discards `photo` instead.
   */
  async hold(key: string, photo: PickedPhoto): Promise<void> {
    if (this.closed) {
      await this.discard(photo.uri);
      return;
    }
    const previous = this.photos.get(key);
    this.photos.set(key, photo);
    if (previous && previous.uri !== photo.uri) await this.discard(previous.uri);
  }

  /** Discards the photo held under `key` (if any) and forgets the key. */
  async release(key: string): Promise<void> {
    const previous = this.photos.get(key);
    this.photos.delete(key);
    if (previous) await this.discard(previous.uri);
  }

  /** Discards every held photo and holds nothing. */
  async clear(): Promise<void> {
    const previous = [...this.photos.values()];
    this.photos.clear();
    for (const photo of previous) await this.discard(photo.uri);
  }

  /** Clears the set and discards every photo offered from now on. Call when the form unmounts. */
  async close(): Promise<void> {
    this.closed = true;
    await this.clear();
  }

  /** Accepts photos again after `close` (React re-runs effects in development Strict Mode). */
  open(): void {
    this.closed = false;
  }

  /**
   * Runs `task` (a save that reads the held photos) and delays every deletion
   * this set makes until it settles. Returns or rethrows the task's result.
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

  /** Waits for running saves, then deletes `uri` unless some key holds it again by then. */
  private async discard(uri: string): Promise<void> {
    while (this.inUse.size > 0) await Promise.all(this.inUse);
    for (const held of this.photos.values()) if (held.uri === uri) return;
    await discardQuietly(this.files, uri, this.onError);
  }
}

export type PlacePickResult = { ok: true; id: string } | { ok: false; problem: PhotoSetProblem | 'closed' };

/**
 * Puts a photo the picker returned into the form's photos, and gives its
 * temporary file to `set`:
 * - the form closed while the picker was open (`set` closed or `formOpen`
 *   false): the photo is discarded, `photos` unchanged ('closed');
 * - the photo no longer fits (its slot was removed or filled meanwhile): it
 *   is discarded, with the photo-set problem;
 * - otherwise `apply` gets the new photos (synchronously, before any await),
 *   `set` holds the pick under `key` (the new draft id), and if this was a
 *   retake of a photo picked in this form, that older pick is released.
 *   A retaken stored photo is left alone; saving the edit removes it.
 */
export async function placePickedPhoto(
  set: PickedPhotoSet,
  photos: readonly PhotoDraft[],
  target: PhotoTarget,
  pick: { key: string; photo: PickedPhoto },
  apply: (photos: PhotoDraft[]) => void,
  formOpen = true,
): Promise<PlacePickResult> {
  const { key, photo } = pick;
  if (set.isClosed || !formOpen) {
    await discardPick(set, key, photo);
    return { ok: false, problem: 'closed' };
  }
  const change = applyPickedPhoto(photos, target, { id: key, uri: photo.uri });
  if (!change.ok) {
    await discardPick(set, key, photo);
    return { ok: false, problem: change.problem };
  }
  apply(change.photos);
  await set.hold(key, photo);
  if (change.replaced?.kind === 'picked') await set.release(change.replaced.id);
  return { ok: true, id: key };
}

/** Deletes a pick nobody will use, through `set` so a running save is waited for. */
async function discardPick(set: PickedPhotoSet, key: string, photo: PickedPhoto): Promise<void> {
  // A closed set discards on hold; an open one discards on release.
  await set.hold(key, photo);
  await set.release(key);
}
