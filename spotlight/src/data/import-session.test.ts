import type { ClosetTagger, TagImage, TagOutcome } from '@/ai/closet-tagger';
import type { ItemTags } from '@/ai/tag-item-contract';
import { userColor } from '@/core';
import { garmentPhoto, inBox, rgb } from '@/core/testing/synthetic-images';

import { CLOSET_ITEM_MESSAGES } from './add-closet-item';
import { FakeGarmentIsolator, type GarmentIsolation } from './garment-isolator';
import { FakeImageProcessor } from './image-processor';
import {
  beginImport,
  describeDraftHeadline,
  describeDraftStatus,
  describeMissing,
  describeNotReady,
  describeSaveReport,
  draftValues,
  IMPORT_CONCURRENCY,
  ImportSession,
  ImportSessions,
  isDraftReady,
  missingFields,
  saveButtonLabel,
  summarizeDrafts,
  type ImportSessionDeps,
} from './import-session';
import { InMemoryClosetRepository } from './in-memory-closet-repository';
import type { TagImageSource } from './item-suggestions';
import { MemoryImageStore } from './memory-image-store';
import type { PickedLibraryPhoto } from './photo-picker';
import { RecordingTemporaryFiles } from './temporary-files';
import { UploadTagImageSource } from './upload-tag-image-source';

const NO_TAGS: ItemTags = {
  category: null,
  colors: [],
  seasons: [],
  type: null,
  pattern: null,
  material: null,
  fit: null,
  formality: null,
};

const TOP: TagOutcome = {
  ok: true,
  stub: false,
  tags: { ...NO_TAGS, category: 'top', colors: ['black'], seasons: ['summer'], type: 'T-shirt', pattern: 'solid' },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Passes the photo URI through as the image, so the tagger can answer per photo. */
class UriImageSource implements TagImageSource {
  async read(photoUri: string): Promise<TagImage> {
    return { base64: photoUri, contentType: 'image/jpeg' };
  }
}

/** Answers per photo URI: a fixed outcome, or a deferred one the test resolves. Counts calls in flight. */
class ScriptedTagger implements ClosetTagger {
  readonly answers = new Map<string, TagOutcome | Promise<TagOutcome>>();
  fallback: TagOutcome = { ok: false, failure: 'offline' };
  readonly calls: string[] = [];
  inFlight = 0;
  maxInFlight = 0;

  async tag(image: TagImage): Promise<TagOutcome> {
    this.calls.push(image.base64);
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      return await (this.answers.get(image.base64) ?? this.fallback);
    } finally {
      this.inFlight -= 1;
    }
  }
}

/** A clean navy garment for the on-device detection. */
function navyShirt(): GarmentIsolation {
  const image = garmentPhoto(() => rgb('#202A60'), () => rgb('#F4F4F2'));
  const mask = new Uint8Array(image.width * image.height);
  for (let i = 0; i < mask.length; i++) mask[i] = inBox(i % image.width, Math.floor(i / image.width)) ? 1 : 0;
  return { ok: true, garment: { image, mask, confidence: 1 } };
}

const uri = (n: number) => `file:///cache/ImagePicker/p${n}.jpg`;
const photo = (n: number, assetId: string | null = `asset-${n}`): PickedLibraryPhoto => ({
  uri: uri(n),
  width: 4032,
  height: 3024,
  assetId,
});
const photos = (count: number) => Array.from({ length: count }, (_, i) => photo(i + 1));

function setup(overrides: Partial<ImportSessionDeps> = {}) {
  const tagger = new ScriptedTagger();
  const isolator = new FakeGarmentIsolator();
  const repository = new InMemoryClosetRepository();
  const imageStore = new MemoryImageStore();
  const imageProcessor = new FakeImageProcessor();
  const temporaryFiles = new RecordingTemporaryFiles();
  let next = 0;
  const deps: ImportSessionDeps = {
    tagger,
    imageSource: new UriImageSource(),
    isolator,
    addItem: { repository, imageStore, imageProcessor, temporaryFiles, now: () => new Date('2026-10-23T10:00:00Z') },
    newId: () => `id-${++next}`,
    ...overrides,
  };
  return { tagger, isolator, repository, imageStore, imageProcessor, temporaryFiles, deps };
}

