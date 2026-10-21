import type { ClothingItem } from '@/core';

import { CLOSET_ITEM_MESSAGES } from './add-closet-item';
import { makeItem } from './closet-repository.contract';
import { ClosetRepositoryError, type ClosetRepository } from './closet-repository';
import { editClosetItem, type EditItemForm } from './edit-closet-item';
import { FakeImageProcessor } from './image-processor';
import { InMemoryClosetRepository } from './in-memory-closet-repository';
import { MemoryImageStore } from './memory-image-store';
import { RecordingTemporaryFiles } from './temporary-files';

const NOW = new Date('2026-03-10T09:00:00.000Z');
const OLD_REF = 'closet-images/item-1-old.jpg';
const NEW_PICK = 'file:///cache/ImagePicker/NEW.png';
/** What FakeImageProcessor returns for its first call. */
const PROCESSED = 'file:///processed/p1.jpg';

function form(overrides: Partial<EditItemForm> = {}): EditItemForm {
  return { newPhotoUri: null, category: 'outerwear', colorsText: 'Olive, Black', seasons: ['autumn'], tags: [], ...overrides };
}

function setup() {
  const original = makeItem({ imageUri: OLD_REF });
  const repository = new InMemoryClosetRepository([original]);
  const imageStore = new MemoryImageStore();
  imageStore.files.set(OLD_REF, 'file:///cache/original.jpg');
  const imageProcessor = new FakeImageProcessor();
  const onCleanupError = jest.fn();
  const temporaryFiles = new RecordingTemporaryFiles();
  const deps = { repository, imageStore, imageProcessor, temporaryFiles, now: () => NOW, onCleanupError };
  return { original, repository, imageStore, imageProcessor, temporaryFiles, deps, onCleanupError };
}

/** Wraps a repository so every `update` call is recorded in `calls`. */
function countingUpdate(repo: ClosetRepository, calls: ClothingItem[]): ClosetRepository {
  return {
    list: () => repo.list(),
    get: (id) => repo.get(id),
    add: (item) => repo.add(item),
    update: async (item) => {
      calls.push(item);
      await repo.update(item);
    },
    remove: (id) => repo.remove(id),
    listTags: () => repo.listTags(),
    deleteTag: (name) => repo.deleteTag(name),
  };
}

/** Wraps a repository so `update` fails with `error`. */
function failingUpdate(repo: ClosetRepository, error: Error): ClosetRepository {
  return {
    list: () => repo.list(),
    get: (id) => repo.get(id),
    add: (item) => repo.add(item),
    update: async () => {
      throw error;
    },
    remove: (id) => repo.remove(id),
    listTags: () => repo.listTags(),
    deleteTag: (name) => repo.deleteTag(name),
  };
}

