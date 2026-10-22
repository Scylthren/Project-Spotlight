import {
  applyAttributeSuggestions,
  ATTRIBUTE_CHOICES,
  attributesToFields,
  attributeValueLabel,
  cleanAttributeSuggestions,
  clearSuggestedAttributes,
  createClothingItem,
  describeAttributeField,
  FORMALITY_SHORT_LABELS,
  EMPTY_ATTRIBUTE_FIELDS,
  fieldsToAttributes,
  FITS,
  FORMALITIES,
  hasSuggestedAttributes,
  isValidItemType,
  ITEM_TYPE_MAX_LENGTH,
  MATERIALS,
  normalizeItemType,
  PATTERNS,
  sameAttributes,
  setAttribute,
  toggleAttribute,
  validateAttributes,
  type AttributeFields,
  type ItemAttributes,
} from '@/core';

describe('vocabulary (ROADMAP D6)', () => {
  it('has the agreed lists, with hyphenated ids for two-word values', () => {
    expect([...PATTERNS]).toEqual(['solid', 'striped', 'checked', 'floral', 'graphic', 'polka-dot', 'animal', 'other']);
    expect([...MATERIALS]).toEqual(['cotton', 'denim', 'wool', 'knit', 'linen', 'silk', 'leather', 'synthetic', 'other']);
    expect([...FITS]).toEqual(['slim', 'regular', 'relaxed', 'oversized']);
    expect([...FORMALITIES]).toEqual(['athletic', 'casual', 'smart-casual', 'formal']);
    expect(ITEM_TYPE_MAX_LENGTH).toBe(30);
  });

  it('labels every value in sentence case', () => {
    for (const list of Object.values(ATTRIBUTE_CHOICES)) {
      for (const value of list) expect(attributeValueLabel(value)).toMatch(/^[A-Z][a-z]+( [a-z]+)?$/);
    }
    expect(attributeValueLabel('polka-dot')).toBe('Polka dot');
    expect(attributeValueLabel('smart-casual')).toBe('Smart casual');
  });
});

describe('type text', () => {
  it('normalizes whitespace and keeps case', () => {
    expect(normalizeItemType('  Band   hoodie ')).toBe('Band hoodie');
    expect(normalizeItemType('   ')).toBeNull();
    expect(normalizeItemType('T-shirt')).toBe('T-shirt');
  });

  it('accepts up to 30 characters, counting an emoji once', () => {
    expect(isValidItemType('x'.repeat(30))).toBe(true);
    expect(isValidItemType('x'.repeat(31))).toBe(false);
    expect(isValidItemType(`${'x'.repeat(29)}👕`)).toBe(true);
    expect(isValidItemType('')).toBe(false);
    expect(isValidItemType(' Hoodie')).toBe(false);
    expect(isValidItemType('Band  hoodie')).toBe(false);
    expect(isValidItemType(5)).toBe(false);
  });
});

describe('validateAttributes', () => {
  it('accepts undefined and any subset with valid values and sources', () => {
    expect(validateAttributes(undefined)).toEqual([]);
    expect(validateAttributes({ fit: { value: 'slim', source: 'user' } })).toEqual([]);
  });

  it.each<[string, unknown, RegExp]>([
    ['an empty object', {}, /left out/],
    ['an array', [], /object/],
    ['an unknown attribute', { sleeve: { value: 'long', source: 'user' } }, /sleeve/],
    ['an out-of-list value', { pattern: { value: 'paisley', source: 'auto' } }, /attributes.pattern must be one of/],
    ['a label instead of an id', { formality: { value: 'smart casual', source: 'auto' } }, /formality/],
    ['a bad source', { fit: { value: 'slim', source: 'ai' } }, /source/],
    ['a bare value', { fit: 'slim' }, /must be an object/],
    ['a long type', { type: { value: 'x'.repeat(31), source: 'user' } }, /attributes.type/],
  ])('rejects %s', (_name, value, message) => {
    expect(validateAttributes(value).join(' ')).toMatch(message);
  });
});

