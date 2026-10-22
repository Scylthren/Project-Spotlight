import { FakeClosetTagger, MockClosetTagger, type TagOutcome } from '@/ai/closet-tagger';
import { STUB_TAG_ITEM_RESPONSE, type ItemTags } from '@/ai/tag-item-contract';
import {
  EMPTY_ATTRIBUTE_FIELDS,
  EMPTY_ITEM_FORM,
  fieldsToAttributes,
  setAttribute,
  type AttributeFields,
  type ItemColor,
} from '@/core';

import { addClosetItem } from './add-closet-item';
import { FakeImageProcessor } from './image-processor';
import { InMemoryClosetRepository } from './in-memory-closet-repository';
import { FormTagSuggestions, type TagSuggestionHost } from './form-tag-suggestions';
import { PlaceholderTagImageSource, suggestFromPhoto, toPhotoSuggestions, type TagImageSource } from './item-suggestions';
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

/** A fake form: plain fields the test can read and change. */
function setup(initial: AttributeFields = EMPTY_ATTRIBUTE_FIELDS) {
  const form = {
    attributes: initial,
    front: 'draft-1' as string | null,
    colors: [] as [string, ItemColor[]][],
    suggesting: [] as boolean[],
    active: true,
  };
  const host: TagSuggestionHost = {
    attributes: () => form.attributes,
    setAttributes: (next) => {
      form.attributes = next;
    },
    frontPhotoId: () => form.front,
    suggestColors: (id, colors) => form.colors.push([id, colors]),
    setSuggesting: (s) => form.suggesting.push(s),
    isActive: () => form.active,
  };
  const tagger = new FakeClosetTagger();
  const suggestions = new FormTagSuggestions(
    { tagger, imageSource: new PlaceholderTagImageSource() },
    host,
    { onError: () => undefined },
  );
  return { form, tagger, suggestions };
}

describe('FormTagSuggestions', () => {
  it('with the mock tagger, picking a photo pre-fills every attribute as auto (stub colors are not used)', async () => {
    const { form, suggestions } = setup();
    const real = new FormTagSuggestions(
      { tagger: new MockClosetTagger(), imageSource: new PlaceholderTagImageSource() },
      {
        attributes: () => form.attributes,
        setAttributes: (next) => {
          form.attributes = next;
        },
        frontPhotoId: () => 'draft-1',
        suggestColors: (id, colors) => form.colors.push([id, colors]),
        setSuggesting: (s) => form.suggesting.push(s),
        isActive: () => true,
      },
    );
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
      const pending = suggestFromPhoto('x', { tagger: never, imageSource: new PlaceholderTagImageSource() }, { timeoutMs: 50 });
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

describe('toPhotoSuggestions', () => {
  it('ignores the colors of a stub answer and keeps real ones (at most three, unique)', () => {
    expect(toPhotoSuggestions({ ...NO_TAGS, colors: ['navy'] }, true).colors).toEqual([]);
    const real = toPhotoSuggestions({ ...NO_TAGS, colors: ['navy', 'navy', 'red', 'white', 'black'] as ItemTags['colors'] }, false);
    expect(real.colors.map((c) => c.paletteId)).toEqual(['navy', 'red', 'white']);
  });

  it('keeps attribute suggestions from a stub answer', () => {
    expect(toPhotoSuggestions({ ...NO_TAGS, fit: 'slim' }, true).attributes).toEqual({ fit: 'slim' });
  });
});
