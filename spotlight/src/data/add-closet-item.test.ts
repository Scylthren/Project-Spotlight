import type { ClothingItem } from '@/core';

import { ADD_ITEM_MESSAGES, addClosetItem, generateItemId, type AddItemForm } from './add-closet-item';
import { ClosetRepositoryError, type ClosetRepository } from './closet-repository';
import { FakeImageProcessor } from './image-processor';
import { InMemoryClosetRepository } from './in-memory-closet-repository';
import { MemoryImageStore } from './memory-image-store';
import { QueuedPhotoPicker } from './photo-picker';
import { RecordingTemporaryFiles } from './temporary-files';

const NOW = new Date('2026-02-01T12:00:00.000Z');
const PICKED = 'file:///cache/ImagePicker/ABC.jpeg';
/** What FakeImageProcessor returns for its first call. */
const PROCESSED = 'file:///processed/p1.jpg';

function form(overrides: Partial<AddItemForm> = {}): AddItemForm {
  return { photoUri: PICKED, category: 'bottom', colorsText: 'Blue, white', seasons: ['summer'], tags: [], ...overrides };
}

function setup() {
  const repository = new InMemoryClosetRepository();
  const imageStore = new MemoryImageStore();
  const imageProcessor = new FakeImageProcessor();
  const temporaryFiles = new RecordingTemporaryFiles();
  const deps = { repository, imageStore, imageProcessor, temporaryFiles, newId: () => 'id-1', now: () => NOW };
  return { repository, imageStore, imageProcessor, temporaryFiles, deps };
}

