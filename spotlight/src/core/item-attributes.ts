/**
 * Item attributes (Gate 2, ROADMAP decision D6): type, pattern, material, fit
 * and formality. Pure functions shared by the validator, the forms and the
 * suggestion flow. They never mutate their input.
 *
 * - Type is short free text ("Hoodie"), at most ITEM_TYPE_MAX_LENGTH
 *   characters, trimmed with inner whitespace collapsed. Its case is kept.
 * - Pattern, material, fit and formality come from fixed lists. Stored values
 *   are ids ("polka-dot", "smart-casual"); labels are for display only.
 * - Every value has a source, like colors: 'auto' when it was suggested from
 *   the photo, 'user' once the user set, changed or cleared it.
 * - Suggestions (D6/D7 rules, `applyAttributeSuggestions`) never replace a
 *   value the user touched, even when they arrive late. When the front photo
 *   changes, untouched values are cleared (`clearSuggestedAttributes`) and
 *   suggested again from the new photo.
 * - An item stores only the attributes that have a value; an item without any
 *   has no `attributes` key at all (like `name`), so items stored before
 *   Gate 2 load unchanged.
 */
import type { ColorSource } from './types';

export const ITEM_TYPE_MAX_LENGTH = 30;

export const PATTERNS = ['solid', 'striped', 'checked', 'floral', 'graphic', 'polka-dot', 'animal', 'other'] as const;
export type Pattern = (typeof PATTERNS)[number];

export const MATERIALS = ['cotton', 'denim', 'wool', 'knit', 'linen', 'silk', 'leather', 'synthetic', 'other'] as const;
export type Material = (typeof MATERIALS)[number];

export const FITS = ['slim', 'regular', 'relaxed', 'oversized'] as const;
export type Fit = (typeof FITS)[number];

export const FORMALITIES = ['athletic', 'casual', 'smart-casual', 'formal'] as const;
export type Formality = (typeof FORMALITIES)[number];

/** The attribute names, in display order. */
export const ATTRIBUTE_NAMES = ['type', 'pattern', 'material', 'fit', 'formality'] as const;
export type AttributeName = (typeof ATTRIBUTE_NAMES)[number];

/** The value type of each attribute. */
export interface AttributeValueMap {
  type: string;
  pattern: Pattern;
  material: Material;
  fit: Fit;
  formality: Formality;
}

/** The attributes with a fixed list of values. */
export type ChoiceAttributeName = Exclude<AttributeName, 'type'>;

export const ATTRIBUTE_CHOICES: { readonly [K in ChoiceAttributeName]: readonly AttributeValueMap[K][] } = Object.freeze({
  pattern: PATTERNS,
  material: MATERIALS,
  fit: FITS,
  formality: FORMALITIES,
});

/** A stored attribute value and where it came from. */
export interface AttributeValue<V> {
  value: V;
  source: ColorSource;
}

/** An item's attributes. Only the ones with a value are present. */
export type ItemAttributes = { [K in AttributeName]?: AttributeValue<AttributeValueMap[K]> };

/** Field names: "Type", "Pattern". */
export const ATTRIBUTE_LABELS: Readonly<Record<AttributeName, string>> = Object.freeze({
  type: 'Type',
  pattern: 'Pattern',
  material: 'Material',
  fit: 'Fit',
  formality: 'Formality',
});

const VALUE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'polka-dot': 'Polka dot',
  'smart-casual': 'Smart casual',
});

