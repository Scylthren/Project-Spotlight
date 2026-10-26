import { FakeClosetTagger, MockClosetTagger, type TagOutcome } from '@/ai/closet-tagger';
import { RemoteClosetTagger } from '@/ai/remote-closet-tagger';
import { STUB_TAG_ITEM_RESPONSE, type ItemTags } from '@/ai/tag-item-contract';
import {
  categorySeasonFields,
  EMPTY_ATTRIBUTE_FIELDS,
  EMPTY_ITEM_FORM,
  fieldsToAttributes,
  pickCategory,
  setAttribute,
  toggleFormSeason,
  type AttributeFields,
  type CategorySeasonFields,
  type ItemColor,
} from '@/core';

import { addClosetItem } from './add-closet-item';
import { InMemoryDevTokenStore } from './dev-token-store';
import { FakeImageProcessor } from './image-processor';
import { InMemoryClosetRepository } from './in-memory-closet-repository';
import { FormTagSuggestions, type TagSuggestionHost } from './form-tag-suggestions';
import { suggestFromPhoto, toPhotoSuggestions, type TagImageSource } from './item-suggestions';
import { FixedTagImageSource } from './testing/fixed-tag-image-source';
import { MemoryImageStore } from './memory-image-store';
import { RecordingTemporaryFiles } from './temporary-files';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

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

function tagged(tags: Partial<ItemTags>, stub = false): TagOutcome {
  return { ok: true, tags: { ...NO_TAGS, ...tags }, stub };
}

type FakeForm = {
  attributes: AttributeFields;
  categorySeason: CategorySeasonFields;
  front: string | null;
  colors: [string, ItemColor[]][];
  suggesting: boolean[];
  /** Every "No suggestions" flag change, in order. */
  none: boolean[];
  active: boolean;
};

function hostFor(form: FakeForm): TagSuggestionHost {
  return {
    attributes: () => form.attributes,
    setAttributes: (next) => {
      form.attributes = next;
    },
    categorySeason: () => form.categorySeason,
    setCategorySeason: (next) => {
      form.categorySeason = next;
    },
    frontPhotoId: () => form.front,
    suggestColors: (id, colors) => form.colors.push([id, colors]),
    setSuggesting: (s) => form.suggesting.push(s),
    setNoSuggestions: (none) => form.none.push(none),
    isActive: () => form.active,
  };
}

/** A fake form: plain fields the test can read and change. */
function setup(initial: AttributeFields = EMPTY_ATTRIBUTE_FIELDS, initialCategorySeason = categorySeasonFields(null, [])) {
  const form: FakeForm = {
    attributes: initial,
    categorySeason: initialCategorySeason,
    front: 'draft-1',
    colors: [],
    suggesting: [],
    none: [],
    active: true,
  };
  const tagger = new FakeClosetTagger();
  const imageSource = new FixedTagImageSource();
  const suggestions = new FormTagSuggestions({ tagger, imageSource }, hostFor(form), { onError: () => undefined });
  return { form, tagger, suggestions, imageSource };
}

