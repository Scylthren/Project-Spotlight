import type { ClothingItem, PhotoDraft, PhotoRole } from '@/core';

import { CLOSET_ITEM_MESSAGES } from './add-closet-item';
import { makeColor, makeItem, makePhoto } from './closet-repository.contract';
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

/** The stored item's only photo. */
const OLD_PHOTO = makePhoto('item-1', { path: OLD_REF });
/** The form's draft for OLD_PHOTO, kept as is. */
const KEPT_FRONT: PhotoDraft = { kind: 'stored', id: OLD_PHOTO.id, role: 'front', isPrimary: true, path: OLD_REF };

function picked(uri: string, role: PhotoRole, id: string, isPrimary = false): PhotoDraft {
  return { kind: 'picked', id, uri, role, isPrimary };
}

/** The form after retaking the front photo with NEW_PICK. */
const RETAKEN_FRONT = [picked(NEW_PICK, 'front', 'new-front', true)];

function form(overrides: Partial<EditItemForm> = {}): EditItemForm {
  return { photos: [KEPT_FRONT], category: 'outerwear', colors: [makeColor('olive'), makeColor('black')], seasons: ['autumn'], tags: [], ...overrides };
}

function setup() {
  const original = makeItem({ photos: [OLD_PHOTO] });
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
      colors: [
        { paletteId: 'olive', hex: '#6B6B35', source: 'user' },
        { paletteId: 'black', hex: '#111111', source: 'user' },
      ],
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
        order.push(`update:${item.photos.map((p) => p.path).join(',')}`);
        await repository.update(item);
      },
    };

    const result = await editClosetItem('item-1', form({ photos: RETAKEN_FRONT }), { ...deps, repository: tracked });

    expect(order).toEqual([`process:${NEW_PICK}`, `save:${PROCESSED}`, `update:${newRef}`, `remove:${OLD_REF}`]);
    const newPhotos = [{ id: 'new-front', role: 'front', path: newRef, sortOrder: 0, isPrimary: true }];
    expect(result.ok && result.item.photos).toEqual(newPhotos);
    expect(result.ok && result.changed).toBe(true);
    expect((await repository.get('item-1'))?.photos).toEqual(newPhotos);
    // Stored as .jpg (the processed JPEG), even though the pick was a .png.
    expect([...imageStore.files]).toEqual([[newRef, PROCESSED]]);
    expect(onCleanupError).not.toHaveBeenCalled();
  });

  it('if processing the new photo fails, nothing is stored and the item and old photo are unchanged', async () => {
    const { original, repository, imageStore, imageProcessor, deps } = setup();
    imageProcessor.failNext = new Error('cannot decode image');
    const updates: ClothingItem[] = [];
    const save = jest.spyOn(imageStore, 'save');
    const result = await editClosetItem('item-1', form({ photos: RETAKEN_FRONT }), {
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
    // Same values as the stored item, as fresh copies: compared by value, not identity.
    const unchanged = {
      photos: [KEPT_FRONT],
      category: original.category,
      colors: original.colors.map((c) => ({ ...c })),
      seasons: [...original.seasons],
      tags: [],
    };
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
    const original = makeItem({ photos: [OLD_PHOTO], seasons: ['summer', 'winter'] });
    const repository = new InMemoryClosetRepository([original]);
    const updates: ClothingItem[] = [];
    const result = await editClosetItem(
      'item-1',
      { photos: [KEPT_FRONT], category: 'top', colors: [makeColor('black')], seasons: ['winter', 'summer'], tags: [] },
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

  it('a color-only change counts: a new primary, or confirming a detected color (auto -> user)', async () => {
    const detected = [makeColor('navy', { source: 'auto', hex: '#232C5E' }), makeColor('white')];
    const original = makeItem({ photos: [OLD_PHOTO], colors: detected });
    const repository = new InMemoryClosetRepository([original]);
    const updates: ClothingItem[] = [];
    const deps = {
      repository: countingUpdate(repository, updates),
      imageStore: new MemoryImageStore(),
      imageProcessor: new FakeImageProcessor(),
      temporaryFiles: new RecordingTemporaryFiles(),
      now: () => NOW,
    };
    const values = { photos: [KEPT_FRONT], category: 'top' as const, seasons: original.seasons, tags: [] };

    expect(await editClosetItem('item-1', { ...values, colors: detected.map((c) => ({ ...c })) }, deps)).toEqual({
      ok: true,
      item: original,
      changed: false,
    });
    const confirmed = [{ ...detected[0], source: 'user' as const }, detected[1]];
    const first = await editClosetItem('item-1', { ...values, colors: confirmed }, deps);
    expect(first.ok && first.changed).toBe(true);
    expect((await repository.get('item-1'))?.colors).toEqual(confirmed);

    const swapped = [confirmed[1], confirmed[0]];
    const second = await editClosetItem('item-1', { ...values, colors: swapped }, deps);
    expect(second.ok && second.changed).toBe(true);
    expect((await repository.get('item-1'))?.colors.map((c) => c.paletteId)).toEqual(['white', 'navy']);
    expect(updates).toHaveLength(2);
  });

  it('a new photo counts as a change even if every field is the same', async () => {
    const { original, repository, deps } = setup();
    const updates: ClothingItem[] = [];
    const result = await editClosetItem(
      'item-1',
      { photos: RETAKEN_FRONT, category: original.category, colors: [makeColor('black')], seasons: [...original.seasons], tags: [] },
      { ...deps, repository: countingUpdate(repository, updates) },
    );
    expect(result.ok && result.changed).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0].updatedAt).toBe(NOW.toISOString());
  });

  it('if copying the new photo fails, the item and old photo are unchanged', async () => {
    const { original, repository, imageStore, deps } = setup();
    imageStore.failNextSave = new Error('ENOSPC');
    const result = await editClosetItem('item-1', form({ photos: RETAKEN_FRONT }), deps);

    expect(result).toEqual({ ok: false, errors: [CLOSET_ITEM_MESSAGES.copyFailed] });
    expect(await repository.get('item-1')).toEqual(original);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF]);
  });

  it('if the update fails, the new copy is removed and the old photo and item stay', async () => {
    const { original, repository, imageStore, deps } = setup();
    const result = await editClosetItem('item-1', form({ photos: RETAKEN_FRONT }), {
      ...deps,
      repository: failingUpdate(repository, new Error('disk I/O error')),
    });

    expect(result).toEqual({ ok: false, errors: [CLOSET_ITEM_MESSAGES.saveFailed] });
    expect(await repository.get('item-1')).toEqual(original);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF]);
  });

  it('reports not found if the item was deleted between load and update', async () => {
    const { repository, imageStore, deps } = setup();
    const result = await editClosetItem('item-1', form({ photos: RETAKEN_FRONT }), {
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
    const result = await editClosetItem('item-1', form({ photos: RETAKEN_FRONT }), deps);

    expect(result.ok).toBe(true);
    expect((await repository.get('item-1'))?.photos[0].path).toBe('closet-images/item-1-m1.jpg');
    expect(onCleanupError).toHaveBeenCalledWith(cleanupError, OLD_REF);
    expect(imageStore.files.has(OLD_REF)).toBe(true);
  });

  it('refuses an unknown id and touches no files', async () => {
    const { imageStore, imageProcessor, deps } = setup();
    const result = await editClosetItem('missing', form({ photos: RETAKEN_FRONT }), deps);
    expect(result).toEqual({ ok: false, errors: [CLOSET_ITEM_MESSAGES.notFound] });
    expect(imageProcessor.inputs).toEqual([]);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF]);
  });

  it('validates before copying anything and reports every problem', async () => {
    const { original, repository, imageStore, imageProcessor, deps } = setup();
    const result = await editClosetItem(
      'item-1',
      { photos: RETAKEN_FRONT, category: null, colors: [], seasons: [], tags: [] },
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
    const original = makeItem({ photos: [OLD_PHOTO], tags: ['emo', '90s'] });
    const repository = new InMemoryClosetRepository([original]);
    const updates: ClothingItem[] = [];
    const deps = {
      repository: countingUpdate(repository, updates),
      imageStore: new MemoryImageStore(),
      imageProcessor: new FakeImageProcessor(),
      temporaryFiles: new RecordingTemporaryFiles(),
      now: () => NOW,
    };
    const same = { photos: [KEPT_FRONT], category: 'top' as const, colors: [makeColor('black')], seasons: original.seasons };
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
    expect((await editClosetItem('item-1', form({ photos: RETAKEN_FRONT }), deps)).ok).toBe(true);
    expect(temporaryFiles.discarded).toEqual([PROCESSED, NEW_PICK]);
  });

  it('keeps the picked photo if the update fails, but deletes the processed JPEG', async () => {
    const { repository, temporaryFiles, deps } = setup();
    const result = await editClosetItem('item-1', form({ photos: RETAKEN_FRONT }), {
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
    const result = await editClosetItem('item-1', form({ photos: RETAKEN_FRONT }), deps);
    expect(result.ok).toBe(true);
    expect((await repository.get('item-1'))?.photos[0].path).toBe('closet-images/item-1-m1.jpg');
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

describe('editClosetItem with several photos', () => {
  const BACK_REF = 'closet-images/item-1-back.jpg';
  const DETAIL_REF = 'closet-images/item-1-detail.jpg';
  const NEW_BACK = 'file:///cache/ImagePicker/NEW_BACK.jpeg';
  const NEW_DETAIL = 'file:///cache/ImagePicker/NEW_DETAIL.jpeg';

  /** An item with a front, a back, and a detail photo, all stored. */
  function setupThree() {
    const photos = [
      OLD_PHOTO,
      makePhoto('item-1', { sortOrder: 1, role: 'back', path: BACK_REF }),
      makePhoto('item-1', { sortOrder: 2, role: 'detail', path: DETAIL_REF }),
    ];
    const original = makeItem({ photos });
    const repository = new InMemoryClosetRepository([original]);
    const imageStore = new MemoryImageStore();
    for (const p of photos) imageStore.files.set(p.path, `file:///cache/${p.id}.jpg`);
    const imageProcessor = new FakeImageProcessor();
    const temporaryFiles = new RecordingTemporaryFiles();
    const onCleanupError = jest.fn();
    const updates: ClothingItem[] = [];
    const deps = {
      repository: countingUpdate(repository, updates),
      imageStore,
      imageProcessor,
      temporaryFiles,
      now: () => NOW,
      onCleanupError,
    };
    const kept = photos.map(
      (p): PhotoDraft => ({ kind: 'stored', id: p.id, role: p.role, isPrimary: p.isPrimary, path: p.path }),
    );
    const values = { category: 'top' as const, colors: [makeColor('black')], seasons: original.seasons, tags: [] };
    return { original, repository, imageStore, imageProcessor, temporaryFiles, onCleanupError, updates, deps, kept, values };
  }

  it('adding an angle processes only the new photo and deletes no files', async () => {
    const { original, repository, imageStore, imageProcessor, deps, kept, values } = setupThree();
    const remove = jest.spyOn(imageStore, 'remove');
    const [front, back] = kept;
    const photos = [front, back, picked(NEW_DETAIL, 'detail', 'added')];
    // Drop the old detail and add a new one: the old detail file goes, the rest stay.
    const result = await editClosetItem('item-1', { ...values, photos }, deps);

    expect(imageProcessor.inputs).toEqual([NEW_DETAIL]);
    expect(result.ok && result.item.photos).toEqual([
      original.photos[0],
      original.photos[1],
      { id: 'added', role: 'detail', path: 'closet-images/item-1-m1.jpg', sortOrder: 2, isPrimary: false },
    ]);
    expect(remove.mock.calls).toEqual([[DETAIL_REF]]);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF, BACK_REF, 'closet-images/item-1-m1.jpg']);
    expect(await repository.get('item-1')).toEqual(result.ok && result.item);
  });

  it('removing an angle deletes its file only after the row update', async () => {
    const { repository, imageStore, deps, kept, values } = setupThree();
    const order: string[] = [];
    const remove = imageStore.remove.bind(imageStore);
    imageStore.remove = async (ref) => {
      order.push(`remove:${ref}`);
      await remove(ref);
    };
    const update = deps.repository.update;
    deps.repository.update = async (item) => {
      order.push(`update:${item.photos.length}`);
      await update(item);
    };
    const result = await editClosetItem('item-1', { ...values, photos: [kept[0], kept[2]] }, deps);
    expect(result.ok).toBe(true);
    expect(order).toEqual(['update:2', `remove:${BACK_REF}`]);
    expect((await repository.get('item-1'))?.photos.map((p) => [p.role, p.sortOrder])).toEqual([
      ['front', 0],
      ['detail', 1],
    ]);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF, DETAIL_REF]);
  });

  it('retake, remove, and add in one edit: new files written, replaced and removed files deleted, kept file untouched', async () => {
    const { repository, imageStore, imageProcessor, temporaryFiles, deps, kept, values } = setupThree();
    const photos = [
      kept[0],
      picked(NEW_BACK, 'back', 'retaken-back'),
      // kept[2] (the detail) is removed; a new detail is added and made primary.
      picked(NEW_DETAIL, 'detail', 'new-detail', true),
    ];
    const result = await editClosetItem('item-1', { ...values, photos: photos.map((p, i) => ({ ...p, isPrimary: i === 2 })) }, deps);

    expect(result.ok && result.changed).toBe(true);
    expect(imageProcessor.inputs).toEqual([NEW_BACK, NEW_DETAIL]);
    expect((await repository.get('item-1'))?.photos).toEqual([
      { ...OLD_PHOTO, isPrimary: false },
      { id: 'retaken-back', role: 'back', path: 'closet-images/item-1-m1.jpg', sortOrder: 1, isPrimary: false },
      { id: 'new-detail', role: 'detail', path: 'closet-images/item-1-m2.jpg', sortOrder: 2, isPrimary: true },
    ]);
    expect([...imageStore.files.keys()].sort()).toEqual(
      [OLD_REF, 'closet-images/item-1-m1.jpg', 'closet-images/item-1-m2.jpg'].sort(),
    );
    expect(temporaryFiles.discarded).toEqual([
      'file:///processed/p1.jpg',
      'file:///processed/p2.jpg',
      NEW_BACK,
      NEW_DETAIL,
    ]);
  });

  it('making another photo primary is a change with no file work', async () => {
    const { repository, imageStore, imageProcessor, updates, deps, kept, values } = setupThree();
    const remove = jest.spyOn(imageStore, 'remove');
    const photos = kept.map((p) => ({ ...p, isPrimary: p.role === 'back' }));
    const result = await editClosetItem('item-1', { ...values, photos }, deps);
    expect(result.ok && result.changed).toBe(true);
    expect(updates).toHaveLength(1);
    expect((await repository.get('item-1'))?.photos.find((p) => p.isPrimary)?.role).toBe('back');
    expect(imageProcessor.inputs).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('if a later new photo fails, removes the new copies made so far and changes nothing', async () => {
    const { original, repository, imageStore, imageProcessor, updates, deps, kept, values } = setupThree();
    const prepare = imageProcessor.prepareForStorage.bind(imageProcessor);
    imageProcessor.prepareForStorage = async (uri) => {
      if (uri === NEW_DETAIL) throw new Error('cannot decode');
      return prepare(uri);
    };
    const photos = [kept[0], picked(NEW_BACK, 'back', 'rb'), picked(NEW_DETAIL, 'detail', 'rd')];
    const result = await editClosetItem('item-1', { ...values, photos }, deps);
    expect(result).toEqual({ ok: false, errors: [CLOSET_ITEM_MESSAGES.processFailed] });
    expect(updates).toEqual([]);
    expect(await repository.get('item-1')).toEqual(original);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF, BACK_REF, DETAIL_REF]);
  });

  it('if the update fails, removes every new copy and leaves every old file', async () => {
    const { original, repository, imageStore, temporaryFiles, kept, values, deps } = setupThree();
    const photos = [kept[0], picked(NEW_BACK, 'back', 'rb'), picked(NEW_DETAIL, 'detail', 'rd')];
    const result = await editClosetItem('item-1', { ...values, photos }, {
      ...deps,
      repository: failingUpdate(repository, new Error('disk I/O error')),
    });
    expect(result).toEqual({ ok: false, errors: [CLOSET_ITEM_MESSAGES.saveFailed] });
    expect(await repository.get('item-1')).toEqual(original);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF, BACK_REF, DETAIL_REF]);
    // Picks kept for a retry.
    expect(temporaryFiles.discarded).not.toContain(NEW_BACK);
    expect(temporaryFiles.discarded).not.toContain(NEW_DETAIL);
  });

  it('a failed delete of one old file still deletes the others and reports it', async () => {
    const { imageStore, onCleanupError, deps, kept, values } = setupThree();
    const cleanupError = new Error('EBUSY');
    imageStore.failNextRemove = cleanupError;
    const result = await editClosetItem('item-1', { ...values, photos: [kept[0]] }, deps);
    expect(result.ok).toBe(true);
    expect(onCleanupError).toHaveBeenCalledTimes(1);
    expect(onCleanupError).toHaveBeenCalledWith(cleanupError, BACK_REF);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF, BACK_REF]);
  });

  it('refuses a kept photo that is not on the stored item (stale form) and touches nothing', async () => {
    const { original, repository, imageStore, imageProcessor, updates, deps, kept, values } = setupThree();
    const ghost: PhotoDraft = { kind: 'stored', id: 'ghost', role: 'detail', isPrimary: false, path: 'closet-images/ghost.jpg' };
    const photos = [kept[0], picked(NEW_BACK, 'back', 'rb'), ghost];
    const result = await editClosetItem('item-1', { ...values, photos }, deps);
    expect(result).toEqual({ ok: false, errors: [CLOSET_ITEM_MESSAGES.staleItem] });
    expect(imageProcessor.inputs).toEqual([]);
    expect(updates).toEqual([]);
    expect(await repository.get('item-1')).toEqual(original);
    expect([...imageStore.files.keys()]).toEqual([OLD_REF, BACK_REF, DETAIL_REF]);
  });

  it('refuses a set without its front photo, or that breaks a rule, before any file work', async () => {
    const { imageProcessor, updates, deps, kept, values } = setupThree();
    // The front was also the primary photo, so both problems are reported.
    expect(await editClosetItem('item-1', { ...values, photos: [kept[1], kept[2]] }, deps)).toEqual({
      ok: false,
      errors: [CLOSET_ITEM_MESSAGES.noPhoto, CLOSET_ITEM_MESSAGES.badPhotos],
    });
    const twoBacks = [...kept, picked(NEW_BACK, 'back', 'b2')];
    expect(await editClosetItem('item-1', { ...values, photos: twoBacks }, deps)).toEqual({
      ok: false,
      errors: [CLOSET_ITEM_MESSAGES.badPhotos],
    });
    expect(imageProcessor.inputs).toEqual([]);
    expect(updates).toEqual([]);
  });
});

