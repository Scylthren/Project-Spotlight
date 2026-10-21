import {
  findJpegMetadata,
  hasLocationMetadata,
  isMetadataFree,
  stripJpegMetadata,
} from '@/core/jpeg-metadata';
import {
  cameraLikeJpeg,
  exifSegment,
  iccSegment,
  SIPS_JPEG,
  TINY_JPEG,
  withSegmentsAfterSoi,
} from '@/core/testing/jpeg-fixtures';

import { MemoryMaintenanceLog } from './maintenance-log';
import {
  PHOTO_METADATA_BACKFILL_KEY,
  runPhotoMetadataBackfill,
  STRIPPING_SUFFIX,
  stripStoredPhotos,
} from './photo-metadata-backfill';
import { SetPhotoReferences } from './photo-references';
import { MemoryStoredPhotoFiles } from './stored-photo-files';

/** A pre-slice-2 photo: the encoder's Exif with GPS, Orientation 1, and an ICC profile. */
const OLD_WITH_GPS = withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order: 'II', gps: true, orientation: 1 }), iccSegment());
const OLD_WITH_GPS_STRIPPED = withSegmentsAfterSoi(TINY_JPEG, iccSegment());

const A = 'item1-aaaa.jpg';
const B = 'item2-bbbb.jpg';
const C = 'item3-cccc.jpg';

/** Every test photo is used by an item unless a test says otherwise. */
const allReferenced = () => new SetPhotoReferences([A, B, C].map((name) => `closet-images/${name}`));

/** Cleanup errors reported by the last `strip` call (instead of console.warn). */
let cleanupErrors: string[] = [];

function strip(files: MemoryStoredPhotoFiles, references = allReferenced()) {
  cleanupErrors = [];
  return stripStoredPhotos({ files, references, onError: (message) => cleanupErrors.push(message) });
}

/**
 * What deleting an item does: the delete flow removes the item's row
 * (`references`), then `ImageStore.remove` deletes the copy first, then the
 * photo (both stores are tested for this order).
 */
function userDeletes(files: MemoryStoredPhotoFiles, name: string, references?: SetPhotoReferences): void {
  references?.refs.delete(`closet-images/${name}`);
  files.files.delete(name + STRIPPING_SUFFIX);
  files.files.delete(name);
}

function expectClean(bytes: Uint8Array | undefined): void {
  expect(bytes).toBeDefined();
  expect(isMetadataFree(findJpegMetadata(bytes!))).toBe(true);
  expect(hasLocationMetadata(bytes!)).toBe(false);
}

