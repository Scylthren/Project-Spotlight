import { makeColor, makeItem, makePhoto } from './closet-repository.contract';
import { editClosetItem } from './edit-closet-item';
import type { ImageProcessor, ProcessedImage } from './image-processor';
import { InMemoryClosetRepository } from './in-memory-closet-repository';
import { MemoryImageStore } from './memory-image-store';
import { PickedPhotoSlot } from './picked-photo-slot';
import { RecordingTemporaryFiles, type TemporaryFiles } from './temporary-files';

const PICK = 'file:///cache/ImagePicker/PICK.jpeg';
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

/** Waits for `release()` before reading the source, and fails if the source is gone by then. */
class BlockedProcessor implements ImageProcessor {
  release!: () => void;
  private readonly gate = new Promise<void>((resolve) => (this.release = resolve));
  constructor(
    private readonly cache: FakeCache,
    private readonly log: string[],
  ) {}
  async prepareForStorage(sourceUri: string): Promise<ProcessedImage> {
    await this.gate;
    if (!this.cache.files.has(sourceUri)) throw new Error(`ENOENT ${sourceUri}`);
    this.log.push(`read ${sourceUri}`);
    return { uri: 'file:///cache/ImageManipulator/out.jpg', width: 10, height: 10 };
  }
}

describe('PickedPhotoSlot during a save', () => {
  it('a clear or close while the save is reading the photo waits for the save, which succeeds', async () => {
    const log: string[] = [];
    const cache = new FakeCache(log);
    cache.files.add(PICK);
    const imageProcessor = new BlockedProcessor(cache, log);
    const repository = new InMemoryClosetRepository([
      makeItem({ id: 'item-1', photos: [makePhoto('item-1', { path: 'closet-images/old.jpg' })] }),
    ]);
    const imageStore = new MemoryImageStore();
    const slot = new PickedPhotoSlot(cache);
    await slot.replace(photo(PICK));

    const save = slot.whileInUse(() =>
      editClosetItem(
        'item-1',
        {
          photos: [{ kind: 'picked', id: 'new-front', uri: PICK, role: 'front', isPrimary: true }],
          category: 'top',
          colors: [makeColor('red')],
          seasons: ['summer'],
          tags: [],
        },
        { repository, imageStore, imageProcessor, temporaryFiles: cache },
      ),
    );
    await flush();
    // The user leaves the screen while the processor is still busy.
    const closing = slot.close();
    await flush();
    expect(cache.files.has(PICK)).toBe(true);
    expect(log).toEqual([]);

    imageProcessor.release();
    const result = await save;
    await closing;

    expect(result.ok).toBe(true);
    expect((await repository.get('item-1'))?.category).toBe('top');
    expect(log.indexOf(`read ${PICK}`)).toBeGreaterThanOrEqual(0);
    expect(log.indexOf(`discard ${PICK}`)).toBeGreaterThan(log.indexOf(`read ${PICK}`));
    expect(cache.files.has(PICK)).toBe(false);
  });

  it('deletes the photo after a failed save once the form is closed', async () => {
    const files = new RecordingTemporaryFiles();
    const slot = new PickedPhotoSlot(files);
    await slot.replace(photo(PICK));
    let fail!: (error: Error) => void;
    const save = slot.whileInUse(() => new Promise<never>((_, reject) => (fail = reject)));
    const closing = slot.close();
    await flush();
    expect(files.discarded).toEqual([]);
    fail(new Error('disk full'));
    await expect(save).rejects.toThrow('disk full');
    await closing;
    expect(files.discarded).toEqual([PICK]);
  });

  it('a replace during a save delays deleting the previous pick too', async () => {
    const files = new RecordingTemporaryFiles();
    const slot = new PickedPhotoSlot(files);
    await slot.replace(photo(PICK));
    let finish!: () => void;
    const save = slot.whileInUse(() => new Promise<void>((resolve) => (finish = resolve)));
    const replacing = slot.replace(photo('file:///cache/ImagePicker/NEXT.jpeg'));
    await flush();
    expect(files.discarded).toEqual([]);
    finish();
    await save;
    await replacing;
    expect(files.discarded).toEqual([PICK]);
  });
});

describe('PickedPhotoSlot after close', () => {
  it('discards a photo offered after close, e.g. from a picker that was still open', async () => {
    const files = new RecordingTemporaryFiles();
    const slot = new PickedPhotoSlot(files);
    await slot.close();
    expect(slot.isClosed).toBe(true);
    await slot.replace(photo(PICK));
    expect(slot.current).toBeNull();
    expect(files.discarded).toEqual([PICK]);
  });

  it('holds photos again after open', async () => {
    const files = new RecordingTemporaryFiles();
    const slot = new PickedPhotoSlot(files);
    await slot.close();
    slot.open();
    await slot.replace(photo(PICK));
    expect(slot.current?.uri).toBe(PICK);
    expect(files.discarded).toEqual([]);
  });
});