/** Display label of a choice value: "Striped", "Polka dot", "Smart casual". */
export function attributeValueLabel(value: string): string {
  return VALUE_LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

/** Characters as the user sees them (code points). */
function length(text: string): number {
  return [...text].length;
}

/**
 * The type to store for what was typed: trimmed, inner whitespace collapsed,
 * or null when nothing is left. Too-long text is returned as is, so
 * validation rejects it instead of cutting it silently.
 */
export function normalizeItemType(text: string): string | null {
  const normalized = text.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

/** A stored type: normalized (see `normalizeItemType`), non-empty, at most ITEM_TYPE_MAX_LENGTH characters. */
export function isValidItemType(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    normalizeItemType(value) === value &&
    length(value) <= ITEM_TYPE_MAX_LENGTH
  );
}

/** True if `value` is a valid value of attribute `name`. */
export function isAttributeValue<K extends AttributeName>(name: K, value: unknown): value is AttributeValueMap[K] {
  if (name === 'type') return isValidItemType(value);
  return typeof value === 'string' && (ATTRIBUTE_CHOICES[name as ChoiceAttributeName] as readonly string[]).includes(value);
}

/** Problems with an item's `attributes` (undefined is fine), each starting with "attributes". */
export function validateAttributes(value: unknown): string[] {
  if (value === undefined) return [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ['attributes must be an object'];
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) return ['attributes must be left out when the item has none'];
  for (const key of keys) {
    if (!(ATTRIBUTE_NAMES as readonly string[]).includes(key)) return [`attributes.${key} is not an attribute`];
    const entry = record[key];
    if (typeof entry !== 'object' || entry === null) return [`attributes.${key} must be an object`];
    const { value: v, source } = entry as Record<string, unknown>;
    if (source !== 'auto' && source !== 'user') return [`attributes.${key}.source must be one of: auto, user`];
    if (!isAttributeValue(key as AttributeName, v)) {
      return key === 'type'
        ? [`attributes.type must be trimmed, non-empty text of at most ${ITEM_TYPE_MAX_LENGTH} characters`]
        : [`attributes.${key} must be one of: ${ATTRIBUTE_CHOICES[key as ChoiceAttributeName].join(', ')}`];
    }
  }
  return [];
}

/** A copy of `attributes` (undefined stays undefined). */
export function cloneAttributes(attributes: ItemAttributes | undefined): ItemAttributes | undefined {
  if (attributes === undefined) return undefined;
  const copy: Record<string, AttributeValue<string>> = {};
  for (const name of ATTRIBUTE_NAMES) {
    const entry = attributes[name];
    if (entry) copy[name] = { value: entry.value, source: entry.source };
  }
  return copy as ItemAttributes;
}

/** True if both have the same attributes with the same values and sources. */
export function sameAttributes(a: ItemAttributes | undefined, b: ItemAttributes | undefined): boolean {
  return ATTRIBUTE_NAMES.every((name) => {
    const x = a?.[name];
    const y = b?.[name];
    return x === undefined || y === undefined ? x === y : x.value === y.value && x.source === y.source;
  });
}

// ---------------------------------------------------------------------------
// Form state

/**
 * One attribute in the form. `value` null means empty. `source` 'user' means
 * the user touched it (set, changed, or cleared it); suggestions leave it
 * alone. An empty 'auto' field is untouched and can still be suggested.
 * The type is kept as typed and normalized on save.
 */
export interface AttributeField<V> {
  value: V | null;
  source: ColorSource;
}

export type AttributeFields = { [K in AttributeName]: AttributeField<AttributeValueMap[K]> };

const EMPTY_FIELD = Object.freeze({ value: null, source: 'auto' as const });

export const EMPTY_ATTRIBUTE_FIELDS: Readonly<AttributeFields> = Object.freeze({
  type: EMPTY_FIELD,
  pattern: EMPTY_FIELD,
  material: EMPTY_FIELD,
  fit: EMPTY_FIELD,
  formality: EMPTY_FIELD,
});

/** The form fields for a stored item's attributes (missing ones are empty and untouched). */
export function attributesToFields(attributes: ItemAttributes | undefined): AttributeFields {
  const fields = { ...EMPTY_ATTRIBUTE_FIELDS } as Record<AttributeName, AttributeField<string>>;
  for (const name of ATTRIBUTE_NAMES) {
    const entry = attributes?.[name];
    fields[name] = entry ? { value: entry.value, source: entry.source } : { value: null, source: 'auto' };
  }
  return fields as AttributeFields;
}

/**
 * The attributes to store for the form's fields: the type normalized, empty
 * fields left out, or undefined when none has a value. A too-long type is
 * kept so validation rejects it.
 */
export function fieldsToAttributes(fields: AttributeFields): ItemAttributes | undefined {
  const result: Record<string, AttributeValue<string>> = {};
  for (const name of ATTRIBUTE_NAMES) {
    const field = fields[name] as AttributeField<string>;
    const value = name === 'type' && field.value !== null ? normalizeItemType(field.value) : field.value;
    if (value !== null) result[name] = { value, source: field.source };
  }
  return Object.keys(result).length > 0 ? (result as ItemAttributes) : undefined;
}

/** The user sets attribute `name` to `value` (null clears it). It becomes 'user'. */
export function setAttribute<K extends AttributeName>(
  fields: AttributeFields,
  name: K,
  value: AttributeValueMap[K] | null,
): AttributeFields {
  return { ...fields, [name]: { value, source: 'user' } };
}

/** A tap on a choice: picks `value`, or clears it when it is already picked. Either way it becomes 'user'. */
export function toggleAttribute<K extends ChoiceAttributeName>(
  fields: AttributeFields,
  name: K,
  value: AttributeValueMap[K],
): AttributeFields {
  return setAttribute(fields, name, fields[name].value === value ? null : value);
}

/** Suggested values from a photo. A missing or null entry means "no suggestion". */
export type AttributeSuggestions = { [K in AttributeName]?: AttributeValueMap[K] | null };

/**
 * Keeps only suggestions that are valid values (out-of-vocabulary ones are
 * dropped; a type is normalized first, and dropped when empty or too long).
 */
export function cleanAttributeSuggestions(raw: Partial<Record<AttributeName, unknown>>): AttributeSuggestions {
  const result: Record<string, string> = {};
  for (const name of ATTRIBUTE_NAMES) {
    let value = raw[name];
    if (name === 'type' && typeof value === 'string') value = normalizeItemType(value);
    if (isAttributeValue(name, value)) result[name] = value;
  }
  return result as AttributeSuggestions;
}

/**
 * Applies suggestions for the current front photo: every field the user has
 * not touched takes the suggestion as 'auto' (or becomes empty when there is
 * none). Fields the user touched are never changed. Suggestions are cleaned
 * first (`cleanAttributeSuggestions`).
 */
export function applyAttributeSuggestions(
  fields: AttributeFields,
  suggestions: Partial<Record<AttributeName, unknown>>,
): AttributeFields {
  const clean = cleanAttributeSuggestions(suggestions);
  const next = { ...fields } as Record<AttributeName, AttributeField<string>>;
  for (const name of ATTRIBUTE_NAMES) {
    if (fields[name].source === 'user') continue;
    next[name] = { value: clean[name] ?? null, source: 'auto' };
  }
  return next as AttributeFields;
}

/**
 * The front photo the suggestions came from is gone (retaken): untouched
 * values described it, so they are cleared. Fields the user touched stay.
 */
export function clearSuggestedAttributes(fields: AttributeFields): AttributeFields {
  return applyAttributeSuggestions(fields, {});
}

/** True if any field holds a suggested value. */
export function hasSuggestedAttributes(fields: AttributeFields): boolean {
  return ATTRIBUTE_NAMES.some((name) => fields[name].source === 'auto' && fields[name].value !== null);
}

/** Display text of every attribute with a value, in display order ("Hoodie", "Striped", ...). */
export function describeAttributes(attributes: ItemAttributes | undefined): { name: AttributeName; label: string; text: string }[] {
  return ATTRIBUTE_NAMES.flatMap((name) => {
    const entry = attributes?.[name];
    if (!entry) return [];
    const text = name === 'type' ? entry.value : attributeValueLabel(entry.value);
    return [{ name, label: ATTRIBUTE_LABELS[name], text }];
  });
}

/** Formality labels short enough for a four-way segmented control (the full label is read aloud). */
export const FORMALITY_SHORT_LABELS: Readonly<Record<Formality, string>> = Object.freeze({
  athletic: 'Athletic',
  casual: 'Casual',
  'smart-casual': 'Smart',
  formal: 'Formal',
});

/** What a form field shows: its value's label (null when empty), whether it was suggested, and what is read aloud. */
export function describeAttributeField(
  name: AttributeName,
  field: AttributeField<string>,
): { text: string | null; suggested: boolean; accessibilityLabel: string } {
  const text = field.value === null ? null : name === 'type' ? field.value : attributeValueLabel(field.value);
  const suggested = text !== null && field.source === 'auto';
  const label = ATTRIBUTE_LABELS[name];
  return {
    text,
    suggested,
    accessibilityLabel: text === null ? `${label}, not set` : `${label}, ${text}${suggested ? ', suggested' : ''}`,
  };
}