describe('editClosetItem: name', () => {
  const unchangedForm = (item: ClothingItem, name?: string): EditItemForm => ({
    ...(name === undefined ? {} : { name }),
    photos: [KEPT_FRONT],
    category: item.category,
    colors: item.colors.map((c) => ({ ...c })),
    seasons: [...item.seasons],
    tags: [...item.tags],
  });

  it('adding a name is a change; it is saved trimmed', async () => {
    const { original, repository, deps } = setup();
    const result = await editClosetItem('item-1', unchangedForm(original, ' Olive parka '), deps);
    expect(result).toEqual({ ok: true, item: { ...original, name: 'Olive parka', updatedAt: NOW.toISOString() }, changed: true });
    expect((await repository.get('item-1'))?.name).toBe('Olive parka');
  });

  it('the same name (even with extra spaces) is no change; clearing it removes the name', async () => {
    const original = makeItem({ photos: [OLD_PHOTO], name: 'Olive parka' });
    const repository = new InMemoryClosetRepository([original]);
    const deps = { ...setup().deps, repository };
    expect(await editClosetItem('item-1', unchangedForm(original, 'Olive parka  '), deps)).toEqual({
      ok: true,
      item: original,
      changed: false,
    });
    const cleared = await editClosetItem('item-1', unchangedForm(original, '  '), deps);
    expect(cleared.ok && cleared.changed).toBe(true);
    expect('name' in (await repository.get('item-1'))!).toBe(false);
  });
});