/** Lets pending promise callbacks run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ImportSession', () => {
  it('makes one draft per photo, in order, and saves nothing before the user confirms', async () => {
    const { tagger, repository, deps } = setup();
    tagger.fallback = TOP;
    const session = new ImportSession(photos(3), deps);
    expect(session.getSnapshot().drafts.map((d) => d.photo.uri)).toEqual([uri(1), uri(2), uri(3)]);
    expect(session.getSnapshot().drafts.every((d) => d.suggestion === 'waiting')).toBe(true);
    await session.start();
    expect(session.getSnapshot().drafts.every((d) => d.suggestion === 'suggested')).toBe(true);
    expect(await repository.list()).toEqual([]);
  });

  it(`tags at most ${IMPORT_CONCURRENCY} photos at a time, in list order`, async () => {
    const { tagger, deps } = setup();
    const answers = Array.from({ length: 5 }, () => deferred<TagOutcome>());
    answers.forEach((a, i) => tagger.answers.set(uri(i + 1), a.promise));
    const session = new ImportSession(photos(5), deps);
    const done = session.start();
    await flush();
    expect(tagger.calls).toEqual([uri(1), uri(2), uri(3)]);
    expect(session.getSnapshot().drafts.map((d) => d.suggestion)).toEqual(['tagging', 'tagging', 'tagging', 'waiting', 'waiting']);
    answers[1].resolve(TOP);
    await flush();
    expect(tagger.calls).toEqual([uri(1), uri(2), uri(3), uri(4)]);
    answers.forEach((a) => a.resolve(TOP));
    await done;
    expect(tagger.maxInFlight).toBe(IMPORT_CONCURRENCY);
  });

  it('fills each draft from its own suggestions under the auto rule, and marks it ready', async () => {
    const { tagger, deps } = setup();
    tagger.answers.set(uri(1), TOP);
    const session = new ImportSession([photo(1)], deps);
    await session.start();
    const draft = session.getSnapshot().drafts[0];
    expect(draft.categorySeason.category).toEqual({ value: 'top', source: 'auto' });
    expect(draft.categorySeason.seasons).toEqual({ value: ['summer'], source: 'auto' });
    expect(draft.attributes.type).toEqual({ value: 'T-shirt', source: 'auto' });
    expect(draft.attributes.pattern).toEqual({ value: 'solid', source: 'auto' });
    expect(draft.colors.map((c) => c.paletteId)).toEqual(['black']);
    expect(draft.colorOrigin).toBe('tagger');
    expect(describeDraftStatus(draft)).toBe('Suggested');
    expect(isDraftReady(draft)).toBe(true);
  });

  it('shows "No suggestions" per draft when the tagger is offline or has no token, and never blocks the others', async () => {
    const { tagger, deps } = setup();
    tagger.answers.set(uri(1), TOP);
    tagger.answers.set(uri(2), { ok: false, failure: 'no-token' });
    tagger.answers.set(uri(3), { ok: false, failure: 'offline' });
    const session = new ImportSession(photos(3), deps);
    await session.start();
    const [a, b, c] = session.getSnapshot().drafts;
    expect(a.suggestion).toBe('suggested');
    expect([b, c].map(describeDraftStatus)).toEqual(['No suggestions', 'No suggestions']);
    // Without suggestions the draft needs the required fields from the user.
    expect(missingFields(b)).toEqual(['colors', 'category', 'seasons']);
    expect(describeMissing(missingFields(b))).toBe('Needs a color, a category and a season');
    expect(isDraftReady(b)).toBe(false);
  });

  it('treats a throwing image source or tagger as "No suggestions" for that draft only', async () => {
    const { tagger, deps } = setup();
    tagger.fallback = TOP;
    const failing: TagImageSource = {
      read: async (photoUri) => {
        if (photoUri === uri(2)) throw new Error('HEIC could not be decoded');
        return { base64: photoUri, contentType: 'image/jpeg' };
      },
    };
    const session = new ImportSession(photos(3), { ...deps, imageSource: failing });
    await session.start();
    expect(session.getSnapshot().drafts.map((d) => d.suggestion)).toEqual(['suggested', 'no-suggestions', 'suggested']);
  });

  it('prepares the tagger image exactly as the single-item form does (downscaled upload copy)', async () => {
    const { tagger, imageProcessor, deps } = setup();
    tagger.fallback = TOP;
    const session = new ImportSession(photos(2), { ...deps, imageSource: new UploadTagImageSource(imageProcessor) });
    await session.start();
    expect(imageProcessor.uploads).toEqual([
      { sourceUri: uri(1), maxEdge: 1024 },
      { sourceUri: uri(2), maxEdge: 1024 },
    ]);
  });

  it('never lets a late suggestion overwrite what the user changed meanwhile', async () => {
    const { tagger, deps } = setup();
    const answer = deferred<TagOutcome>();
    tagger.answers.set(uri(1), answer.promise);
    const session = new ImportSession([photo(1)], deps);
    const done = session.start();
    const id = session.getSnapshot().drafts[0].id;
    session.setCategory(id, 'outerwear');
    session.toggleAttribute(id, 'pattern', 'striped');
    session.changeColors(id, () => ({ ok: true, colors: [userColor('red')] }));
    answer.resolve(TOP);
    await done;
    const draft = session.getSnapshot().drafts[0];
    expect(draft.categorySeason.category).toEqual({ value: 'outerwear', source: 'user' });
    expect(draft.attributes.pattern).toEqual({ value: 'striped', source: 'user' });
    expect(draft.colors.map((c) => c.paletteId)).toEqual(['red']);
    // Untouched fields still take the suggestion.
    expect(draft.categorySeason.seasons).toEqual({ value: ['summer'], source: 'auto' });
    expect(draft.attributes.type.value).toBe('T-shirt');
  });

  it('uses the on-device colors when the tagger gives none, and the tagger colors over them (D7)', async () => {
    const { tagger, isolator, deps } = setup();
    isolator.fallback = navyShirt();
    tagger.answers.set(uri(1), { ok: false, failure: 'offline' });
    tagger.answers.set(uri(2), TOP);
    const session = new ImportSession(photos(2), deps);
    await session.start();
    const [offline, tagged] = session.getSnapshot().drafts;
    expect(offline.colors.map((c) => c.paletteId)).toEqual(['navy']);
    expect(offline.colorOrigin).toBe('device');
    expect(tagged.colors.map((c) => c.paletteId)).toEqual(['black']);
    expect(tagged.colorOrigin).toBe('tagger');
  });

  it('a draft is not ready while its suggestions are still coming', async () => {
    const { tagger, deps } = setup();
    const answer = deferred<TagOutcome>();
    tagger.answers.set(uri(1), answer.promise);
    const session = new ImportSession([photo(1)], deps);
    const done = session.start();
    await flush();
    const id = session.getSnapshot().drafts[0].id;
    session.setCategory(id, 'top');
    session.toggleSeason(id, 'winter');
    session.changeColors(id, () => ({ ok: true, colors: [userColor('red')] }));
    expect(isDraftReady(session.draft(id)!)).toBe(false);
    expect(summarizeDrafts(session.getSnapshot().drafts)).toMatchObject({ ready: 0, analyzing: 1 });
    answer.resolve({ ok: false, failure: 'timeout' });
    await done;
    expect(isDraftReady(session.draft(id)!)).toBe(true);
  });

  describe('saveReady', () => {
    it('saves only the ready drafts through the add-item flow and keeps the rest', async () => {
      const { tagger, repository, imageStore, imageProcessor, temporaryFiles, deps } = setup();
      tagger.answers.set(uri(1), TOP);
      tagger.answers.set(uri(3), TOP);
      const session = new ImportSession(photos(3), deps);
      await session.start();
      const report = await session.saveReady();

      expect(report?.saved).toHaveLength(2);
      expect(report?.failed).toEqual([]);
      const items = await repository.list();
      expect(items.map((i) => i.category)).toEqual(['top', 'top']);
      // Each photo went through the storage processing (downscale, re-encode, strip) and was stored, never the raw pick.
      expect(imageProcessor.inputs).toEqual([uri(1), uri(3)]);
      expect(imageStore.files.size).toBe(2);
      expect(items[0].photos).toEqual([expect.objectContaining({ role: 'front', isPrimary: true })]);
      expect(items[0].attributes).toEqual({ type: { value: 'T-shirt', source: 'auto' }, pattern: { value: 'solid', source: 'auto' } });
      // The picked copies of saved photos are deleted; the unsaved draft keeps its photo.
      expect(temporaryFiles.discarded).toEqual(expect.arrayContaining([uri(1), uri(3)]));
      expect(temporaryFiles.discarded).not.toContain(uri(2));
      expect(session.getSnapshot().drafts.map((d) => d.photo.uri)).toEqual([uri(2)]);
      expect(session.getSnapshot().savedCount).toBe(2);
    });

    it('a draft the user completed by hand can be saved', async () => {
      const { repository, deps } = setup();
      const session = new ImportSession([photo(1)], deps);
      await session.start();
      const id = session.getSnapshot().drafts[0].id;
      expect(isDraftReady(session.draft(id)!)).toBe(false);
      session.setCategory(id, 'shoes');
      session.toggleSeason(id, 'spring');
      session.changeColors(id, () => ({ ok: true, colors: [userColor('white')] }));
      session.setName(id, '  Old sneakers ');
      session.changeTags(id, () => ({ ok: true, tags: ['comfy'] }));
      expect((await session.saveReady())?.saved).toHaveLength(1);
      const [item] = await repository.list();
      expect(item).toMatchObject({ name: 'Old sneakers', category: 'shoes', seasons: ['spring'], tags: ['comfy'] });
    });

    it('keeps going when one draft fails, reports which one, and lets the user retry it', async () => {
      const { tagger, repository, imageProcessor, deps } = setup();
      tagger.fallback = TOP;
      const session = new ImportSession(photos(3), deps);
      await session.start();
      const second = session.getSnapshot().drafts[1].id;
      const prepare = imageProcessor.prepareForStorage.bind(imageProcessor);
      imageProcessor.prepareForStorage = async (source) => {
        if (source === uri(2)) throw new Error('disk full');
        return prepare(source);
      };
      const report = await session.saveReady();
      expect(report?.saved).toHaveLength(2);
      expect(report?.failed).toEqual([{ draftId: second, errors: [CLOSET_ITEM_MESSAGES.processFailed] }]);
      expect(describeSaveReport(report!)).toBe('Saved 2 pieces. 1 piece could not be saved; see below and try again.');
      const failed = session.draft(second)!;
      expect(failed.save).toEqual({ status: 'failed', errors: [CLOSET_ITEM_MESSAGES.processFailed] });
      expect(describeDraftStatus(failed)).toBe('Not saved');
      expect(await repository.list()).toHaveLength(2);

      imageProcessor.prepareForStorage = prepare;
      expect((await session.saveReady())?.saved).toHaveLength(1);
      expect(await repository.list()).toHaveLength(3);
      expect(session.getSnapshot().drafts).toEqual([]);
    });

    it('a repository failure keeps the draft and removes its stored copy', async () => {
      const { tagger, repository, imageStore, deps } = setup();
      tagger.fallback = TOP;
      repository.add = async () => {
        throw new Error('database locked');
      };
      const session = new ImportSession([photo(1)], deps);
      await session.start();
      const report = await session.saveReady();
      expect(report?.failed[0].errors).toEqual([CLOSET_ITEM_MESSAGES.saveFailed]);
      expect(imageStore.files.size).toBe(0);
      expect(session.getSnapshot().drafts).toHaveLength(1);
    });

    it('a second tap while saving does not save twice', async () => {
      const { tagger, repository, deps } = setup();
      tagger.fallback = TOP;
      const session = new ImportSession(photos(2), deps);
      await session.start();
      const [first, second] = await Promise.all([session.saveReady(), session.saveReady()]);
      expect(first?.saved).toHaveLength(2);
      expect(second).toBeNull();
      expect(await repository.list()).toHaveLength(2);
    });

    it('ignores edits and removals while saving', async () => {
      const { tagger, deps } = setup();
      tagger.fallback = TOP;
      const session = new ImportSession(photos(2), deps);
      await session.start();
      const [a, b] = session.getSnapshot().drafts.map((d) => d.id);
      const saving = session.saveReady();
      expect(session.getSnapshot().saving).toBe(true);
      session.setCategory(b, 'shoes');
      await session.remove(a);
      const report = await saving;
      expect(report?.saved.map((i) => i.category)).toEqual(['top', 'top']);
    });

    it('a user edit clears a failed save’s reasons', async () => {
      const { tagger, repository, deps } = setup();
      tagger.fallback = TOP;
      repository.add = async () => {
        throw new Error('nope');
      };
      const session = new ImportSession([photo(1)], deps);
      await session.start();
      await session.saveReady();
      const id = session.getSnapshot().drafts[0].id;
      session.setName(id, 'Tee');
      expect(session.draft(id)!.save).toEqual({ status: 'idle' });
    });
  });

  describe('discard and remove', () => {
    it('discarding deletes every temporary photo, saves nothing, and ignores late suggestions', async () => {
      const { tagger, repository, temporaryFiles, deps } = setup();
      const answer = deferred<TagOutcome>();
      tagger.answers.set(uri(1), answer.promise);
      const session = new ImportSession(photos(2), deps);
      const done = session.start();
      await flush();
      await session.discard();
      expect(session.getSnapshot()).toMatchObject({ closed: true, drafts: [] });
      expect(temporaryFiles.discarded.sort()).toEqual([uri(1), uri(2)]);
      answer.resolve(TOP);
      await done;
      expect(session.getSnapshot().drafts).toEqual([]);
      expect(await repository.list()).toEqual([]);
      expect(await session.saveReady()).toBeNull();
    });

    it('discarding mid-save finishes the item being saved, saves no more, and deletes the rest', async () => {
      const { tagger, repository, temporaryFiles, deps } = setup();
      tagger.fallback = TOP;
      const gate = deferred<void>();
      const add = repository.add.bind(repository);
      repository.add = async (item) => {
        await gate.promise;
        return add(item);
      };
      const session = new ImportSession(photos(3), deps);
      await session.start();
      const saving = session.saveReady();
      await flush();
      const discarded = session.discard();
      // The photo being saved is still being read: not deleted yet.
      expect(temporaryFiles.discarded).not.toContain(uri(1));
      gate.resolve();
      const report = await saving;
      await discarded;
      expect(report?.saved).toHaveLength(1);
      expect(await repository.list()).toHaveLength(1);
      // Picked copies (the processed copy of the saved photo is deleted by the add flow as usual).
      expect(temporaryFiles.discarded.filter((u) => u.includes('ImagePicker')).sort()).toEqual([uri(1), uri(2), uri(3)]);
    });

    it('removing a draft deletes its photo and ignores its late suggestion', async () => {
      const { tagger, temporaryFiles, deps } = setup();
      const answer = deferred<TagOutcome>();
      tagger.answers.set(uri(1), answer.promise);
      tagger.answers.set(uri(2), TOP);
      const session = new ImportSession(photos(2), deps);
      const done = session.start();
      await flush();
      const first = session.getSnapshot().drafts[0].id;
      await session.remove(first);
      expect(temporaryFiles.discarded).toEqual([uri(1)]);
      answer.resolve(TOP);
      await done;
      expect(session.getSnapshot().drafts.map((d) => d.photo.uri)).toEqual([uri(2)]);
    });

    it('discarding twice deletes each photo once', async () => {
      const { temporaryFiles, deps } = setup();
      const session = new ImportSession(photos(2), deps);
      await session.discard();
      await session.discard();
      expect(temporaryFiles.discarded).toHaveLength(2);
    });
  });

  it('notifies subscribers on every change', async () => {
    const { tagger, deps } = setup();
    tagger.fallback = TOP;
    const session = new ImportSession([photo(1)], deps);
    const listener = jest.fn();
    const unsubscribe = session.subscribe(listener);
    await session.start();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    session.setName(session.getSnapshot().drafts[0].id, 'x');
    expect(listener).not.toHaveBeenCalled();
  });

  it('draftValues leaves out a blank name', () => {
    const { deps } = setup();
    const session = new ImportSession([photo(1)], deps);
    const id = session.getSnapshot().drafts[0].id;
    session.setName(id, '   ');
    expect(draftValues(session.draft(id)!)).not.toHaveProperty('name');
  });
});

describe('beginImport', () => {
  it('caps the import at 20, deletes the photos left out, and says how many', async () => {
    const { temporaryFiles, deps } = setup();
    const started = await beginImport(photos(25), deps);
    const snapshot = started!.session.getSnapshot();
    expect(snapshot.drafts).toHaveLength(20);
    expect(snapshot.drafts.map((d) => d.photo.uri)).toEqual(photos(20).map((p) => p.uri));
    expect(temporaryFiles.discarded).toEqual([21, 22, 23, 24, 25].map(uri));
    expect(snapshot.notices).toEqual([
      'One import takes up to 20 photos. The first 20 are here; the other 5 were left out. Import them next.',
    ]);
    expect(started!.pickedCount).toBe(25);
  });

  it('adds a photo chosen twice once and deletes the extra copy', async () => {
    const { temporaryFiles, deps } = setup();
    const twice = { ...photo(1), uri: 'file:///cache/ImagePicker/p1-copy.jpg' };
    const started = await beginImport([photo(1), twice, photo(2)], deps);
    expect(started!.session.getSnapshot().drafts.map((d) => d.photo.uri)).toEqual([uri(1), uri(2)]);
    expect(temporaryFiles.discarded).toEqual([twice.uri]);
    expect(started!.session.getSnapshot().notices).toEqual(['1 photo chosen twice was added once.']);
  });

  it('returns null when nothing usable was picked', async () => {
    const { deps } = setup();
    expect(await beginImport([{ uri: '', width: 0, height: 0, assetId: null }], deps)).toBeNull();
  });
});

describe('ImportSessions', () => {
  it('holds one import at a time and discards the previous one', async () => {
    const { temporaryFiles, deps } = setup();
    const sessions = new ImportSessions();
    const first = new ImportSession([photo(1)], deps);
    const second = new ImportSession([photo(2)], deps);
    sessions.begin(first);
    sessions.begin(second);
    await flush();
    expect(sessions.current).toBe(second);
    expect(first.getSnapshot().closed).toBe(true);
    expect(temporaryFiles.discarded).toEqual([uri(1)]);
    await sessions.end(second);
    expect(sessions.current).toBeNull();
    expect(second.getSnapshot().closed).toBe(true);
  });
});

describe('review texts', () => {
  it('describes a draft for its row', async () => {
    const { tagger, deps } = setup();
    tagger.fallback = TOP;
    const session = new ImportSession(photos(2), deps);
    expect(describeDraftHeadline(session.getSnapshot().drafts[0])).toEqual({ title: 'No category yet', details: '', colors: '' });
    await session.start();
    const [a, b] = session.getSnapshot().drafts;
    expect(describeDraftHeadline(a)).toEqual({ title: 'Top', details: 'T-shirt · Solid', colors: 'Black' });
    session.setName(b.id, 'Band tee');
    expect(describeDraftHeadline(session.draft(b.id)!).details).toBe('Top · T-shirt · Solid');
  });

  const summary = (s: Partial<ReturnType<typeof summarizeDrafts>>) => ({
    total: 0,
    ready: 0,
    needsDetails: 0,
    analyzing: 0,
    failed: 0,
    ...s,
  });

  it('labels the Save button with how many pieces it saves', () => {
    expect(saveButtonLabel(summary({ total: 10, ready: 10 }))).toBe('Save all 10 pieces');
    expect(saveButtonLabel(summary({ total: 10, ready: 7, needsDetails: 3 }))).toBe('Save 7 pieces');
    expect(saveButtonLabel(summary({ total: 1, ready: 1 }))).toBe('Save all 1 piece');
    expect(saveButtonLabel(summary({ total: 3, needsDetails: 3 }))).toBe('Nothing ready to save');
  });

  it('explains what is not saved', () => {
    expect(describeNotReady(summary({ total: 10, ready: 10 }))).toBeNull();
    expect(describeNotReady(summary({ total: 10, ready: 7, needsDetails: 2, analyzing: 1 }))).toBe(
      '2 pieces need details; 1 piece still getting suggestions. Only ready pieces are saved; the rest stay here.',
    );
    expect(describeNotReady(summary({ total: 1, needsDetails: 1 }))).toBe(
      '1 piece needs details. Tap a piece to fill in what it needs.',
    );
  });
});
