import { userColor, type ClothingItem, type PhotoDraft, type PhotoRole } from '@/core';

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

function picked(uri: string, role: PhotoRole = 'front', id = `ph-${role}`, isPrimary = role === 'front'): PhotoDraft {
  return { kind: 'picked', id, uri, role, isPrimary };
}

function form(overrides: Partial<AddItemForm> = {}): AddItemForm {
  return { photos: [picked(PICKED)], category: 'bottom', colors: [userColor('blue'), userColor('white')], seasons: ['summer'], tags: [], ...overrides };
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
      photos: [{ id: 'ph-front', role: 'front', path: 'closet-images/id-1-m1.jpg', sortOrder: 0, isPrimary: true }],
      category: 'bottom',
      colors: [
        { paletteId: 'blue', hex: '#2D5DA8', source: 'user' },
        { paletteId: 'white', hex: '#FFFFFF', source: 'user' },
      ],
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
    const uri = picked.status === 'picked' ? picked.photo.uri : 'missing';
    expect((await addClosetItem(form({ photos: [front(uri)] }), deps)).ok).toBe(true);
    expect(await repository.list()).toHaveLength(1);
  });

  it('works end to end from a camera photo with a .heic name, storing a .jpg', async () => {
    const { repository, imageStore, deps } = setup();
    const camera = new QueuedPhotoPicker([
      { status: 'picked', photo: { uri: 'file:///cache/ImagePicker/IMG_0001.HEIC', width: 4032, height: 3024 } },
    ]);
    const picked = await camera.pick('camera');
    expect(camera.calls).toEqual(['camera']);
    const uri = picked.status === 'picked' ? picked.photo.uri : 'missing';
    const result = await addClosetItem(form({ photos: [front(uri)] }), deps);
    expect(result.ok && result.item.photos[0].path).toBe('closet-images/id-1-m1.jpg');
    expect([...imageStore.files.keys()]).toEqual(['closet-images/id-1-m1.jpg']);
    expect(await repository.list()).toHaveLength(1);
  });

  it('a cancelled pick leaves no photo, so saving is refused with a clear message', async () => {
    const { repository, imageStore, deps } = setup();
    const picked = await new QueuedPhotoPicker([{ status: 'cancelled' }]).pick('camera');
    expect(picked).toEqual({ status: 'cancelled' });
    const result = await addClosetItem(form({ photos: [] }), deps);
    expect(result).toEqual({ ok: false, errors: [ADD_ITEM_MESSAGES.noPhoto] });
    expect(imageStore.files.size).toBe(0);
    expect(await repository.list()).toEqual([]);
  });

  it('reports every form problem at once and copies nothing', async () => {
    const { repository, imageStore, imageProcessor, deps } = setup();
    const result = await addClosetItem(
      { photos: [], category: null, colors: [], seasons: [], tags: [] },
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

  it('reports a color list it cannot save (e.g. four colors) with a clear message and copies nothing', async () => {
    const { repository, imageStore, imageProcessor, deps } = setup();
    const colors = (['navy', 'white', 'red', 'teal'] as const).map(userColor);
    expect(await addClosetItem(form({ colors }), deps)).toEqual({ ok: false, errors: [ADD_ITEM_MESSAGES.badColors] });
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
    const originalRef = original!.photos[0].path;
    const originalFile = imageStore.files.get(originalRef);
    expect(originalFile).toBe(PROCESSED);

    // Same id again (deps.newId always returns 'id-1'): the repository rejects it.
    const second = await addClosetItem(
      form({ photos: [picked('file:///cache/OTHER.jpeg', 'front', 'ph-other')], colors: [userColor('red')] }),
      deps,
    );
    expect(second).toEqual({ ok: false, errors: [ADD_ITEM_MESSAGES.saveFailed] });

    expect(await repository.list()).toEqual([original]);
    expect(imageStore.files.get(originalRef)).toBe(originalFile);
    // The second call's own copy was cleaned up, and nothing else remains.
    expect([...imageStore.files.keys()]).toEqual([originalRef]);
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
    photos: [{ id: 'x-front', role: 'front', path: 'closet-images/x.jpg', sortOrder: 0, isPrimary: true }],
    category: 'top',
    colors: [userColor('red')],
    seasons: ['winter'],
    tags: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

const BACK = 'file:///cache/ImagePicker/BACK.jpeg';
const DETAIL = 'file:///cache/ImagePicker/DETAIL.jpeg';

describe('addClosetItem with several photos', () => {
  /** Front, back, and a primary detail, in that order. */
  const threePhotos = () => [picked(PICKED), picked(BACK, 'back'), picked(DETAIL, 'detail')].map((p) => ({
    ...p,
    isPrimary: p.role === 'detail',
  }));

  it('processes and stores each photo, in order, and saves them with their roles and primary', async () => {
    const { repository, imageStore, imageProcessor, deps } = setup();
    const result = await addClosetItem(form({ photos: threePhotos() }), deps);

    const photos = [
      { id: 'ph-front', role: 'front', path: 'closet-images/id-1-m1.jpg', sortOrder: 0, isPrimary: false },
      { id: 'ph-back', role: 'back', path: 'closet-images/id-1-m2.jpg', sortOrder: 1, isPrimary: false },
      { id: 'ph-detail', role: 'detail', path: 'closet-images/id-1-m3.jpg', sortOrder: 2, isPrimary: true },
    ];
    expect(result.ok && result.item.photos).toEqual(photos);
    expect((await repository.get('id-1'))?.photos).toEqual(photos);
    expect(imageProcessor.inputs).toEqual([PICKED, BACK, DETAIL]);
    // Every stored file is a processed copy of the matching pick.
    expect([...imageStore.files].map(([ref, processed]) => [ref, imageProcessor.outputs.get(processed)])).toEqual([
      ['closet-images/id-1-m1.jpg', PICKED],
      ['closet-images/id-1-m2.jpg', BACK],
      ['closet-images/id-1-m3.jpg', DETAIL],
    ]);
  });

  it('after a successful save, deletes every processed JPEG and every pick', async () => {
    const { temporaryFiles, deps } = setup();
    expect((await addClosetItem(form({ photos: threePhotos() }), deps)).ok).toBe(true);
    expect(temporaryFiles.discarded).toEqual([
      'file:///processed/p1.jpg',
      'file:///processed/p2.jpg',
      'file:///processed/p3.jpg',
      PICKED,
      BACK,
      DETAIL,
    ]);
  });

  it('if a later photo fails to process, removes the copies already made and saves nothing', async () => {
    const { repository, imageStore, imageProcessor, temporaryFiles, deps } = setup();
    const prepare = imageProcessor.prepareForStorage.bind(imageProcessor);
    imageProcessor.prepareForStorage = async (uri) => {
      if (uri === DETAIL) throw new Error('cannot decode');
      return prepare(uri);
    };
    const result = await addClosetItem(form({ photos: threePhotos() }), deps);
    expect(result).toEqual({ ok: false, errors: [ADD_ITEM_MESSAGES.processFailed] });
    expect(imageStore.files.size).toBe(0);
    expect(await repository.list()).toEqual([]);
    // Processed copies are gone; the picks are kept for a retry.
    expect(temporaryFiles.discarded).toEqual(['file:///processed/p1.jpg', 'file:///processed/p2.jpg']);
  });

  it('if a later copy fails, removes the copies already made and saves nothing', async () => {
    const { repository, imageStore, deps } = setup();
    const save = imageStore.save.bind(imageStore);
    let saves = 0;
    imageStore.save = async (uri, itemId, extension) => {
      if (++saves === 2) throw new Error('ENOSPC');
      return save(uri, itemId, extension);
    };
    const result = await addClosetItem(form({ photos: threePhotos() }), deps);
    expect(result).toEqual({ ok: false, errors: [ADD_ITEM_MESSAGES.copyFailed] });
    expect(imageStore.files.size).toBe(0);
    expect(await repository.list()).toEqual([]);
  });

  it('if the repository rejects the item, removes every copy and keeps the picks', async () => {
    const { repository, imageStore, temporaryFiles, deps } = setup();
    await repository.add({ ...existingItem(), id: 'id-1' });
    expect((await addClosetItem(form({ photos: threePhotos() }), deps)).ok).toBe(false);
    expect(imageStore.files.size).toBe(0);
    expect(temporaryFiles.discarded).not.toContain(PICKED);
    expect(temporaryFiles.discarded).not.toContain(BACK);
  });

  it('refuses sets that break the photo rules before processing anything', async () => {
    const { repository, imageProcessor, deps } = setup();
    expect(await addClosetItem(form({ photos: [picked(BACK, 'back', 'b', true)] }), deps)).toEqual({
      ok: false,
      errors: [ADD_ITEM_MESSAGES.noPhoto],
    });
    const twoBacks = [picked(PICKED), picked(BACK, 'back', 'b1'), picked(DETAIL, 'back', 'b2')];
    expect(await addClosetItem(form({ photos: twoBacks }), deps)).toEqual({
      ok: false,
      errors: [ADD_ITEM_MESSAGES.badPhotos],
    });
    const noPrimary = [picked(PICKED, 'front', 'f', false)];
    expect(await addClosetItem(form({ photos: noPrimary }), deps)).toEqual({
      ok: false,
      errors: [ADD_ITEM_MESSAGES.badPhotos],
    });
    expect(imageProcessor.inputs).toEqual([]);
    expect(await repository.list()).toEqual([]);
  });

  it('refuses a stored photo in a new item (a stale form) and stores nothing', async () => {
    const { repository, imageProcessor, deps } = setup();
    const stored: PhotoDraft = { kind: 'stored', id: 's', role: 'front', isPrimary: true, path: 'closet-images/x.jpg' };
    expect(await addClosetItem(form({ photos: [stored] }), deps)).toEqual({
      ok: false,
      errors: [ADD_ITEM_MESSAGES.badPhotos],
    });
    expect(imageProcessor.inputs).toEqual([]);
    expect(await repository.list()).toEqual([]);
  });
});

function front(uri: string): PhotoDraft {
  return picked(uri);
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

describe('addClosetItem: name', () => {
  it('saves the typed name trimmed', async () => {
    const { repository, deps } = setup();
    const result = await addClosetItem(form({ name: '  Wide-leg jeans ' }), deps);
    expect(result.ok && result.item.name).toBe('Wide-leg jeans');
    expect((await repository.get('id-1'))?.name).toBe('Wide-leg jeans');
  });

  it('a blank name saves an item with no name', async () => {
    const { repository, deps } = setup();
    expect((await addClosetItem(form({ name: '   ' }), deps)).ok).toBe(true);
    expect('name' in (await repository.get('id-1'))!).toBe(false);
  });

  it('a name over 60 characters is refused with a readable message, and nothing is stored', async () => {
    const { repository, imageStore, imageProcessor, deps } = setup();
    expect(await addClosetItem(form({ name: 'a'.repeat(61) }), deps)).toEqual({
      ok: false,
      errors: ['Names can be up to 60 characters.'],
    });
    expect(await repository.list()).toEqual([]);
    expect(imageStore.files.size).toBe(0);
    expect(imageProcessor.inputs).toEqual([]);
  });
});