function writesTo(files: MemoryStoredPhotoFiles): string[] {
  return files.calls.filter((c) => c.startsWith('write') || c.startsWith('replace') || c.startsWith('remove'));
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

describe('stripStoredPhotos', () => {
  it('strips old photos in place, via a verified temporary copy, and leaves clean photos untouched', async () => {
    const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS, [B]: TINY_JPEG, [C]: SIPS_JPEG });

    const summary = await strip(files);

    expect(summary).toMatchObject({ stripped: [A, C], clean: [B], recovered: [], discardedPartials: [], skipped: [], failed: [] });
    expect(files.files.get(A)).toEqual(OLD_WITH_GPS_STRIPPED);
    expect(files.files.get(B)).toEqual(TINY_JPEG);
    expect(files.files.get(C)).toEqual(stripJpegMetadata(SIPS_JPEG));
    expect([...files.files.keys()].sort()).toEqual([A, B, C]);
    // Write to a temporary name, read it back, then swap; never write the photo itself.
    expect(files.calls.filter((c) => c.includes(A))).toEqual([
      `read ${A}`,
      `write ${A}${STRIPPING_SUFFIX}`,
      `read ${A}${STRIPPING_SUFFIX}`,
      `exists ${A}`,
      `replace ${A}${STRIPPING_SUFFIX} -> ${A}`,
      `read ${A}`,
    ]);
    expect(writesTo(files).some((c) => c.includes(B))).toBe(false);
  });

  it('cleans a camera-like photo with Orientation 1 down to the image and its ICC profile', async () => {
    const files = new MemoryStoredPhotoFiles({ [A]: cameraLikeJpeg(1) });
    await strip(files);
    expect(files.files.get(A)).toEqual(OLD_WITH_GPS_STRIPPED);
  });

  it('ignores files that are not stored photo names', async () => {
    const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
    files.files.set('.DS_Store', new Uint8Array([1, 2, 3]));
    files.files.set('weird name.jpg', OLD_WITH_GPS);
    const summary = await strip(files);
    expect(summary.stripped).toEqual([A]);
    expect(summary.failed).toEqual([]);
    expect(files.files.get('weird name.jpg')).toEqual(OLD_WITH_GPS);
  });

  it('handles an empty or missing directory', async () => {
    expect(await strip(new MemoryStoredPhotoFiles())).toEqual({
      stripped: [],
      clean: [],
      recovered: [],
      discardedPartials: [],
      discardedOrphans: [],
      skipped: [],
      failed: [],
    });
  });

  it('skips (permanently) a photo whose Exif declares a non-upright orientation, leaving it unchanged', async () => {
    const sideways = withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order: 'MM', gps: true, orientation: 6 }));
    const files = new MemoryStoredPhotoFiles({ [A]: sideways, [B]: OLD_WITH_GPS });
    const summary = await strip(files);
    expect(summary.skipped).toEqual([{ name: A, reason: expect.stringMatching(/orientation 6/) }]);
    expect(summary.failed).toEqual([]);
    expect(files.files.get(A)).toEqual(sideways);
    expect(writesTo(files).some((c) => c.includes(A))).toBe(false);
    expect(files.files.get(B)).toEqual(OLD_WITH_GPS_STRIPPED);
  });

  it('skips (permanently) a file that is not a JPEG, leaving it unchanged', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const files = new MemoryStoredPhotoFiles({ [A]: png });
    const summary = await strip(files);
    expect(summary.skipped).toEqual([{ name: A, reason: expect.stringMatching(/not a readable JPEG/) }]);
    expect(summary.failed).toEqual([]);
    expect([...files.files.entries()]).toEqual([[A, png]]);
  });

  it('treats I/O errors as transient and keeps going: the others are still stripped', async () => {
    const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS, [B]: OLD_WITH_GPS });
    files.failWhen = (op, name) => op === 'read' && name === A;
    const summary = await strip(files);
    expect(summary.failed.map((f) => f.name)).toEqual([A]);
    expect(summary.skipped).toEqual([]);
    expect(summary.stripped).toEqual([B]);
    expect(files.files.get(A)).toEqual(OLD_WITH_GPS);
  });

  it('keeps the original if writing the temporary copy fails, and removes the partial copy', async () => {
    const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
    files.failWhen = (op) => op === 'write';
    const summary = await strip(files);
    expect(summary.failed.map((f) => f.name)).toEqual([A]);
    expect([...files.files.entries()]).toEqual([[A, OLD_WITH_GPS]]);
  });

  it('keeps the original if the temporary copy reads back wrong (write reported success but did not land)', async () => {
    const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
    const temp = A + STRIPPING_SUFFIX;
    files.dropWritesTo.add(temp);
    // Something else ends up in the file instead of the stripped bytes.
    files.failWhen = (op, name) => {
      if (op === 'write' && name === temp) files.files.set(temp, new Uint8Array([0xff, 0xd8]));
      return false;
    };
    const summary = await strip(files);
    expect(summary.failed.map((f) => f.name)).toEqual([A]);
    expect((summary.failed[0].error as Error).message).toMatch(/not written correctly/);
    expect([...files.files.entries()]).toEqual([[A, OLD_WITH_GPS]]);
    expect(files.calls).not.toContain(`replace ${temp} -> ${A}`);
  });

  describe('items deleted while the task runs', () => {
    it('a delete before the exists check: the copy is removed, nothing is restored', async () => {
      const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
      const references = allReferenced();
      files.failWhen = (op, name) => {
        if (op === 'write' && name === A + STRIPPING_SUFFIX) userDeletes(files, A, references);
        return false;
      };
      const summary = await strip(files, references);
      expect(summary).toMatchObject({ stripped: [], failed: [] });
      expect(files.files.size).toBe(0);
    });

    it('a delete between the exists check and the swap: the swap finds no source, nothing is restored', async () => {
      const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
      const references = allReferenced();
      files.failWhen = (op) => {
        if (op === 'replace') userDeletes(files, A, references);
        return false;
      };
      const first = await strip(files, references);
      expect(first.stripped).toEqual([]);
      expect(files.files.size).toBe(0);
      // Reported as transient; the next run finds nothing left to do.
      files.failWhen = null;
      expect(await strip(files, references)).toMatchObject({ failed: [], stripped: [], recovered: [] });
      expect(files.files.size).toBe(0);
    });

    it('a delete whose row removal lands before the swap and file removal after it: the photo is deleted as an orphan', async () => {
      const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
      const references = allReferenced();
      // Row gone just before the swap; the file delete has not run yet.
      let checks = 0;
      const isReferenced = references.isReferenced.bind(references);
      references.isReferenced = async (ref) => {
        if (++checks === 2) references.refs.delete(`closet-images/${A}`);
        return isReferenced(ref);
      };
      const summary = await strip(files, references);
      expect(summary).toMatchObject({ stripped: [], discardedOrphans: [A], failed: [] });
      expect(files.files.size).toBe(0);
    });

    it('rename move: the move finishing after the delete flow removed the row still leaves no photo', async () => {
      const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
      const references = allReferenced();
      // The delete runs while the native move is in flight, but the move wins
      // the race for the file (as when File.move completes between the
      // store's exists check and its delete): only the row removal sticks.
      files.crashInsideReplace = (stage) => {
        if (stage === 'destination-deleted') references.refs.delete(`closet-images/${A}`);
        return false;
      };
      const summary = await strip(files, references);
      expect(summary).toMatchObject({ stripped: [], discardedOrphans: [A], failed: [] });
      expect(files.files.size).toBe(0);
    });

    it('copy fallback: a copy that already opened its source recreates the photo after the delete; it is deleted as an orphan', async () => {
      const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS, [B]: OLD_WITH_GPS });
      files.moveModel = 'copy';
      const references = allReferenced();
      files.crashInsideReplace = (stage, _from, to) => {
        // The user deletes A part way through its copy; the copy then finishes and recreates A.
        if (to === A && stage === 'half-copied') userDeletes(files, A, references);
        return false;
      };
      const summary = await strip(files, references);
      expect(summary).toMatchObject({ stripped: [B], discardedOrphans: [A], failed: [] });
      expect([...files.files.keys()]).toEqual([B]);
    });

    it.each(['rename', 'copy'] as const)(
      '%s move: a delete during the swap never leaves the photo behind',
      async (moveModel) => {
        for (const stage of ['destination-deleted', 'half-copied', 'copied'] as const) {
          if (moveModel === 'rename' && stage !== 'destination-deleted') continue;
          const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
          files.moveModel = moveModel;
          const references = allReferenced();
          // The JS delete runs while the native move is part way through; the move then fails.
          files.crashInsideReplace = (at) => {
            if (at !== stage) return false;
            userDeletes(files, A, references);
            return true;
          };
          await strip(files, references);
          files.crashInsideReplace = null;
          await strip(files, references);
          expect({ moveModel, stage, left: [...files.files.keys()] }).toEqual({ moveModel, stage, left: [] });
        }
      },
    );

    it('an unreferenced photo that still carries metadata is deleted as an orphan, not swapped', async () => {
      const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS, [B]: OLD_WITH_GPS, [C]: TINY_JPEG });
      const references = new SetPhotoReferences([`closet-images/${B}`]);
      const summary = await strip(files, references);
      expect(summary).toMatchObject({ stripped: [B], clean: [C], discardedOrphans: [A], failed: [] });
      expect([...files.files.keys()].sort()).toEqual([B, C]);
      expect(files.calls.some((c) => c.startsWith(`replace ${A}`))).toBe(false);
    });

    it('never deletes a clean photo whose item row does not exist yet (add and edit save the file first)', async () => {
      const files = new MemoryStoredPhotoFiles({ [A]: TINY_JPEG, [B]: OLD_WITH_GPS_STRIPPED });
      const summary = await strip(files, new SetPhotoReferences());
      expect(summary).toMatchObject({ clean: [A, B], discardedOrphans: [] });
      expect([...files.files.keys()].sort()).toEqual([A, B]);
    });

    it('a crash leaves only the copy, then the item is deleted from the database: the copy is deleted, not restored', async () => {
      const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS, [B]: OLD_WITH_GPS });
      files.crashInsideReplace = (_, from) => from.startsWith(A);
      await strip(files);
      expect(files.files.has(A)).toBe(false);
      expect(files.files.has(A + STRIPPING_SUFFIX)).toBe(true);

      // The item row is gone (its file delete never ran or failed).
      files.crashInsideReplace = null;
      const references = new SetPhotoReferences([`closet-images/${B}`]);
      const summary = await strip(files, references);
      expect(summary).toMatchObject({ discardedOrphans: [A + STRIPPING_SUFFIX], recovered: [], failed: [] });
      expect([...files.files.keys()]).toEqual([B]);
    });

    it('copy move: a crash leaves a truncated original and the copy, then the item is deleted from the database: both are deleted', async () => {
      const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
      files.moveModel = 'copy';
      let dead = false;
      files.crashInsideReplace = (stage) => (dead ||= stage === 'half-copied');
      files.failWhen = () => dead;
      await strip(files);
      expect([...files.files.keys()].sort()).toEqual([A, A + STRIPPING_SUFFIX]);

      files.crashInsideReplace = null;
      files.failWhen = null;
      const summary = await strip(files, new SetPhotoReferences());
      expect(summary).toMatchObject({ discardedOrphans: [A + STRIPPING_SUFFIX, A], recovered: [], failed: [] });
      expect(files.files.size).toBe(0);
    });

    it('a crash leaves only the copy, then the user deletes the item normally: nothing is left to restore', async () => {
      const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
      const references = allReferenced();
      files.crashInsideReplace = () => true;
      await strip(files, references);
      userDeletes(files, A, references);
      files.crashInsideReplace = null;
      expect(await strip(files, references)).toMatchObject({ recovered: [], failed: [] });
      expect(files.files.size).toBe(0);
    });

    it('a recovery whose item is deleted as the copy moves in: the photo is deleted as an orphan', async () => {
      const files = new MemoryStoredPhotoFiles({ [A + STRIPPING_SUFFIX]: OLD_WITH_GPS_STRIPPED });
      const references = allReferenced();
      files.crashInsideReplace = () => {
        references.refs.delete(`closet-images/${A}`);
        return false;
      };
      const summary = await strip(files, references);
      expect(summary).toMatchObject({ recovered: [], discardedOrphans: [A], failed: [] });
      expect(files.files.size).toBe(0);
    });

    it('if the reference check fails, the copy is kept and the run is retried', async () => {
      const files = new MemoryStoredPhotoFiles({ [A + STRIPPING_SUFFIX]: OLD_WITH_GPS_STRIPPED });
      const references = allReferenced();
      references.failNext = new Error('database is locked');
      const summary = await strip(files, references);
      expect(summary.failed.map((f) => f.name)).toEqual([A + STRIPPING_SUFFIX]);
      expect([...files.files.keys()]).toEqual([A + STRIPPING_SUFFIX]);
    });
  });

  describe('crash safety', () => {
    it('rename move: a crash after the original was deleted is finished on the next run', async () => {
      const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
      files.crashInsideReplace = () => true;

      const first = await strip(files);
      expect(first.failed.map((f) => f.name)).toEqual([A]);
      // Only the verified, stripped copy is left, and it was not deleted.
      expect([...files.files.entries()]).toEqual([[A + STRIPPING_SUFFIX, OLD_WITH_GPS_STRIPPED]]);

      files.crashInsideReplace = null;
      const second = await strip(files);
      expect(second).toMatchObject({ recovered: [A], failed: [], stripped: [], clean: [] });
      expect([...files.files.entries()]).toEqual([[A, OLD_WITH_GPS_STRIPPED]]);
    });

    it('copy move: a crash part way through the copy leaves a truncated original; the next run restores it from the copy', async () => {
      const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
      files.moveModel = 'copy';
      files.crashInsideReplace = (stage) => stage === 'half-copied';
      await strip(files);
      expect(files.files.get(A)!.length).toBeLessThan(OLD_WITH_GPS_STRIPPED.length);
      expect(files.files.get(A + STRIPPING_SUFFIX)).toEqual(OLD_WITH_GPS_STRIPPED);

      files.crashInsideReplace = null;
      const summary = await strip(files);
      expect(summary).toMatchObject({ recovered: [A], discardedPartials: [], failed: [] });
      expect([...files.files.entries()]).toEqual([[A, OLD_WITH_GPS_STRIPPED]]);
    });

    it('copy move: a crash after the copy but before deleting the source leaves two good files; the copy is dropped', async () => {
      const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
      files.moveModel = 'copy';
      // The process dies there: nothing after it runs, not even cleanup.
      let dead = false;
      files.crashInsideReplace = (stage) => (dead ||= stage === 'copied');
      files.failWhen = () => dead;
      await strip(files);
      expect(files.files.get(A)).toEqual(OLD_WITH_GPS_STRIPPED);
      expect(files.files.get(A + STRIPPING_SUFFIX)).toEqual(OLD_WITH_GPS_STRIPPED);
      files.crashInsideReplace = null;
      files.failWhen = null;
      const summary = await strip(files);
      expect(summary).toMatchObject({ discardedPartials: [A + STRIPPING_SUFFIX], clean: [A], failed: [] });
      expect([...files.files.entries()]).toEqual([[A, OLD_WITH_GPS_STRIPPED]]);
    });

    it('a crash while writing the copy leaves the original; the next run deletes the partial copy and strips again', async () => {
      const partial = OLD_WITH_GPS_STRIPPED.subarray(0, 100);
      const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS, [A + STRIPPING_SUFFIX]: partial });
      const summary = await strip(files);
      expect(summary).toMatchObject({ discardedPartials: [A + STRIPPING_SUFFIX], stripped: [A], failed: [] });
      expect([...files.files.entries()]).toEqual([[A, OLD_WITH_GPS_STRIPPED]]);
    });

    it('never deletes a lone copy that fails verification; skips it permanently instead', async () => {
      const notClean = OLD_WITH_GPS.slice();
      const files = new MemoryStoredPhotoFiles({ [A + STRIPPING_SUFFIX]: notClean });
      const summary = await strip(files);
      expect(summary.skipped).toEqual([{ name: A + STRIPPING_SUFFIX, reason: expect.stringMatching(/damaged/) }]);
      expect(summary.failed).toEqual([]);
      expect([...files.files.entries()]).toEqual([[A + STRIPPING_SUFFIX, notClean]]);
    });

    it('a truncated original next to a damaged copy: both are kept', async () => {
      const files = new MemoryStoredPhotoFiles({
        [A]: OLD_WITH_GPS.subarray(0, 50),
        [A + STRIPPING_SUFFIX]: OLD_WITH_GPS_STRIPPED.subarray(0, 60),
      });
      const summary = await strip(files);
      expect(summary.skipped.map((s) => s.name)).toEqual([A + STRIPPING_SUFFIX]);
      expect(files.files.size).toBe(2);
    });

    it('a recovery move that fails keeps the copy for the next run', async () => {
      const files = new MemoryStoredPhotoFiles({ [A + STRIPPING_SUFFIX]: OLD_WITH_GPS_STRIPPED });
      files.failWhen = (op) => op === 'replace';
      const summary = await strip(files);
      expect(summary.failed.map((f) => f.name)).toEqual([A + STRIPPING_SUFFIX]);
      expect(files.files.get(A + STRIPPING_SUFFIX)).toEqual(OLD_WITH_GPS_STRIPPED);
    });

    const START_STATES: [string, () => Record<string, Uint8Array>][] = [
      ['three photos', () => ({ [A]: OLD_WITH_GPS, [B]: TINY_JPEG, [C]: SIPS_JPEG })],
      [
        'a partial copy already on disk',
        () => ({ [A]: OLD_WITH_GPS, [A + STRIPPING_SUFFIX]: OLD_WITH_GPS_STRIPPED.subarray(0, 90), [B]: TINY_JPEG, [C]: SIPS_JPEG }),
      ],
    ];

    describe.each(['rename', 'copy'] as const)('%s move', (moveModel) => {
      it.each(START_STATES)(
        'starting from %s, at every crash point each photo keeps one complete copy, and the next run ends clean',
        async (_, start) => {
          // The process dies at the n-th file operation or move stage of the
          // first run (that and every later operation fails, including
          // cleanup), for every n until a run completes without dying.
          let reachedEnd = false;
          let points = 0;
          for (let crashAt = 0; !reachedEnd; crashAt++) {
            const files = new MemoryStoredPhotoFiles(start());
            files.moveModel = moveModel;
            let ops = 0;
            let dead = false;
            const dies = () => (dead ||= ops++ === crashAt);
            files.failWhen = (op) => op !== 'list' && dies();
            files.crashInsideReplace = () => dies();
            const first = await strip(files);
            reachedEnd = !dead;
            if (reachedEnd) expect(first.failed).toEqual([]);
            else points++;

            for (const [name, original, stripped] of [
              [A, OLD_WITH_GPS, OLD_WITH_GPS_STRIPPED],
              [B, TINY_JPEG, TINY_JPEG],
              [C, SIPS_JPEG, stripJpegMetadata(SIPS_JPEG)],
            ] as const) {
              const copies = [files.files.get(name), files.files.get(name + STRIPPING_SUFFIX)].filter(Boolean);
              const complete = copies.some((c) => equal(c!, original) || equal(c!, stripped));
              expect({ crashAt, name, complete }).toEqual({ crashAt, name, complete: true });
            }

            files.failWhen = null;
            files.crashInsideReplace = null;
            const next = await strip(files);
            expect({ crashAt, failed: next.failed, skipped: next.skipped }).toEqual({ crashAt, failed: [], skipped: [] });
            expect([...files.files.keys()].sort()).toEqual([A, B, C]);
            expect(files.files.get(A)).toEqual(OLD_WITH_GPS_STRIPPED);
            for (const name of [A, B, C]) expectClean(files.files.get(name));
          }
          // The copy model has two more crash points per swap than the rename model.
          expect(points).toBeGreaterThanOrEqual(moveModel === 'copy' ? 17 : 13);
        },
      );
    });
  });
});