describe('createClothingItem with attributes', () => {
  const base = {
    id: 'a',
    photos: [{ id: 'p', role: 'front' as const, path: 'x.jpg', isPrimary: true }],
    category: 'top' as const,
    colors: [{ paletteId: 'black' as const, source: 'user' as const }],
    seasons: ['summer' as const],
  };

  it('normalizes the type and leaves the key out when there is nothing', () => {
    const made = createClothingItem({ ...base, attributes: { type: { value: '  Band  tee ', source: 'user' } } });
    expect(made.ok && made.item.attributes).toEqual({ type: { value: 'Band tee', source: 'user' } });
    const blank = createClothingItem({ ...base, attributes: { type: { value: '  ', source: 'user' } } });
    expect(blank.ok && 'attributes' in blank.item).toBe(false);
    const none = createClothingItem({ ...base, attributes: {} });
    expect(none.ok && 'attributes' in none.item).toBe(false);
  });

  it('rejects, not cuts, a too-long type, and reports unknown attributes', () => {
    const long = createClothingItem({ ...base, attributes: { type: { value: 'x'.repeat(31), source: 'user' } } });
    expect(long.ok).toBe(false);
    const unknown = createClothingItem({ ...base, attributes: { sleeve: { value: 'long', source: 'user' } } as ItemAttributes });
    expect(unknown.ok).toBe(false);
  });
});

describe('form fields', () => {
  const stored: ItemAttributes = {
    type: { value: 'Hoodie', source: 'user' },
    fit: { value: 'oversized', source: 'auto' },
  };

  it('round-trip a stored item\'s attributes; missing ones are empty and untouched', () => {
    const fields = attributesToFields(stored);
    expect(fields.type).toEqual({ value: 'Hoodie', source: 'user' });
    expect(fields.pattern).toEqual({ value: null, source: 'auto' });
    expect(fieldsToAttributes(fields)).toEqual(stored);
    expect(attributesToFields(undefined)).toEqual(EMPTY_ATTRIBUTE_FIELDS);
    expect(fieldsToAttributes(EMPTY_ATTRIBUTE_FIELDS)).toBeUndefined();
  });

  it('store a user-cleared field as absent and normalize the typed type', () => {
    let fields = attributesToFields(stored);
    fields = setAttribute(fields, 'type', '  Zip   hoodie ');
    fields = setAttribute(fields, 'fit', null);
    expect(fields.fit).toEqual({ value: null, source: 'user' });
    expect(fieldsToAttributes(fields)).toEqual({ type: { value: 'Zip hoodie', source: 'user' } });
  });

  it('toggle a choice on and off in one tap each, marking it user', () => {
    let fields: AttributeFields = EMPTY_ATTRIBUTE_FIELDS;
    fields = toggleAttribute(fields, 'pattern', 'striped');
    expect(fields.pattern).toEqual({ value: 'striped', source: 'user' });
    fields = toggleAttribute(fields, 'pattern', 'floral');
    expect(fields.pattern).toEqual({ value: 'floral', source: 'user' });
    fields = toggleAttribute(fields, 'pattern', 'floral');
    expect(fields.pattern).toEqual({ value: null, source: 'user' });
  });

  it('touching a suggested value makes it user, even when the same value is chosen again', () => {
    const suggested = applyAttributeSuggestions(EMPTY_ATTRIBUTE_FIELDS, { fit: 'slim' });
    expect(suggested.fit).toEqual({ value: 'slim', source: 'auto' });
    expect(setAttribute(suggested, 'fit', 'slim').fit).toEqual({ value: 'slim', source: 'user' });
  });

  it('do not mutate their input', () => {
    const fields = attributesToFields(stored);
    const copy = JSON.parse(JSON.stringify(fields));
    setAttribute(fields, 'fit', 'slim');
    toggleAttribute(fields, 'pattern', 'solid');
    applyAttributeSuggestions(fields, { pattern: 'solid' });
    clearSuggestedAttributes(fields);
    expect(fields).toEqual(copy);
  });
});

