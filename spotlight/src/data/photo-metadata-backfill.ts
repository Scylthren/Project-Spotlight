import {
  assertStrippedCopy,
  findJpegMetadata,
  isMetadataFree,
  JpegFormatError,
  orientationProblem,
  stripJpegMetadata,
} from '@/core';

import { IMAGE_DIRECTORY, isStoredRef, STRIPPING_SUFFIX } from './image-store';
import type { MaintenanceLog } from './maintenance-log';
import type { PhotoReferences } from './photo-references';
import type { StoredPhotoFiles } from './stored-photo-files';

export { STRIPPING_SUFFIX };

/**
 * One-time task: photos stored before metadata stripping existed (slice 2)
 * may still carry Exif (camera details, possibly GPS). On launch, after the
 * database opens, this walks every stored photo in `closet-images/` and
 * strips it in place with the same stripper and verify-after-write rule as
 * new photos (`stripJpegMetadata`, `assertStrippedCopy`).
 *
 * How the swap can fail. `StoredPhotoFiles.replace` is expo-file-system's
 * `File.move(to, { overwrite: true })`, which is not atomic (expo-file-system
 * 57.0.7 in node_modules):
 * - iOS: ios/FileSystemPath.swift:86-90 removes the destination, then
 *   `FileManager.moveItem` (a rename in the same directory).
 * - Android: fsops/CopyMoveStrategy.kt:88-91 deletes the destination while
 *   preparing it; :102 tries `File.renameTo`, :108 falls back to NIO
 *   `Files.move`, and :37-46 falls back again to copying into the
 *   destination and then deleting the source.
 * So a crash can leave (a) only the copy, or (b) the copy plus a partly
 * written original. `MemoryStoredPhotoFiles` models both ("rename" and
 * "copy"), and the tests crash at every step under each. After a power loss,
 * ext4's delayed allocation can also leave a full-length, zero-filled file;
 * parsing rejects it (no SOI or EOI), so it is treated like case (b).
 *
 * Crash safety. A photo is never rewritten in place. The stripped bytes go to
 * `<name>.stripping`, are read back and verified, and only then replace the
 * original. On the next run, for each leftover copy:
 * - original present and a readable JPEG: the copy is an unfinished write;
 *   delete it;
 * - original missing (a) or unreadable (b): the copy had passed verification
 *   before the swap began; check it again and move it into place, but only
 *   if a closet item still references the photo. If none does, the item was
 *   deleted, so the copy (and an unreadable original) is deleted rather
 *   than brought back.
 * A copy that fails verification while it may be the only one is kept.
 *
 * Deletes. The delete flow removes the item's row, then its files
 * (`ImageStore.remove` deletes `<ref>.stripping` before `ref`, tolerating
 * either vanishing in between). A swap racing with that delete could still
 * recreate the photo: File.move is async, and Android's copy fallback may
 * already hold the source open. So the row is the source of truth: step 2
 * swaps only photos an item references (checked right before the swap), and
 * after every successful swap, here and in recovery, checks again and
 * deletes the photo if its item is gone. Such photos count as orphans. Only
 * photos that still carry metadata reach these checks, which new photos
 * never do, so a photo saved moments before its item row exists (add and
 * edit flows) is never touched.
 *
 * Known leak: if that post-swap orphan check itself fails (a database error),
 * the photo stays in place, unreferenced and already stripped. Later runs see
 * a clean photo and only read it, so it is never deleted. That costs storage
 * only; the file carries no metadata.
 *
 * Failures. Permanent problems (not a readable JPEG, an Exif Orientation
 * other than 1, a damaged cleanup copy) leave the files as they are, are
 * logged, and are recorded in the done marker: re-reading would not change
 * the outcome. Anything else (I/O, database) is transient: logged, and the
 * task stays pending so the next launch tries again. Already clean photos
 * are only read. Files whose names are not stored refs are ignored.
 *
 * Runs in the background and never throws; see `startPhotoMetadataBackfill`.
 */
export const PHOTO_METADATA_BACKFILL_KEY = 'strip-photo-metadata-v1';

/** A problem retrying will not fix. The files involved are left as they are. */
export class PermanentPhotoProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentPhotoProblem';
  }
}

export interface BackfillFailure {
  name: string;
  error: unknown;
}

export interface BackfillSkip {
  name: string;
  reason: string;
}

