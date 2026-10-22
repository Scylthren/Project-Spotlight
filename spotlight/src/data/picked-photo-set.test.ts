import { userColor, type PhotoDraft } from '@/core';

import { addClosetItem } from './add-closet-item';
import type { ImageProcessor, ProcessedImage } from './image-processor';
import { InMemoryClosetRepository } from './in-memory-closet-repository';
import { MemoryImageStore } from './memory-image-store';
import { PickedPhotoSet, placePickedPhoto } from './picked-photo-set';
import { RecordingTemporaryFiles, type TemporaryFiles } from './temporary-files';

const FRONT = 'file:///cache/ImagePicker/FRONT.jpeg';
const BACK = 'file:///cache/ImagePicker/BACK.jpeg';
const DETAIL = 'file:///cache/ImagePicker/DETAIL.jpeg';
const photo = (uri: string) => ({ uri, width: 10, height: 10 });

/** Waits for pending promise callbacks to run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Fake cache directory: discard really deletes, and every step is logged. */
class FakeCache implements TemporaryFiles {
  readonly files = new Set<string>();
  constructor(private readonly log: string[]) {}
  async discard(uri: string): Promise<void> {
    this.log.push(`discard ${uri}`);
    this.files.delete(uri);
  }
}

/** Waits for `release()` before reading any source, and fails if the source is gone by then. */
class BlockedProcessor implements ImageProcessor {
  release!: () => void;
  private readonly gate = new Promise<void>((resolve) => (this.release = resolve));
  private count = 0;
  constructor(
    private readonly cache: FakeCache,
    private readonly log: string[],
  ) {}
  async prepareForStorage(sourceUri: string): Promise<ProcessedImage> {
    await this.gate;
    if (!this.cache.files.has(sourceUri)) throw new Error(`ENOENT ${sourceUri}`);
    this.log.push(`read ${sourceUri}`);
    return { uri: `file:///cache/ImageManipulator/out${++this.count}.jpg`, width: 10, height: 10 };
  }
  async prepareForUpload(): Promise<never> {
    throw new Error('not used in these tests');
  }
}

const draft = (id: string, uri: string, role: PhotoDraft['role']): PhotoDraft => ({
  kind: 'picked',
  id,
  uri,
  role,
  isPrimary: role === 'front',
});

describe('PickedPhotoSet during a save', () => {
  it('closing the form while a multi-photo save reads the picks waits for the save, which succeeds', async () => {
    const log: string[] = [];
    const cache = new FakeCache(log);
    for (const uri of [FRONT, BACK, DETAIL]) cache.files.add(uri);
    const imageProcessor = new BlockedProcessor(cache, log);
    const repository = new InMemoryClosetRepository();
    const set = new PickedPhotoSet(cache);
    await set.hold('f', photo(FRONT));
    await set.hold('b', photo(BACK));
    await set.hold('d', photo(DETAIL));

    const save = set.whileInUse(() =>
      addClosetItem(
        {
          photos: [draft('f', FRONT, 'front'), draft('b', BACK, 'back'), draft('d', DETAIL, 'detail')],
          category: 'top',
          colors: [userColor('red')],
          seasons: ['summer'],
          tags: [],
        },
        { repository, imageStore: new MemoryImageStore(), imageProcessor, temporaryFiles: cache, newId: () => 'item-1' },
      ),
    );
    await flush();
    const closing = set.close();
    await flush();
    expect([...cache.files]).toEqual([FRONT, BACK, DETAIL]);
    expect(log).toEqual([]);

    imageProcessor.release();
    const result = await save;
    await closing;

    expect(result.ok).toBe(true);
    expect((await repository.get('item-1'))?.photos.map((p) => p.role)).toEqual(['front', 'back', 'detail']);
    for (const uri of [FRONT, BACK, DETAIL]) {
      expect(log.indexOf(`read ${uri}`)).toBeGreaterThanOrEqual(0);
      expect(log.lastIndexOf(`discard ${uri}`)).toBeGreaterThan(log.indexOf(`read ${uri}`));
    }
    expect(cache.files.size).toBe(0);
    expect(set.keys).toEqual([]);
  });

  it('releasing one photo during a save waits for the save', async () => {
    const files = new RecordingTemporaryFiles();
    const set = new PickedPhotoSet(files);
    await set.hold('f', photo(FRONT));
    await set.hold('b', photo(BACK));
    let finish!: () => void;
    const save = set.whileInUse(() => new Promise<void>((resolve) => (finish = resolve)));
    const releasing = set.release('b');
    await flush();
    expect(files.discarded).toEqual([]);
    finish();
    await save;
    await releasing;
    expect(files.discarded).toEqual([BACK]);
    expect(set.get('f')?.uri).toBe(FRONT);
  });

  it('after a failed save and a close, every pick is deleted', async () => {
    const files = new RecordingTemporaryFiles();
    const set = new PickedPhotoSet(files);
    await set.hold('f', photo(FRONT));
    await set.hold('d', photo(DETAIL));
    let fail!: (error: Error) => void;
    const save = set.whileInUse(() => new Promise<never>((_, reject) => (fail = reject)));
    const closing = set.close();
    await flush();
    expect(files.discarded).toEqual([]);
    fail(new Error('disk full'));
    await expect(save).rejects.toThrow('disk full');
    await closing;
    expect(files.discarded).toEqual([FRONT, DETAIL]);
  });
});