describe('suggestions', () => {
  it('fill only untouched fields, as auto', () => {
    const fields = setAttribute(setAttribute(EMPTY_ATTRIBUTE_FIELDS, 'fit', 'slim'), 'pattern', null);
    const next = applyAttributeSuggestions(fields, {
      type: 'Shirt',
      pattern: 'striped',
      material: 'cotton',
      fit: 'regular',
      formality: 'casual',
    });
    expect(next).toEqual({
      type: { value: 'Shirt', source: 'auto' },
      pattern: { value: null, source: 'user' },
      material: { value: 'cotton', source: 'auto' },
      fit: { value: 'slim', source: 'user' },
      formality: { value: 'casual', source: 'auto' },
    });
    expect(hasSuggestedAttributes(next)).toBe(true);
  });

  it('replace earlier suggestions and clear ones the new photo does not suggest', () => {
    const first = applyAttributeSuggestions(EMPTY_ATTRIBUTE_FIELDS, { type: 'Shirt', pattern: 'striped', fit: 'regular' });
    const touched = setAttribute(first, 'fit', 'relaxed');
    const second = applyAttributeSuggestions(touched, { pattern: 'floral' });
    expect(second.type).toEqual({ value: null, source: 'auto' });
    expect(second.pattern).toEqual({ value: 'floral', source: 'auto' });
    expect(second.fit).toEqual({ value: 'relaxed', source: 'user' });
  });

  it('drop out-of-vocabulary values and bad types', () => {
    expect(
      cleanAttributeSuggestions({
        type: '  Band   tee ',
        pattern: 'paisley',
        material: 'Cotton',
        fit: 'slim',
        formality: 'smart casual',
      }),
    ).toEqual({ type: 'Band tee', fit: 'slim' });
    expect(cleanAttributeSuggestions({ type: 'x'.repeat(31) })).toEqual({});
    expect(cleanAttributeSuggestions({ type: 42, fit: null })).toEqual({});
    const fields = applyAttributeSuggestions(EMPTY_ATTRIBUTE_FIELDS, { pattern: 'paisley', fit: 'slim' });
    expect(fields.pattern).toEqual({ value: null, source: 'auto' });
    expect(fields.fit).toEqual({ value: 'slim', source: 'auto' });
  });

  it('clearSuggestedAttributes removes auto values only (the source photo is gone)', () => {
    const fields = setAttribute(
      applyAttributeSuggestions(EMPTY_ATTRIBUTE_FIELDS, { type: 'Shirt', fit: 'regular' }),
      'type',
      'Oxford shirt',
    );
    const cleared = clearSuggestedAttributes(fields);
    expect(cleared.type).toEqual({ value: 'Oxford shirt', source: 'user' });
    expect(cleared.fit).toEqual({ value: null, source: 'auto' });
    expect(hasSuggestedAttributes(cleared)).toBe(false);
  });
});

describe('sameAttributes', () => {
  it('compares value and source; missing and undefined are the same', () => {
    expect(sameAttributes(undefined, undefined)).toBe(true);
    expect(sameAttributes({ fit: { value: 'slim', source: 'auto' } }, { fit: { value: 'slim', source: 'auto' } })).toBe(true);
    expect(sameAttributes({ fit: { value: 'slim', source: 'auto' } }, { fit: { value: 'slim', source: 'user' } })).toBe(false);
    expect(sameAttributes({ fit: { value: 'slim', source: 'auto' } }, undefined)).toBe(false);
  });
});

describe('describeAttributeField', () => {
  it('labels the value, marks suggestions, and says when nothing is set', () => {
    expect(describeAttributeField('pattern', { value: 'polka-dot', source: 'auto' })).toEqual({
      text: 'Polka dot',
      suggested: true,
      accessibilityLabel: 'Pattern, Polka dot, suggested',
    });
    expect(describeAttributeField('type', { value: 'Band tee', source: 'user' })).toEqual({
      text: 'Band tee',
      suggested: false,
      accessibilityLabel: 'Type, Band tee',
    });
    expect(describeAttributeField('fit', { value: null, source: 'user' })).toEqual({
      text: null,
      suggested: false,
      accessibilityLabel: 'Fit, not set',
    });
  });

  it('has a short label for every formality', () => {
    for (const f of FORMALITIES) expect(FORMALITY_SHORT_LABELS[f].length).toBeLessThanOrEqual(8);
  });
});