export interface BackfillSummary {
  /** Photos rewritten without metadata. */
  stripped: string[];
  /** Photos that already had none (left untouched). */
  clean: string[];
  /** Photos restored from a verified `.stripping` copy left by a crash. */
  recovered: string[];
  /** Unfinished `.stripping` copies deleted because their original was intact. */
  discardedPartials: string[];
  /** Files deleted because no item uses the photo any more (copies, and photos swapped as their item was deleted). */
  discardedOrphans: string[];
  /** Permanent problems: left unchanged and not retried. */
  skipped: BackfillSkip[];
  /** Transient errors: the task is retried next launch. */
  failed: BackfillFailure[];
}

function isPhotoName(name: string): boolean {
  return isStoredRef(`${IMAGE_DIRECTORY}/${name}`);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** True if `bytes` parse as a complete JPEG. Rethrows anything but a format error. */
function isReadableJpeg(bytes: Uint8Array): boolean {
  try {
    findJpegMetadata(bytes);
    return true;
  } catch (error) {
    if (error instanceof JpegFormatError) return false;
    throw error;
  }
}

export interface StripDeps {
  files: StoredPhotoFiles;
  references: PhotoReferences;
  /** Receives errors from best-effort cleanup that does not fail a file. Defaults to console.warn. */
  onError?: (message: string, error: unknown) => void;
}

/** Strips every stored photo once (see the module comment). Throws only if the directory cannot be listed. */
export async function stripStoredPhotos({ files, references, onError = warn }: StripDeps): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    stripped: [],
    clean: [],
    recovered: [],
    discardedPartials: [],
    discardedOrphans: [],
    skipped: [],
    failed: [],
  };
  const record = (name: string, error: unknown) => {
    if (error instanceof PermanentPhotoProblem) summary.skipped.push({ name, reason: error.message });
    else summary.failed.push({ name, error });
  };
  const names = new Set(await files.list());

  const isReferenced = (name: string) => references.isReferenced(`${IMAGE_DIRECTORY}/${name}`);

  /** After a successful swap: if the item was deleted meanwhile, delete the photo. Returns true if it did. */
  const removedAsOrphan = async (name: string) => {
    if (await isReferenced(name)) return false;
    await files.remove(name);
    summary.discardedOrphans.push(name);
    return true;
  };

  /**
   * Moves a verified leftover copy into place, or, if no item uses the
   * photo, deletes the copy and (when `original` is 'unreadable') the
   * damaged original.
   */
  const restore = async (temp: string, name: string, original: 'missing' | 'unreadable') => {
    if (!(await isReferenced(name))) {
      await files.remove(temp);
      summary.discardedOrphans.push(temp);
      if (original === 'unreadable') {
        await files.remove(name);
        summary.discardedOrphans.push(name);
      }
      return;
    }
    const bytes = await files.read(temp);
    try {
      assertStrippedCopy(bytes, bytes);
    } catch (error) {
      throw new PermanentPhotoProblem(`the cleanup copy is damaged, left in place: ${message(error)}`);
    }
    await files.replace(temp, name);
    if (await removedAsOrphan(name)) return;
    assertStrippedCopy(await files.read(name), bytes);
    summary.recovered.push(name);
  };

  // 1. Finish or discard what a previous run left behind.
  const handled = new Set<string>();
  for (const temp of [...names].sort()) {
    if (!temp.endsWith(STRIPPING_SUFFIX)) continue;
    const name = temp.slice(0, -STRIPPING_SUFFIX.length);
    if (!isPhotoName(name)) continue;
    names.delete(temp);
    handled.add(name);
    try {
      if (!(await files.exists(name))) {
        // (a) The swap deleted the original before moving the copy.
        await restore(temp, name, 'missing');
      } else if (isReadableJpeg(await files.read(name))) {
        // The copy was never swapped in: an unfinished write. The original is intact.
        await files.remove(temp);
        summary.discardedPartials.push(temp);
        handled.delete(name); // strip the original below
      } else {
        // (b) A copy-based move stopped part way through the original.
        await restore(temp, name, 'unreadable');
      }
    } catch (error) {
      // Keep the copy: it may be the only good one.
      record(temp, error);
    }
  }

  // 2. Strip every photo that still carries metadata.
  for (const name of [...names].sort()) {
    if (!isPhotoName(name) || handled.has(name)) continue;
    const temp = name + STRIPPING_SUFFIX;
    try {
      const bytes = await files.read(name);
      let report;
      try {
        report = findJpegMetadata(bytes);
      } catch (error) {
        if (error instanceof JpegFormatError) throw new PermanentPhotoProblem(`not a readable JPEG: ${error.message}`);
        throw error;
      }
      if (isMetadataFree(report)) {
        summary.clean.push(name);
        continue;
      }
      const problem = orientationProblem(report);
      if (problem) throw new PermanentPhotoProblem(`left unchanged: ${problem}`);
      const stripped = stripJpegMetadata(bytes);
      await files.write(temp, stripped);
      assertStrippedCopy(await files.read(temp), stripped);
      // The photo may have been deleted by the user meanwhile; do not bring it back.
      if (!(await files.exists(name))) {
        await files.remove(temp);
        continue;
      }
      // No item uses it (an orphan, or its item was just deleted): delete it
      // rather than swap. It still carries metadata, so keeping it helps no one.
      if (!(await isReferenced(name))) {
        await files.remove(temp);
        await files.remove(name);
        summary.discardedOrphans.push(name);
        continue;
      }
      await files.replace(temp, name);
      if (await removedAsOrphan(name)) continue;
      assertStrippedCopy(await files.read(name), stripped);
      summary.stripped.push(name);
    } catch (error) {
      record(name, error);
      await discardPartial(files, name, temp, onError);
    }
  }
  return summary;
}