describe('PickedPhotoSet keys', () => {
  it('holds one photo per key; a retake under the same key deletes the old pick only', async () => {
    const files = new RecordingTemporaryFiles();
    const set = new PickedPhotoSet(files);
    await set.hold('f', photo(FRONT));
    await set.hold('b', photo(BACK));
    await set.hold('f', photo(DETAIL));
    expect(files.discarded).toEqual([FRONT]);
    expect(set.get('f')?.uri).toBe(DETAIL);
    expect(set.get('b')?.uri).toBe(BACK);
    expect(set.keys).toEqual(['f', 'b']);
    // Holding the same file again is not a replacement.
    await set.hold('b', photo(BACK));
    expect(files.discarded).toEqual([FRONT]);
  });

  it('release deletes only that pick, and ignores unknown keys', async () => {
    const files = new RecordingTemporaryFiles();
    const set = new PickedPhotoSet(files);
    await set.hold('f', photo(FRONT));
    await set.hold('b', photo(BACK));
    await set.release('b');
    await set.release('nope');
    expect(files.discarded).toEqual([BACK]);
    expect(set.get('b')).toBeNull();
    expect(set.keys).toEqual(['f']);
  });

  it('never deletes a file that another key still holds', async () => {
    const files = new RecordingTemporaryFiles();
    const set = new PickedPhotoSet(files);
    await set.hold('a', photo(FRONT));
    await set.hold('b', photo(FRONT));
    await set.release('a');
    expect(files.discarded).toEqual([]);
    await set.release('b');
    expect(files.discarded).toEqual([FRONT]);
  });

  it('clear deletes every pick', async () => {
    const files = new RecordingTemporaryFiles();
    const set = new PickedPhotoSet(files);
    await set.hold('f', photo(FRONT));
    await set.hold('b', photo(BACK));
    await set.clear();
    expect(files.discarded).toEqual([FRONT, BACK]);
    expect(set.keys).toEqual([]);
    expect(set.isClosed).toBe(false);
  });

  it('a failing delete is reported and does not stop the others', async () => {
    const files = new RecordingTemporaryFiles();
    const onError = jest.fn();
    const set = new PickedPhotoSet(files, onError);
    await set.hold('f', photo(FRONT));
    await set.hold('b', photo(BACK));
    const error = new Error('EACCES');
    files.failNext = error;
    await set.clear();
    expect(onError).toHaveBeenCalledWith(error, FRONT);
    expect(files.discarded).toEqual([BACK]);
  });
});

describe('PickedPhotoSet after close', () => {
  it('discards a photo offered after close, and holds again after open', async () => {
    const files = new RecordingTemporaryFiles();
    const set = new PickedPhotoSet(files);
    await set.close();
    expect(set.isClosed).toBe(true);
    await set.hold('f', photo(FRONT));
    expect(set.get('f')).toBeNull();
    expect(files.discarded).toEqual([FRONT]);
    set.open();
    await set.hold('b', photo(BACK));
    expect(set.get('b')?.uri).toBe(BACK);
    expect(files.discarded).toEqual([FRONT]);
  });
});