describe('addClosetItem', () => {
  it('shrinks the picked photo, copies the result, stores the item with the stored reference, and returns it', async () => {
    const { repository, imageStore, imageProcessor, deps } = setup();
    const result = await addClosetItem(form(), deps);

    const expected: ClothingItem = {
      id: 'id-1',
      // Always .jpg: the processor re-encodes to JPEG whatever the source was named.
      imageUri: 'closet-images/id-1-m1.jpg',
      category: 'bottom',
      colors: ['blue', 'white'],
      seasons: ['summer'],
      tags: [],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    expect(result).toEqual({ ok: true, item: expected });
    expect(imageProcessor.inputs).toEqual([PICKED]);
    // The stored file is the processed copy, never the raw pick.
    expect(imageStore.files.get('closet-images/id-1-m1.jpg')).toBe(PROCESSED);
    expect(imageProcessor.outputs.get(PROCESSED)).toBe(PICKED);
    expect(imageStore.files.size).toBe(1);
    expect(await repository.list()).toEqual([expected]);
  });

  it('works end to end from a picker result', async () => {
    const { repository, deps } = setup();
    const picked = await new QueuedPhotoPicker([
      { status: 'picked', photo: { uri: PICKED, width: 10, height: 10 } },
    ]).pick('library');
    expect(picked.status).toBe('picked');
    const uri = picked.status === 'picked' ? picked.photo.uri : null;
    expect((await addClosetItem(form({ photoUri: uri }), deps)).ok).toBe(true);
    expect(await repository.list()).toHaveLength(1);
  });

  it('works end to end from a camera photo with a .heic name, storing a .jpg', async () => {
    const { repository, imageStore, deps } = setup();
    const camera = new QueuedPhotoPicker([
      { status: 'picked', photo: { uri: 'file:///cache/ImagePicker/IMG_0001.HEIC', width: 4032, height: 3024 } },
    ]);
    const picked = await camera.pick('camera');
    expect(camera.calls).toEqual(['camera']);
    const uri = picked.status === 'picked' ? picked.photo.uri : null;
    const result = await addClosetItem(form({ photoUri: uri }), deps);
    expect(result.ok && result.item.imageUri).toBe('closet-images/id-1-m1.jpg');
    expect([...imageStore.files.keys()]).toEqual(['closet-images/id-1-m1.jpg']);
    expect(await repository.list()).toHaveLength(1);
  });

  it('a cancelled pick leaves no photo, so saving is refused with a clear message', async () => {
    const { repository, imageStore, deps } = setup();
    const picked = await new QueuedPhotoPicker([{ status: 'cancelled' }]).pick('camera');
    expect(picked).toEqual({ status: 'cancelled' });
    const result = await addClosetItem(form({ photoUri: null }), deps);
    expect(result).toEqual({ ok: false, errors: [ADD_ITEM_MESSAGES.noPhoto] });
    expect(imageStore.files.size).toBe(0);
    expect(await repository.list()).toEqual([]);
  });

  it('reports every form problem at once and copies nothing', async () => {
    const { repository, imageStore, imageProcessor, deps } = setup();
    const result = await addClosetItem(
      { photoUri: null, category: null, colorsText: ' , ', seasons: [], tags: [] },
      deps,
    );
    expect(result).toEqual({
      ok: false,
      errors: [
        ADD_ITEM_MESSAGES.noPhoto,
        ADD_ITEM_MESSAGES.noCategory,
        ADD_ITEM_MESSAGES.noColors,
        ADD_ITEM_MESSAGES.noSeasons,
      ],
    });
    expect(imageProcessor.inputs).toEqual([]);
    expect(imageStore.files.size).toBe(0);
    expect(await repository.list()).toEqual([]);
  });

  it('passes through validation errors it has no friendly text for', async () => {
    const { deps } = setup();
    const result = await addClosetItem(form({ seasons: ['summer', 'summer'] }), deps);
    expect(result).toEqual({ ok: false, errors: ['seasons must not contain duplicates'] });
  });

  it('if processing the photo fails, reports it and leaves no stored file and no item', async () => {
    const { repository, imageStore, imageProcessor, deps } = setup();
    imageProcessor.failNext = new Error('cannot decode image');
    const save = jest.spyOn(imageStore, 'save');
    const result = await addClosetItem(form(), deps);
    expect(result).toEqual({ ok: false, errors: [ADD_ITEM_MESSAGES.processFailed] });
    expect(imageProcessor.inputs).toEqual([PICKED]);
    expect(save).not.toHaveBeenCalled();
    expect(imageStore.files.size).toBe(0);
    expect(await repository.list()).toEqual([]);
  });

  it('reports a failed copy and saves nothing', async () => {
    const { repository, imageStore, deps } = setup();
    imageStore.failNextSave = new Error('ENOSPC');
    const result = await addClosetItem(form(), deps);
    expect(result).toEqual({ ok: false, errors: [ADD_ITEM_MESSAGES.copyFailed] });
    expect(await repository.list()).toEqual([]);
  });

  it('removes the copied photo if the repository rejects the item', async () => {
    const { imageStore, deps } = setup();
    const failing: ClosetRepository = {
      list: async () => [],
      get: async () => null,
      add: async () => {
        throw new ClosetRepositoryError('duplicate', 'exists');
      },
      update: async () => undefined,
      remove: async () => undefined,
      listTags: async () => [],
      deleteTag: async () => undefined,
    };
    const result = await addClosetItem(form(), { ...deps, repository: failing });
    expect(result).toEqual({ ok: false, errors: [ADD_ITEM_MESSAGES.saveFailed] });
    expect(imageStore.files.size).toBe(0);
  });

  it('a duplicate id never touches the existing item or its photo', async () => {
    const { repository, imageStore, deps } = setup();
    const first = await addClosetItem(form(), deps);
    expect(first.ok).toBe(true);
    const original = first.ok ? first.item : null;
    const originalFile = imageStore.files.get(original!.imageUri);
    expect(originalFile).toBe(PROCESSED);

    // Same id again (deps.newId always returns 'id-1'): the repository rejects it.
    const second = await addClosetItem(form({ photoUri: 'file:///cache/OTHER.jpeg', colorsText: 'red' }), deps);
    expect(second).toEqual({ ok: false, errors: [ADD_ITEM_MESSAGES.saveFailed] });

    expect(await repository.list()).toEqual([original]);
    expect(imageStore.files.get(original!.imageUri)).toBe(originalFile);
    // The second call's own copy was cleaned up, and nothing else remains.
    expect([...imageStore.files.keys()]).toEqual([original!.imageUri]);
  });

  it('still reports the save failure if cleanup also fails', async () => {
    const { imageStore, deps } = setup();
    imageStore.remove = async () => {
      throw new Error('cleanup failed');
    };
    const failing: ClosetRepository = {
      list: async () => [],
      get: async () => null,
      add: async () => {
        throw new Error('disk I/O error');
      },
      update: async () => undefined,
      remove: async () => undefined,
      listTags: async () => [],
      deleteTag: async () => undefined,
    };
    const result = await addClosetItem(form(), { ...deps, repository: failing });
    expect(result).toEqual({ ok: false, errors: [ADD_ITEM_MESSAGES.saveFailed] });
  });
});

describe('addClosetItem tags', () => {
  it('saves normalized tags and adds new ones to the saved list', async () => {
    const { repository, deps } = setup();
    const result = await addClosetItem(form({ tags: [' 90S ', 'emo'] }), deps);
    expect(result.ok && result.item.tags).toEqual(['90s', 'emo']);
    expect((await repository.get('id-1'))?.tags).toEqual(['90s', 'emo']);
    expect(await repository.listTags()).toEqual([
      { name: '90s', itemCount: 1 },
      { name: 'emo', itemCount: 1 },
    ]);
  });

  it('refuses too many tags with the user-facing message and stores nothing', async () => {
    const { repository, imageProcessor, deps } = setup();
    const result = await addClosetItem(form({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }), deps);
    expect(result).toEqual({ ok: false, errors: ['An item can have at most 10 tags.'] });
    expect(imageProcessor.inputs).toEqual([]);
    expect(await repository.listTags()).toEqual([]);
  });

  it('maps any other tag problem to one friendly message', async () => {
    const { deps } = setup();
    const result = await addClosetItem(form({ tags: ['x'.repeat(31)] }), deps);
    expect(result).toEqual({ ok: false, errors: [ADD_ITEM_MESSAGES.badTags] });
  });
});

describe('addClosetItem temporary files', () => {
  it('after a successful save, deletes the processed JPEG and the picked photo', async () => {
    const { temporaryFiles, deps } = setup();
    expect((await addClosetItem(form(), deps)).ok).toBe(true);
    expect(temporaryFiles.discarded).toEqual([PROCESSED, PICKED]);
  });

  it('a failed copy deletes the processed JPEG but keeps the pick for a retry', async () => {
    const { imageStore, temporaryFiles, deps } = setup();
    imageStore.failNextSave = new Error('ENOSPC');
    expect((await addClosetItem(form(), deps)).ok).toBe(false);
    expect(temporaryFiles.discarded).toEqual([PROCESSED]);
  });

  it('a failed processing step or a rejected form deletes nothing', async () => {
    const { imageProcessor, temporaryFiles, deps } = setup();
    imageProcessor.failNext = new Error('cannot decode');
    expect((await addClosetItem(form(), deps)).ok).toBe(false);
    expect((await addClosetItem(form({ category: null }), deps)).ok).toBe(false);
    expect(temporaryFiles.discarded).toEqual([]);
  });

  it('a failed repository save deletes the processed JPEG but keeps the pick', async () => {
    const { repository, temporaryFiles, deps } = setup();
    await repository.add({ ...existingItem(), id: 'id-1' });
    expect((await addClosetItem(form(), deps)).ok).toBe(false);
    expect(temporaryFiles.discarded).toEqual([PROCESSED]);
  });

  it('a cleanup failure does not fail the save', async () => {
    const { repository, temporaryFiles, deps } = setup();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    temporaryFiles.failNext = new Error('EACCES');
    const result = await addClosetItem(form(), deps);
    expect(result.ok).toBe(true);
    expect(await repository.list()).toHaveLength(1);
    // The first discard (processed JPEG) failed; the second still ran.
    expect(temporaryFiles.discarded).toEqual([PICKED]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

function existingItem(): ClothingItem {
  return {
    id: 'x',
    imageUri: 'closet-images/x.jpg',
    category: 'top',
    colors: ['red'],
    seasons: ['winter'],
    tags: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

describe('generateItemId', () => {
  it('is deterministic for a given clock and random source, and file-name safe', () => {
    const id = generateItemId(() => 0.5, () => 1_700_000_000_000);
    expect(id).toBe(`${(1_700_000_000_000).toString(36)}-${'i'.repeat(12)}`);
    expect(generateItemId()).toMatch(/^[a-z0-9]+-[a-z0-9]{12}$/);
  });

  it('produces distinct ids in practice', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateItemId()));
    expect(ids.size).toBe(1000);
  });
});