/**
 * After a failure, deletes `temp` only while the original is still a
 * readable JPEG; otherwise the copy may be the only good one (step 1 of the
 * next run decides).
 */
async function discardPartial(
  files: StoredPhotoFiles,
  name: string,
  temp: string,
  onError: (message: string, error: unknown) => void,
): Promise<void> {
  try {
    if (!(await files.exists(temp)) || !(await files.exists(name))) return;
    if (isReadableJpeg(await files.read(name))) await files.remove(temp);
  } catch (error) {
    // Not fatal: the next run handles the copy (step 1). Still worth knowing.
    try {
      onError(`Could not clean up ${temp}; the next launch will.`, error);
    } catch {
      // A failing reporter must not break the task.
    }
  }
}

export interface BackfillDeps extends StripDeps {
  log: MaintenanceLog;
  /** Receives every skip, every per-file failure, and any task-level error. Defaults to console.warn. */
  onError?: (message: string, error: unknown) => void;
}

export type BackfillOutcome =
  | { status: 'already-done' }
  | { status: 'done'; summary: BackfillSummary }
  | { status: 'retry-next-launch'; summary: BackfillSummary | null };

const warn = (text: string, error: unknown) => console.warn(text, error);

/**
 * Runs the task unless it already finished. Marks it done when no transient
 * failure is left, recording counts and permanent skips in the marker.
 * Never rejects: any error is reported and the task stays pending.
 */
export async function runPhotoMetadataBackfill({ onError = warn, log, ...deps }: BackfillDeps): Promise<BackfillOutcome> {
  const report = (text: string, error: unknown) => {
    try {
      onError(text, error);
    } catch {
      // A failing reporter must not break the task.
    }
  };
  let summary: BackfillSummary | null = null;
  try {
    if (await log.isDone(PHOTO_METADATA_BACKFILL_KEY)) return { status: 'already-done' };
    summary = await stripStoredPhotos({ ...deps, onError: report });
    for (const skip of summary.skipped) {
      report(`Photo metadata cleanup skipped ${skip.name} (will not retry).`, skip.reason);
    }
    for (const failure of summary.failed) {
      report(`Photo metadata cleanup failed for ${failure.name}; will retry next launch.`, failure.error);
    }
    if (summary.failed.length > 0) return { status: 'retry-next-launch', summary };
    const value = {
      stripped: summary.stripped.length,
      clean: summary.clean.length,
      recovered: summary.recovered.length,
      skipped: summary.skipped,
    };
    await log.markDone(PHOTO_METADATA_BACKFILL_KEY, JSON.stringify(value));
    return { status: 'done', summary };
  } catch (error) {
    report('Photo metadata cleanup did not finish; will retry next launch.', error);
    return { status: 'retry-next-launch', summary };
  }
}

let started = false;

/**
 * Starts the task in the background at most once per process, so remounts,
 * a reopened database, or React Strict Mode can never run two passes over
 * the same files at once. Returns the running task, or null if it was
 * already started.
 */
export function startPhotoMetadataBackfill(deps: BackfillDeps): Promise<BackfillOutcome> | null {
  if (started) return null;
  started = true;
  return runPhotoMetadataBackfill(deps);
}