describe('FormTagSuggestions', () => {
  it('with the mock tagger, picking a photo pre-fills every attribute as auto (stub colors are not used)', async () => {
    const { form, suggestions } = setup();
    const real = new FormTagSuggestions({ tagger: new MockClosetTagger(), imageSource: new FixedTagImageSource() }, hostFor(form));
    expect(suggestions.pending).toBeNull();
    await real.frontPhotoPicked('draft-1', 'file:///front.jpg');
    const { type, pattern, material, fit, formality } = STUB_TAG_ITEM_RESPONSE.tags;
    expect(fieldsToAttributes(form.attributes)).toEqual({
      type: { value: type, source: 'auto' },
      pattern: { value: pattern, source: 'auto' },
      material: { value: material, source: 'auto' },
      fit: { value: fit, source: 'auto' },
      formality: { value: formality, source: 'auto' },
    });
    expect(form.suggesting).toEqual([true, false]);
    expect(form.colors).toEqual([]);
  });

  it('a field the user edits before suggestions arrive keeps the user value (also a cleared one)', async () => {
    const { form, tagger, suggestions } = setup();
    const reply = deferred<TagOutcome>();
    tagger.queue.push(() => reply.promise);
    const running = suggestions.frontPhotoPicked('draft-1', 'file:///front.jpg');
    form.attributes = setAttribute(form.attributes, 'fit', 'slim');
    form.attributes = setAttribute(form.attributes, 'pattern', null);
    form.attributes = setAttribute(form.attributes, 'type', 'Tee');
    reply.resolve(tagged({ type: 'Shirt', pattern: 'striped', fit: 'regular', material: 'linen' }));
    await running;
    expect(form.attributes).toEqual({
      type: { value: 'Tee', source: 'user' },
      pattern: { value: null, source: 'user' },
      material: { value: 'linen', source: 'auto' },
      fit: { value: 'slim', source: 'user' },
      formality: { value: null, source: 'auto' },
    });
  });

  it('a late suggestion for an earlier photo never overwrites anything', async () => {
    const { form, tagger, suggestions } = setup();
    const slow = deferred<TagOutcome>();
    tagger.queue.push(() => slow.promise, tagged({ fit: 'relaxed' }));
    const first = suggestions.frontPhotoPicked('draft-1', 'file:///one.jpg');
    form.front = 'draft-2';
    await suggestions.frontPhotoPicked('draft-2', 'file:///two.jpg');
    form.attributes = setAttribute(form.attributes, 'material', 'denim');
    slow.resolve(tagged({ fit: 'slim', material: 'wool', pattern: 'floral' }));
    await first;
    expect(form.attributes.fit).toEqual({ value: 'relaxed', source: 'auto' });
    expect(form.attributes.material).toEqual({ value: 'denim', source: 'user' });
    expect(form.attributes.pattern).toEqual({ value: null, source: 'auto' });
    expect(form.suggesting).toEqual([true, true, false]);
  });

  it('changing the photo after suggestions arrived re-suggests only untouched fields', async () => {
    const { form, tagger, suggestions } = setup();
    tagger.queue.push(
      tagged({ type: 'Shirt', pattern: 'striped', material: 'cotton', fit: 'regular', formality: 'casual' }),
      tagged({ type: 'Dress', pattern: 'floral', fit: 'relaxed' }),
    );
    await suggestions.frontPhotoPicked('draft-1', 'file:///one.jpg');
    form.attributes = setAttribute(form.attributes, 'pattern', 'checked');
    form.attributes = setAttribute(form.attributes, 'formality', 'casual');
    form.front = 'draft-2';
    await suggestions.frontPhotoPicked('draft-2', 'file:///two.jpg');
    expect(form.attributes).toEqual({
      type: { value: 'Dress', source: 'auto' },
      pattern: { value: 'checked', source: 'user' },
      material: { value: null, source: 'auto' },
      fit: { value: 'relaxed', source: 'auto' },
      formality: { value: 'casual', source: 'user' },
    });
  });

  it('removing the source photo (retaking the front) clears its suggested values at once, before any reply', async () => {
    const start = setAttribute(
      { ...EMPTY_ATTRIBUTE_FIELDS, pattern: { value: 'striped', source: 'auto' }, fit: { value: 'regular', source: 'auto' } },
      'type',
      'Shirt',
    );
    const { form, tagger, suggestions } = setup(start);
    const reply = deferred<TagOutcome>();
    tagger.queue.push(() => reply.promise);
    form.front = 'new-front';
    const running = suggestions.frontPhotoPicked('new-front', 'file:///new.jpg');
    expect(fieldsToAttributes(form.attributes)).toEqual({ type: { value: 'Shirt', source: 'user' } });
    reply.resolve({ ok: false, failure: 'offline' });
    await running;
    expect(fieldsToAttributes(form.attributes)).toEqual({ type: { value: 'Shirt', source: 'user' } });
    expect(form.suggesting).toEqual([true, false]);
  });

  it('drops out-of-vocabulary suggestions and keeps the valid ones', async () => {
    const { form, tagger, suggestions } = setup();
    tagger.queue.push(
      tagged({ pattern: 'paisley', material: 'Cotton', fit: 'slim', type: 'x'.repeat(31) } as unknown as Partial<ItemTags>),
    );
    await suggestions.frontPhotoPicked('draft-1', 'file:///front.jpg');
    expect(fieldsToAttributes(form.attributes)).toEqual({ fit: { value: 'slim', source: 'auto' } });
  });

  it('a failure, a throwing tagger or image source, or a timeout gives no suggestion and never rejects', async () => {
    const { form, tagger, suggestions } = setup();
    tagger.queue.push({ ok: false, failure: 'server' }, () => Promise.reject(new Error('bug')));
    await expect(suggestions.frontPhotoPicked('draft-1', 'a')).resolves.toBeUndefined();
    await expect(suggestions.frontPhotoPicked('draft-1', 'b')).resolves.toBeUndefined();
    expect(form.attributes).toEqual(EMPTY_ATTRIBUTE_FIELDS);

    const brokenSource: TagImageSource = { read: () => Promise.reject(new Error('no file')) };
    const errors: unknown[] = [];
    expect(await suggestFromPhoto('x', { tagger, imageSource: brokenSource }, { onError: (e) => errors.push(e) })).toBeNull();
    expect(errors).toHaveLength(1);

    jest.useFakeTimers();
    try {
      const never = new FakeClosetTagger();
      never.queue.push(() => new Promise<TagOutcome>(() => undefined));
      const pending = suggestFromPhoto('x', { tagger: never, imageSource: new FixedTagImageSource() }, { timeoutMs: 50 });
      await jest.advanceTimersByTimeAsync(50);
      expect(await pending).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('passes real (non-stub) colors on for the photo, and ignores the result when the photo is no longer the front', async () => {
    const { form, tagger, suggestions } = setup();
    tagger.queue.push(tagged({ colors: ['navy', 'white'], fit: 'slim' }));
    await suggestions.frontPhotoPicked('draft-1', 'a');
    expect(form.colors).toEqual([
      [
        'draft-1',
        [
          { paletteId: 'navy', hex: expect.stringMatching(/^#[0-9A-F]{6}$/), source: 'auto' },
          { paletteId: 'white', hex: expect.stringMatching(/^#[0-9A-F]{6}$/), source: 'auto' },
        ],
      ],
    ]);

    const reply = deferred<TagOutcome>();
    tagger.queue.push(() => reply.promise);
    const running = suggestions.frontPhotoPicked('draft-1', 'b');
    form.front = null;
    reply.resolve(tagged({ colors: ['red'], fit: 'relaxed' }));
    await running;
    expect(form.colors).toHaveLength(1);
    expect(form.attributes.fit).toEqual({ value: null, source: 'auto' });
  });

  it('reset and cancel drop a running request; nothing applies after the form closed', async () => {
    const { form, tagger, suggestions } = setup();
    const reply = deferred<TagOutcome>();
    tagger.queue.push(() => reply.promise);
    const running = suggestions.frontPhotoPicked('draft-1', 'a');
    suggestions.reset();
    expect(suggestions.pending).toBeNull();
    reply.resolve(tagged({ fit: 'slim' }));
    await running;
    expect(form.attributes.fit.value).toBeNull();
    expect(form.suggesting).toEqual([true, false]);

    const second = deferred<TagOutcome>();
    tagger.queue.push(() => second.promise);
    const again = suggestions.frontPhotoPicked('draft-1', 'b');
    suggestions.cancel();
    form.active = false;
    second.resolve(tagged({ fit: 'slim' }));
    await again;
    expect(form.attributes.fit.value).toBeNull();
    await suggestions.frontPhotoPicked('draft-1', 'c');
    expect(tagger.inputs).toHaveLength(2);
  });

  it('a tagger failure never blocks saving: the item saves with whatever the user chose', async () => {
    const { form, suggestions, tagger } = setup();
    tagger.fallback = { ok: false, failure: 'offline' };
    await suggestions.frontPhotoPicked('draft-1', 'file:///front.jpg');
    form.attributes = setAttribute(form.attributes, 'formality', 'formal');
    const repository = new InMemoryClosetRepository();
    const result = await addClosetItem(
      {
        ...EMPTY_ITEM_FORM,
        category: 'top',
        colors: [{ paletteId: 'black', hex: '#111111', source: 'user' }],
        seasons: ['winter'],
        tags: [],
        attributes: form.attributes,
        photos: [{ kind: 'picked', id: 'draft-1', uri: 'file:///front.jpg', role: 'front', isPrimary: true }],
      },
      {
        repository,
        imageStore: new MemoryImageStore(),
        imageProcessor: new FakeImageProcessor(),
        temporaryFiles: new RecordingTemporaryFiles(),
        newId: () => 'new-item',
      },
    );
    expect(result.ok).toBe(true);
    expect((await repository.get('new-item'))?.attributes).toEqual({ formality: { value: 'formal', source: 'user' } });
  });
});

describe('FormTagSuggestions: category, seasons, "No suggestions", one request per photo (slice 3)', () => {
  it('a real answer fills an untouched category and seasons as auto', async () => {
    const { form, tagger, suggestions } = setup();
    tagger.queue.push(tagged({ category: 'outerwear', seasons: ['winter', 'autumn'] }));
    await suggestions.frontPhotoPicked('draft-1', 'a');
    expect(form.categorySeason).toEqual({
      category: { value: 'outerwear', source: 'auto' },
      seasons: { value: ['autumn', 'winter'], source: 'auto' },
    });
  });

  it('a stub answer never sets category or seasons (canned values)', async () => {
    const { form, tagger, suggestions } = setup();
    tagger.queue.push(tagged({ category: 'top', seasons: ['spring'], fit: 'slim' }, true));
    await suggestions.frontPhotoPicked('draft-1', 'a');
    expect(form.categorySeason).toEqual(categorySeasonFields(null, []));
    expect(form.attributes.fit).toEqual({ value: 'slim', source: 'auto' });
  });

  it('a category or season the user sets while waiting wins over a late reply', async () => {
    const { form, tagger, suggestions } = setup();
    const reply = deferred<TagOutcome>();
    tagger.queue.push(() => reply.promise);
    const running = suggestions.frontPhotoPicked('draft-1', 'a');
    form.categorySeason = toggleFormSeason(pickCategory(form.categorySeason, 'bottom'), 'summer');
    reply.resolve(tagged({ category: 'top', seasons: ['winter'] }));
    await running;
    expect(form.categorySeason).toEqual({
      category: { value: 'bottom', source: 'user' },
      seasons: { value: ['summer'], source: 'user' },
    });
  });

  it('retaking the front clears suggested category and seasons at once; the user\'s stay', async () => {
    const start = { category: { value: 'shoes' as const, source: 'auto' as const }, seasons: { value: ['winter' as const], source: 'user' as const } };
    const { form, tagger, suggestions } = setup(EMPTY_ATTRIBUTE_FIELDS, start);
    const reply = deferred<TagOutcome>();
    tagger.queue.push(() => reply.promise);
    form.front = 'draft-2';
    const running = suggestions.frontPhotoPicked('draft-2', 'b');
    expect(form.categorySeason).toEqual({ category: { value: null, source: 'auto' }, seasons: start.seasons });
    reply.resolve({ ok: false, failure: 'timeout' });
    await running;
    expect(form.categorySeason).toEqual({ category: { value: null, source: 'auto' }, seasons: start.seasons });
  });

  it('never replaces the category and seasons of a saved item being edited', async () => {
    const loaded = categorySeasonFields('dress', ['summer']);
    const { form, tagger, suggestions } = setup(EMPTY_ATTRIBUTE_FIELDS, loaded);
    tagger.queue.push(tagged({ category: 'top', seasons: ['winter'], fit: 'slim' }));
    await suggestions.frontPhotoPicked('draft-1', 'a');
    expect(form.categorySeason).toEqual(loaded);
    expect(form.attributes.fit.value).toBe('slim');
  });

  it.each(['not-configured', 'no-token', 'unauthorized', 'offline', 'timeout', 'rejected', 'server', 'invalid-response'] as const)(
    'shows "No suggestions" after a %s failure and clears it on the next pick',
    async (failure) => {
      const { form, tagger, suggestions } = setup();
      tagger.queue.push({ ok: false, failure }, tagged({ fit: 'slim' }));
      await suggestions.frontPhotoPicked('draft-1', 'a');
      expect(form.none).toEqual([false, true]);
      form.front = 'draft-2';
      await suggestions.frontPhotoPicked('draft-2', 'b');
      expect(form.none).toEqual([false, true, false]);
    },
  );

  it('shows "No suggestions" when the answer has nothing usable (e.g. not a clothing photo), not when it has something', async () => {
    const { form, tagger, suggestions } = setup();
    tagger.queue.push(tagged({}), tagged({ colors: ['red'] }));
    await suggestions.frontPhotoPicked('draft-1', 'a');
    expect(form.none).toEqual([false, true]);
    await suggestions.frontPhotoPicked('draft-1', 'b');
    expect(form.none).toEqual([false, true, false]);
  });

  it('a failure for a photo that is no longer the front, or after reset, shows nothing', async () => {
    const { form, tagger, suggestions } = setup();
    const reply = deferred<TagOutcome>();
    tagger.queue.push(() => reply.promise);
    const running = suggestions.frontPhotoPicked('draft-1', 'a');
    form.front = null;
    reply.resolve({ ok: false, failure: 'offline' });
    await running;
    expect(form.none).toEqual([false]);

    form.front = 'draft-1';
    const second = deferred<TagOutcome>();
    tagger.queue.push(() => second.promise);
    const again = suggestions.frontPhotoPicked('draft-1', 'b');
    suggestions.reset();
    second.resolve({ ok: false, failure: 'offline' });
    await again;
    expect(form.none).toEqual([false, false, false]);
  });

  it('sends one request per photo: a second call for the photo in flight is ignored', async () => {
    const { form, tagger, suggestions, imageSource } = setup();
    const reply = deferred<TagOutcome>();
    tagger.queue.push(() => reply.promise, tagged({ fit: 'relaxed' }));
    const first = suggestions.frontPhotoPicked('draft-1', 'a');
    const duplicate = suggestions.frontPhotoPicked('draft-1', 'a');
    await duplicate;
    reply.resolve(tagged({ fit: 'slim' }));
    await first;
    expect(imageSource.reads).toEqual(['a']);
    expect(tagger.inputs).toHaveLength(1);
    expect(form.attributes.fit).toEqual({ value: 'slim', source: 'auto' });
    expect(form.suggesting).toEqual([true, false]);
  });

  it('after leaving the screen a late reply changes nothing (no fields, no flags)', async () => {
    const { form, tagger, suggestions } = setup();
    const reply = deferred<TagOutcome>();
    tagger.queue.push(() => reply.promise);
    const running = suggestions.frontPhotoPicked('draft-1', 'a');
    suggestions.cancel();
    form.active = false;
    const before = JSON.stringify(form);
    reply.resolve(tagged({ category: 'top', seasons: ['summer'], fit: 'slim', colors: ['red'] }));
    await running;
    expect(JSON.stringify(form)).toBe(before);
  });

  it('with the remote tagger and no saved token, shows "No suggestions" and saving still works', async () => {
    const form: FakeForm = {
      attributes: EMPTY_ATTRIBUTE_FIELDS,
      categorySeason: categorySeasonFields(null, []),
      front: 'draft-1',
      colors: [],
      suggesting: [],
      none: [],
      active: true,
    };
    const fetchMock = jest.fn();
    const tagger = new RemoteClosetTagger({
      url: 'https://example.supabase.co/functions/v1/tag-item',
      tokenStore: new InMemoryDevTokenStore(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const suggestions = new FormTagSuggestions({ tagger, imageSource: new FixedTagImageSource() }, hostFor(form));
    await suggestions.frontPhotoPicked('draft-1', 'file:///front.jpg');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(form.none).toEqual([false, true]);
    const result = await addClosetItem(
      {
        ...EMPTY_ITEM_FORM,
        category: 'top',
        colors: [{ paletteId: 'black', hex: '#111111', source: 'user' }],
        seasons: ['winter'],
        tags: [],
        attributes: form.attributes,
        photos: [{ kind: 'picked', id: 'draft-1', uri: 'file:///front.jpg', role: 'front', isPrimary: true }],
      },
      {
        repository: new InMemoryClosetRepository(),
        imageStore: new MemoryImageStore(),
        imageProcessor: new FakeImageProcessor(),
        temporaryFiles: new RecordingTemporaryFiles(),
        newId: () => 'item-1',
      },
    );
    expect(result.ok).toBe(true);
  });
});

describe('cancelling abandoned tagging requests', () => {
  afterEach(() => jest.useRealTimers());

  it('suggestFromPhoto: an abort ends the call at once with no suggestion, aborts the tagger\'s request, and is not reported', async () => {
    const tagger = new FakeClosetTagger();
    tagger.queue.push(() => new Promise<TagOutcome>(() => undefined));
    const errors: unknown[] = [];
    const controller = new AbortController();
    const pending = suggestFromPhoto('x', { tagger, imageSource: new FixedTagImageSource() }, { signal: controller.signal, onError: (e) => errors.push(e) });
    await Promise.resolve();
    await Promise.resolve();
    expect(tagger.signals[0]?.aborted).toBe(false);
    controller.abort();
    expect(await pending).toBeNull();
    expect(tagger.signals[0]?.aborted).toBe(true);
    expect(errors).toEqual([]);
  });

  it('suggestFromPhoto: an already aborted signal reads no photo and sends nothing', async () => {
    const tagger = new FakeClosetTagger();
    const imageSource = new FixedTagImageSource();
    expect(await suggestFromPhoto('x', { tagger, imageSource }, { signal: AbortSignal.abort() })).toBeNull();
    expect(imageSource.reads).toEqual([]);
    expect(tagger.inputs).toEqual([]);
  });

  it('suggestFromPhoto: aborted while the photo is being prepared, the photo is never sent', async () => {
    const tagger = new FakeClosetTagger();
    const image = deferred<Awaited<ReturnType<TagImageSource['read']>>>();
    const errors: unknown[] = [];
    const controller = new AbortController();
    const pending = suggestFromPhoto('x', { tagger, imageSource: { read: () => image.promise } }, { signal: controller.signal, onError: (e) => errors.push(e) });
    controller.abort();
    expect(await pending).toBeNull();
    image.resolve(await new FixedTagImageSource().read('x'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tagger.inputs).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('suggestFromPhoto: a timeout also aborts the tagger\'s request', async () => {
    jest.useFakeTimers();
    const tagger = new FakeClosetTagger();
    tagger.queue.push(() => new Promise<TagOutcome>(() => undefined));
    const pending = suggestFromPhoto('x', { tagger, imageSource: new FixedTagImageSource() }, { timeoutMs: 50, onError: () => undefined });
    await jest.advanceTimersByTimeAsync(50);
    expect(await pending).toBeNull();
    expect(tagger.signals[0]?.aborted).toBe(true);
  });

  it('the form aborts the running request when it closes, is cleared, or gets a new front photo, and never shows "No suggestions" for it', async () => {
    const { form, tagger, suggestions } = setup();
    const hang = () => new Promise<TagOutcome>(() => undefined);

    tagger.queue.push(hang);
    const first = suggestions.frontPhotoPicked('draft-1', 'a');
    await new Promise((resolve) => setTimeout(resolve, 0));
    form.front = 'draft-2';
    tagger.queue.push(hang);
    const second = suggestions.frontPhotoPicked('draft-2', 'b');
    await first;
    expect(tagger.signals[0]?.aborted).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    suggestions.reset();
    await second;
    expect(tagger.signals[1]?.aborted).toBe(true);

    tagger.queue.push(hang);
    const third = suggestions.frontPhotoPicked('draft-2', 'c');
    await new Promise((resolve) => setTimeout(resolve, 0));
    suggestions.cancel();
    form.active = false;
    await third;
    expect(tagger.signals[2]?.aborted).toBe(true);
    expect(form.none).not.toContain(true);
  });

  it('closing the form aborts the real HTTP request (remote tagger), and saving still works', async () => {
    const fetchSignals: (AbortSignal | undefined)[] = [];
    const tagger = new RemoteClosetTagger({
      url: 'https://example.supabase.co/functions/v1/tag-item',
      tokenStore: new InMemoryDevTokenStore('5b'.repeat(32)),
      fetch: ((_input: RequestInfo | URL, init?: RequestInit) => {
        fetchSignals.push(init?.signal ?? undefined);
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('Aborted'))));
      }) as typeof fetch,
    });
    const form: FakeForm = {
      attributes: EMPTY_ATTRIBUTE_FIELDS,
      categorySeason: categorySeasonFields(null, []),
      front: 'draft-1',
      colors: [],
      suggesting: [],
      none: [],
      active: true,
    };
    const suggestions = new FormTagSuggestions({ tagger, imageSource: new FixedTagImageSource() }, hostFor(form), { onError: () => undefined });
    const running = suggestions.frontPhotoPicked('draft-1', 'file:///photo.jpg');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchSignals).toHaveLength(1);
    expect(fetchSignals[0]?.aborted).toBe(false);

    const repository = new InMemoryClosetRepository();
    const saved = await addClosetItem(
      {
        ...EMPTY_ITEM_FORM,
        category: 'top',
        seasons: ['summer'],
        colors: [{ paletteId: 'black', hex: '#111111', source: 'user' }],
        photos: [{ kind: 'picked', id: 'draft-1', role: 'front', isPrimary: true, uri: 'file:///photo.jpg' }],
      },
      {
        repository,
        imageStore: new MemoryImageStore(),
        imageProcessor: new FakeImageProcessor(),
        temporaryFiles: new RecordingTemporaryFiles(),
        newId: () => 'saved-while-tagging',
      },
    );
    expect(saved.ok).toBe(true);

    suggestions.cancel();
    form.active = false;
    await running;
    expect(fetchSignals[0]?.aborted).toBe(true);
    expect(form.none).not.toContain(true);
  });
});

describe('toPhotoSuggestions', () => {
  it('ignores the colors of a stub answer and keeps real ones (at most three, unique)', () => {
    expect(toPhotoSuggestions({ ...NO_TAGS, colors: ['navy'] }, true).colors).toEqual([]);
    const real = toPhotoSuggestions({ ...NO_TAGS, colors: ['navy', 'navy', 'red', 'white', 'black'] as ItemTags['colors'] }, false);
    expect(real.colors.map((c) => c.paletteId)).toEqual(['navy', 'red', 'white']);
  });

  it('maps category and seasons from a real answer (season order) and ignores them from a stub', () => {
    const tags: ItemTags = { ...NO_TAGS, category: 'shoes', seasons: ['winter', 'spring'] };
    expect(toPhotoSuggestions(tags, false)).toMatchObject({ category: 'shoes', seasons: ['spring', 'winter'] });
    expect(toPhotoSuggestions(tags, true)).toMatchObject({ category: null, seasons: [] });
  });

  it('keeps attribute suggestions from a stub answer', () => {
    expect(toPhotoSuggestions({ ...NO_TAGS, fit: 'slim' }, true).attributes).toEqual({ fit: 'slim' });
  });
});