describe('editClosetItem', () => {
  it('updates the fields, keeps createdAt and the photo, and bumps updatedAt', async () => {
    const { original, repository, imageStore, imageProcessor, deps } = setup();
    const result = await editClosetItem('item-1', form(), deps);

    const expected: ClothingItem = {
      ...original,
      category: 'outerwear',
      colors: ['olive', 'black'],
      seasons: ['autumn'],
      updatedAt: NOW.toISOString(),
    };
    expect(result).toEqual({ ok: true, item: expected, changed: true });
    expect(await repository.get('item-1')).toEqual(expected);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF]);
    expect(imageProcessor.inputs).toEqual([]);
  });

  it('replaces the photo: shrinks and copies the new one, updates the row, then deletes the old file', async () => {
    const { repository, imageStore, imageProcessor, deps, onCleanupError } = setup();
    const newRef = 'closet-images/item-1-m1.jpg';
    const order: string[] = [];
    const prepare = imageProcessor.prepareForStorage.bind(imageProcessor);
    imageProcessor.prepareForStorage = async (uri) => {
      order.push(`process:${uri}`);
      return prepare(uri);
    };
    const save = imageStore.save.bind(imageStore);
    imageStore.save = async (uri, itemId, extension) => {
      order.push(`save:${uri}`);
      return save(uri, itemId, extension);
    };
    const remove = imageStore.remove.bind(imageStore);
    imageStore.remove = async (ref) => {
      order.push(`remove:${ref}`);
      await remove(ref);
    };
    const tracked: ClosetRepository = {
      ...countingUpdate(repository, []),
      update: async (item) => {
        order.push(`update:${item.imageUri}`);
        await repository.update(item);
      },
    };

    const result = await editClosetItem('item-1', form({ newPhotoUri: NEW_PICK }), { ...deps, repository: tracked });

    expect(order).toEqual([`process:${NEW_PICK}`, `save:${PROCESSED}`, `update:${newRef}`, `remove:${OLD_REF}`]);
    expect(result.ok && result.item.imageUri).toBe(newRef);
    expect(result.ok && result.changed).toBe(true);
    expect((await repository.get('item-1'))?.imageUri).toBe(newRef);
    // Stored as .jpg (the processed JPEG), even though the pick was a .png.
    expect([...imageStore.files]).toEqual([[newRef, PROCESSED]]);
    expect(onCleanupError).not.toHaveBeenCalled();
  });

  it('if processing the new photo fails, nothing is stored and the item and old photo are unchanged', async () => {
    const { original, repository, imageStore, imageProcessor, deps } = setup();
    imageProcessor.failNext = new Error('cannot decode image');
    const updates: ClothingItem[] = [];
    const save = jest.spyOn(imageStore, 'save');
    const result = await editClosetItem('item-1', form({ newPhotoUri: NEW_PICK }), {
      ...deps,
      repository: countingUpdate(repository, updates),
    });

    expect(result).toEqual({ ok: false, errors: [CLOSET_ITEM_MESSAGES.processFailed] });
    expect(save).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
    expect(await repository.get('item-1')).toEqual(original);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF]);
  });

  it('with no changes, writes nothing, keeps updatedAt, and still succeeds', async () => {
    const { original, repository, imageStore, imageProcessor, deps } = setup();
    const updates: ClothingItem[] = [];
    const save = jest.spyOn(imageStore, 'save');
    const remove = jest.spyOn(imageStore, 'remove');
    // Same values as the stored item, typed differently (case, spacing): normalized equal.
    const unchanged = { newPhotoUri: null, category: original.category, colorsText: ' BLACK ', seasons: [...original.seasons], tags: [] };
    const result = await editClosetItem('item-1', unchanged, { ...deps, repository: countingUpdate(repository, updates) });

    expect(result).toEqual({ ok: true, item: original, changed: false });
    expect(updates).toEqual([]);
    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(imageProcessor.inputs).toEqual([]);
    expect(await repository.get('item-1')).toEqual(original);
    expect((await repository.get('item-1'))?.updatedAt).toBe(original.updatedAt);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF]);
  });

  it('treats a re-ordered season list as no change', async () => {
    const original = makeItem({ imageUri: OLD_REF, seasons: ['summer', 'winter'] });
    const repository = new InMemoryClosetRepository([original]);
    const updates: ClothingItem[] = [];
    const result = await editClosetItem(
      'item-1',
      { newPhotoUri: null, category: 'top', colorsText: 'black', seasons: ['winter', 'summer'], tags: [] },
      {
        repository: countingUpdate(repository, updates),
        imageStore: new MemoryImageStore(),
        imageProcessor: new FakeImageProcessor(),
        temporaryFiles: new RecordingTemporaryFiles(),
        now: () => NOW,
      },
    );
    expect(result).toEqual({ ok: true, item: original, changed: false });
    expect(updates).toEqual([]);
  });

  it('a new photo counts as a change even if every field is the same', async () => {
    const { original, repository, deps } = setup();
    const updates: ClothingItem[] = [];
    const result = await editClosetItem(
      'item-1',
      { newPhotoUri: NEW_PICK, category: original.category, colorsText: 'black', seasons: [...original.seasons], tags: [] },
      { ...deps, repository: countingUpdate(repository, updates) },
    );
    expect(result.ok && result.changed).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0].updatedAt).toBe(NOW.toISOString());
  });

  it('if copying the new photo fails, the item and old photo are unchanged', async () => {
    const { original, repository, imageStore, deps } = setup();
    imageStore.failNextSave = new Error('ENOSPC');
    const result = await editClosetItem('item-1', form({ newPhotoUri: NEW_PICK }), deps);

    expect(result).toEqual({ ok: false, errors: [CLOSET_ITEM_MESSAGES.copyFailed] });
    expect(await repository.get('item-1')).toEqual(original);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF]);
  });

  it('if the update fails, the new copy is removed and the old photo and item stay', async () => {
    const { original, repository, imageStore, deps } = setup();
    const result = await editClosetItem('item-1', form({ newPhotoUri: NEW_PICK }), {
      ...deps,
      repository: failingUpdate(repository, new Error('disk I/O error')),
    });

    expect(result).toEqual({ ok: false, errors: [CLOSET_ITEM_MESSAGES.saveFailed] });
    expect(await repository.get('item-1')).toEqual(original);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF]);
  });

  it('reports not found if the item was deleted between load and update', async () => {
    const { repository, imageStore, deps } = setup();
    const result = await editClosetItem('item-1', form({ newPhotoUri: NEW_PICK }), {
      ...deps,
      repository: failingUpdate(repository, new ClosetRepositoryError('not_found', 'gone')),
    });

    expect(result).toEqual({ ok: false, errors: [CLOSET_ITEM_MESSAGES.notFound] });
    expect([...imageStore.files.keys()]).toEqual([OLD_REF]);
  });

  it('keeps the edit if deleting the old photo fails, and reports the stray file', async () => {
    const { repository, imageStore, deps, onCleanupError } = setup();
    const cleanupError = new Error('EBUSY');
    imageStore.failNextRemove = cleanupError;
    const result = await editClosetItem('item-1', form({ newPhotoUri: NEW_PICK }), deps);

    expect(result.ok).toBe(true);
    expect((await repository.get('item-1'))?.imageUri).toBe('closet-images/item-1-m1.jpg');
    expect(onCleanupError).toHaveBeenCalledWith(cleanupError, OLD_REF);
    expect(imageStore.files.has(OLD_REF)).toBe(true);
  });

  it('refuses an unknown id and touches no files', async () => {
    const { imageStore, imageProcessor, deps } = setup();
    const result = await editClosetItem('missing', form({ newPhotoUri: NEW_PICK }), deps);
    expect(result).toEqual({ ok: false, errors: [CLOSET_ITEM_MESSAGES.notFound] });
    expect(imageProcessor.inputs).toEqual([]);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF]);
  });

  it('validates before copying anything and reports every problem', async () => {
    const { original, repository, imageStore, imageProcessor, deps } = setup();
    const result = await editClosetItem(
      'item-1',
      { newPhotoUri: NEW_PICK, category: null, colorsText: ' ', seasons: [], tags: [] },
      deps,
    );
    expect(result).toEqual({
      ok: false,
      errors: [CLOSET_ITEM_MESSAGES.noCategory, CLOSET_ITEM_MESSAGES.noColors, CLOSET_ITEM_MESSAGES.noSeasons],
    });
    expect(imageProcessor.inputs).toEqual([]);
    expect(await repository.get('item-1')).toEqual(original);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF]);
  });

  it('saves tag changes and adds new tags to the saved list', async () => {
    const { repository, deps } = setup();
    const result = await editClosetItem('item-1', form({ tags: ['Work', '90s'] }), deps);
    expect(result.ok && result.item.tags).toEqual(['work', '90s']);
    expect((await repository.get('item-1'))?.tags).toEqual(['work', '90s']);
    expect((await repository.listTags()).map((t) => t.name)).toEqual(['90s', 'work']);
  });

  it('a tag-only change counts as a change; re-ordered tags do not', async () => {
    const original = makeItem({ imageUri: OLD_REF, tags: ['emo', '90s'] });
    const repository = new InMemoryClosetRepository([original]);
    const updates: ClothingItem[] = [];
    const deps = {
      repository: countingUpdate(repository, updates),
      imageStore: new MemoryImageStore(),
      imageProcessor: new FakeImageProcessor(),
      temporaryFiles: new RecordingTemporaryFiles(),
      now: () => NOW,
    };
    const same = { newPhotoUri: null, category: 'top' as const, colorsText: 'black', seasons: original.seasons };
    expect(await editClosetItem('item-1', { ...same, tags: ['90s', 'emo'] }, deps)).toEqual({
      ok: true,
      item: original,
      changed: false,
    });
    expect(updates).toEqual([]);

    const result = await editClosetItem('item-1', { ...same, tags: ['90s'] }, deps);
    expect(result.ok && result.changed).toBe(true);
    expect(updates).toHaveLength(1);
    expect((await repository.get('item-1'))?.tags).toEqual(['90s']);
    expect((await repository.get('item-1'))?.updatedAt).toBe(NOW.toISOString());
  });

  it('after replacing the photo, deletes the processed JPEG and the picked photo', async () => {
    const { temporaryFiles, deps } = setup();
    expect((await editClosetItem('item-1', form({ newPhotoUri: NEW_PICK }), deps)).ok).toBe(true);
    expect(temporaryFiles.discarded).toEqual([PROCESSED, NEW_PICK]);
  });

  it('keeps the picked photo if the update fails, but deletes the processed JPEG', async () => {
    const { repository, temporaryFiles, deps } = setup();
    const result = await editClosetItem('item-1', form({ newPhotoUri: NEW_PICK }), {
      ...deps,
      repository: failingUpdate(repository, new Error('disk I/O error')),
    });
    expect(result.ok).toBe(false);
    expect(temporaryFiles.discarded).toEqual([PROCESSED]);
  });

  it('an edit without a new photo deletes no temporary files', async () => {
    const { temporaryFiles, deps } = setup();
    expect((await editClosetItem('item-1', form(), deps)).ok).toBe(true);
    expect(temporaryFiles.discarded).toEqual([]);
  });

  it('a temporary-file cleanup failure does not fail the edit', async () => {
    const { repository, temporaryFiles, deps } = setup();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    temporaryFiles.failNext = new Error('EACCES');
    const result = await editClosetItem('item-1', form({ newPhotoUri: NEW_PICK }), deps);
    expect(result.ok).toBe(true);
    expect((await repository.get('item-1'))?.imageUri).toBe('closet-images/item-1-m1.jpg');
    warn.mockRestore();
  });

  it('reports a failure if the item cannot be loaded', async () => {
    const { repository, deps } = setup();
    const broken: ClosetRepository = {
      ...failingUpdate(repository, new Error('x')),
      get: async () => {
        throw new Error('disk I/O error');
      },
    };
    const result = await editClosetItem('item-1', form(), { ...deps, repository: broken });
    expect(result).toEqual({ ok: false, errors: [CLOSET_ITEM_MESSAGES.saveFailed] });
  });
});