describe('runPhotoMetadataBackfill', () => {
  const quiet = () => undefined;
  const run = (files: MemoryStoredPhotoFiles, log: MemoryMaintenanceLog, onError: (m: string, e: unknown) => void = quiet) =>
    runPhotoMetadataBackfill({ files, references: allReferenced(), log, onError });

  it('runs once: marks the task done, then skips without touching files', async () => {
    const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS, [B]: TINY_JPEG });
    const log = new MemoryMaintenanceLog();

    const first = await run(files, log);
    expect(first.status).toBe('done');
    expect(JSON.parse(log.done.get(PHOTO_METADATA_BACKFILL_KEY)!)).toEqual({ stripped: 1, clean: 1, recovered: 0, skipped: [] });
    expect(files.files.get(A)).toEqual(OLD_WITH_GPS_STRIPPED);

    files.calls.length = 0;
    expect(await run(files, log)).toEqual({ status: 'already-done' });
    expect(files.calls).toEqual([]);
  });

  it('permanent problems are logged and recorded, and the task is still marked done (no rescans)', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const sideways = withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order: 'II', orientation: 8 }));
    const files = new MemoryStoredPhotoFiles({ [A]: png, [B]: sideways, [C]: OLD_WITH_GPS });
    const log = new MemoryMaintenanceLog();
    const messages: string[] = [];

    const outcome = await run(files, log, (message) => messages.push(message));

    expect(outcome.status).toBe('done');
    expect(JSON.parse(log.done.get(PHOTO_METADATA_BACKFILL_KEY)!)).toEqual({
      stripped: 1,
      clean: 0,
      recovered: 0,
      skipped: [
        { name: A, reason: expect.stringMatching(/not a readable JPEG/) },
        { name: B, reason: expect.stringMatching(/orientation 8/) },
      ],
    });
    expect(messages).toEqual([expect.stringContaining(A), expect.stringContaining(B)]);
    expect(files.files.get(A)).toEqual(png);
    expect(files.files.get(B)).toEqual(sideways);
    files.calls.length = 0;
    expect(await run(files, log)).toEqual({ status: 'already-done' });
    expect(files.calls).toEqual([]);
  });

  it('transient failures are logged, the task is not marked done, and a later launch finishes it', async () => {
    const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS, [B]: OLD_WITH_GPS });
    files.failWhen = (op, name) => op === 'read' && name === B;
    const log = new MemoryMaintenanceLog();
    const errors: string[] = [];

    const first = await run(files, log, (message) => errors.push(message));
    expect(first.status).toBe('retry-next-launch');
    expect(errors).toEqual([expect.stringContaining(B)]);
    expect(log.done.size).toBe(0);
    expect(files.files.get(B)).toEqual(OLD_WITH_GPS);

    files.failWhen = null;
    const second = await run(files, log);
    expect(second).toMatchObject({ status: 'done', summary: { stripped: [B], clean: [A] } });
    expect(log.done.has(PHOTO_METADATA_BACKFILL_KEY)).toBe(true);
  });

  it('never rejects: listing, log, and reporter errors leave the task pending', async () => {
    const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
    const log = new MemoryMaintenanceLog();
    const throwingReporter = () => {
      throw new Error('reporter broke');
    };

    files.failWhen = (op) => op === 'list';
    await expect(run(files, log, throwingReporter)).resolves.toMatchObject({ status: 'retry-next-launch' });
    files.failWhen = null;

    log.failNext = new Error('database is locked');
    await expect(run(files, log)).resolves.toMatchObject({ status: 'retry-next-launch' });
    expect(files.files.get(A)).toEqual(OLD_WITH_GPS);

    // Fails on markDone, after the files were stripped: still pending, and the rerun is harmless.
    const flaky = new MemoryMaintenanceLog();
    const markDone = flaky.markDone.bind(flaky);
    flaky.markDone = async () => {
      throw new Error('disk full');
    };
    expect((await run(files, flaky)).status).toBe('retry-next-launch');
    flaky.markDone = markDone;
    expect(await run(files, flaky)).toMatchObject({ status: 'done', summary: { clean: [A], stripped: [] } });
  });

  it('reports cleanup errors that do not fail a file instead of swallowing them', async () => {
    const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
    // The copy is written, then the swap fails, then the cleanup cannot even check the copy.
    files.failWhen = (op, name) => op === 'replace' || (op === 'exists' && name === A + STRIPPING_SUFFIX);
    const messages: string[] = [];
    const outcome = await run(files, new MemoryMaintenanceLog(), (message) => messages.push(message));
    expect(outcome.status).toBe('retry-next-launch');
    expect(messages).toEqual([
      expect.stringContaining(`Could not clean up ${A}${STRIPPING_SUFFIX}`),
      expect.stringContaining(`failed for ${A}`),
    ]);
  });

  it('reports with console.warn by default', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const files = new MemoryStoredPhotoFiles({ [A]: new Uint8Array([1, 2, 3]) });
      await runPhotoMetadataBackfill({ files, references: allReferenced(), log: new MemoryMaintenanceLog() });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(A), expect.anything());
    } finally {
      warn.mockRestore();
    }
  });
});

describe('startPhotoMetadataBackfill', () => {
  it('starts at most once per process, even for a different database connection', async () => {
    let start!: typeof import('./photo-metadata-backfill').startPhotoMetadataBackfill;
    jest.isolateModules(() => {
      // A fresh module copy, so the once-per-process flag starts unset.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      start = require('./photo-metadata-backfill').startPhotoMetadataBackfill;
    });
    const files = new MemoryStoredPhotoFiles({ [A]: OLD_WITH_GPS });
    const deps = () => ({ files, references: allReferenced(), log: new MemoryMaintenanceLog(), onError: () => undefined });
    const first = start(deps());
    expect(start(deps())).toBeNull();
    expect((await first)?.status).toBe('done');
    expect(start(deps())).toBeNull();
  });
});