describe('placePickedPhoto', () => {
  const stored: PhotoDraft = { kind: 'stored', id: 's-front', role: 'front', isPrimary: true, path: 'closet-images/a.jpg' };

  async function setWith(files: RecordingTemporaryFiles, ...drafts: PhotoDraft[]): Promise<PickedPhotoSet> {
    const set = new PickedPhotoSet(files);
    for (const d of drafts) if (d.kind === 'picked') await set.hold(d.id, photo(d.uri));
    return set;
  }

  it('adds a new photo, holds it, and passes the new photos to apply before resolving', async () => {
    const files = new RecordingTemporaryFiles();
    const front = draft('f', FRONT, 'front');
    const set = await setWith(files, front);
    const applied: PhotoDraft[][] = [];

    const result = await placePickedPhoto(set, [front], { kind: 'add', role: 'back' }, { key: 'b', photo: photo(BACK) }, (p) =>
      applied.push(p),
    );

    expect(result).toEqual({ ok: true, id: 'b' });
    expect(applied).toEqual([[front, { kind: 'picked', id: 'b', uri: BACK, role: 'back', isPrimary: false }]]);
    expect(set.keys).toEqual(['f', 'b']);
    expect(files.discarded).toEqual([]);
  });

  it('retaking a photo picked in this form releases (deletes) the replaced pick', async () => {
    const files = new RecordingTemporaryFiles();
    const front = draft('f', FRONT, 'front');
    const back = draft('b', BACK, 'back');
    const set = await setWith(files, front, back);
    let applied: PhotoDraft[] = [];

    const result = await placePickedPhoto(set, [front, back], { kind: 'retake', id: 'b' }, { key: 'b2', photo: photo(DETAIL) }, (p) => {
      applied = p;
    });

    expect(result).toEqual({ ok: true, id: 'b2' });
    expect(applied.map((p) => p.id)).toEqual(['f', 'b2']);
    expect(applied[1]).toMatchObject({ kind: 'picked', uri: DETAIL, role: 'back', isPrimary: false });
    expect(files.discarded).toEqual([BACK]);
    expect(set.get('b')).toBeNull();
    expect(set.keys).toEqual(['f', 'b2']);
  });

  it('retaking the primary front keeps it primary and deletes the old front pick', async () => {
    const files = new RecordingTemporaryFiles();
    const front = draft('f', FRONT, 'front');
    const set = await setWith(files, front);
    let applied: PhotoDraft[] = [];
    await placePickedPhoto(set, [front], { kind: 'retake', id: 'f' }, { key: 'f2', photo: photo(DETAIL) }, (p) => {
      applied = p;
    });
    expect(applied).toEqual([{ kind: 'picked', id: 'f2', uri: DETAIL, role: 'front', isPrimary: true }]);
    expect(files.discarded).toEqual([FRONT]);
  });

  it('retaking a stored photo deletes nothing (the edit save removes the old file)', async () => {
    const files = new RecordingTemporaryFiles();
    const set = new PickedPhotoSet(files);
    const result = await placePickedPhoto(set, [stored], { kind: 'retake', id: 's-front' }, { key: 'n', photo: photo(FRONT) }, () => undefined);
    expect(result).toEqual({ ok: true, id: 'n' });
    expect(files.discarded).toEqual([]);
    expect(set.keys).toEqual(['n']);
  });

  it('discards a pick that no longer fits, leaving the photos and other picks alone', async () => {
    const files = new RecordingTemporaryFiles();
    const front = draft('f', FRONT, 'front');
    const back = draft('b', BACK, 'back');
    const set = await setWith(files, front, back);
    const apply = jest.fn();

    const full = await placePickedPhoto(set, [front, back], { kind: 'add', role: 'back' }, { key: 'x', photo: photo(DETAIL) }, apply);
    const gone = await placePickedPhoto(set, [front], { kind: 'retake', id: 'zzz' }, { key: 'y', photo: photo(DETAIL) }, apply);

    expect(full).toEqual({ ok: false, problem: 'role_full' });
    expect(gone).toEqual({ ok: false, problem: 'not_found' });
    expect(apply).not.toHaveBeenCalled();
    expect(files.discarded).toEqual([DETAIL, DETAIL]);
    expect(set.keys).toEqual(['f', 'b']);
  });

  it('discards a pick that returns after the form closed', async () => {
    const files = new RecordingTemporaryFiles();
    const set = new PickedPhotoSet(files);
    await set.close();
    const apply = jest.fn();
    const result = await placePickedPhoto(set, [], { kind: 'add', role: 'front' }, { key: 'f', photo: photo(FRONT) }, apply);
    expect(result).toEqual({ ok: false, problem: 'closed' });
    expect(apply).not.toHaveBeenCalled();
    expect(files.discarded).toEqual([FRONT]);
  });

  it('discards the pick when the form is gone even if the set was not closed', async () => {
    const files = new RecordingTemporaryFiles();
    const set = new PickedPhotoSet(files);
    const apply = jest.fn();
    const result = await placePickedPhoto(set, [], { kind: 'add', role: 'front' }, { key: 'f', photo: photo(FRONT) }, apply, false);
    expect(result).toEqual({ ok: false, problem: 'closed' });
    expect(apply).not.toHaveBeenCalled();
    expect(files.discarded).toEqual([FRONT]);
    expect(set.keys).toEqual([]);
  });

  it('applies at once but deletes the replaced pick only after a running save settles', async () => {
    const files = new RecordingTemporaryFiles();
    const front = draft('f', FRONT, 'front');
    const set = await setWith(files, front);
    let finish!: () => void;
    const save = set.whileInUse(() => new Promise<void>((resolve) => (finish = resolve)));
    const apply = jest.fn();

    const placing = placePickedPhoto(set, [front], { kind: 'retake', id: 'f' }, { key: 'f2', photo: photo(DETAIL) }, apply);
    expect(apply).toHaveBeenCalledTimes(1);
    await flush();
    expect(files.discarded).toEqual([]);

    finish();
    await save;
    expect(await placing).toEqual({ ok: true, id: 'f2' });
    expect(files.discarded).toEqual([FRONT]);
  });
});
