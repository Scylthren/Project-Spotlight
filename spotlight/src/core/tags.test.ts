import {
  addTag,
  canonicalTagText,
  compareTagNames,
  describeTagDeletion,
  filterTags,
  isNormalizedTag,
  MAX_TAGS_PER_ITEM,
  normalizeTag,
  removeTag,
  sameTagSet,
  TAG_MAX_LENGTH,
  TAG_MESSAGES,
  toggleTag,
} from '@/core';

describe('normalizeTag', () => {
  it('trims, collapses inner whitespace (tabs, newlines), and lowercases', () => {
    expect(normalizeTag('  90s ')).toEqual({ ok: true, tag: '90s' });
    expect(normalizeTag('Office\t  Casual\nWear')).toEqual({ ok: true, tag: 'office casual wear' });
    expect(normalizeTag('EMO')).toEqual({ ok: true, tag: 'emo' });
  });

  it('rejects empty and whitespace-only input', () => {
    expect(normalizeTag('')).toEqual({ ok: false, problem: 'empty' });
    expect(normalizeTag(' \t\n ')).toEqual({ ok: false, problem: 'empty' });
    expect(normalizeTag(undefined as never)).toEqual({ ok: false, problem: 'empty' });
  });

  it(`allows ${TAG_MAX_LENGTH} characters after normalization and rejects more`, () => {
    const max = 'a'.repeat(TAG_MAX_LENGTH);
    expect(normalizeTag(`   ${max}   `)).toEqual({ ok: true, tag: max });
    expect(normalizeTag(`${max}b`)).toEqual({ ok: false, problem: 'too_long' });
    // Collapsing happens before the length check.
    expect(normalizeTag(`${'a'.repeat(15)}      ${'b'.repeat(14)}`).ok).toBe(true);
  });

  it('counts characters, not UTF-16 units, so emoji-heavy tags are not cut short', () => {
    const astral = '\u{1F3B8}'.repeat(TAG_MAX_LENGTH);
    expect(astral.length).toBe(TAG_MAX_LENGTH * 2);
    expect(normalizeTag(astral).ok).toBe(true);
  });

  it('isNormalizedTag accepts only the normalized form', () => {
    expect(isNormalizedTag('90s')).toBe(true);
    expect(isNormalizedTag('work wear')).toBe(true);
    for (const bad of ['90S', ' 90s', 'work  wear', '', 'a'.repeat(TAG_MAX_LENGTH + 1), 42, null]) {
      expect(isNormalizedTag(bad)).toBe(false);
    }
  });
});

describe('addTag / removeTag / toggleTag', () => {
  it('adds a normalized tag at the end without mutating the input', () => {
    const start = ['emo'];
    expect(addTag(start, ' 90S ')).toEqual({ ok: true, tags: ['emo', '90s'] });
    expect(start).toEqual(['emo']);
  });

  it('treats a differently cased or spaced duplicate as already there', () => {
    expect(addTag(['office casual'], 'Office   CASUAL')).toEqual({ ok: true, tags: ['office casual'] });
  });

  it('reports why a tag cannot be added', () => {
    expect(addTag([], '  ')).toEqual({ ok: false, problem: 'empty' });
    expect(addTag([], 'x'.repeat(TAG_MAX_LENGTH + 1))).toEqual({ ok: false, problem: 'too_long' });
    const full = Array.from({ length: MAX_TAGS_PER_ITEM }, (_, i) => `t${i}`);
    expect(addTag(full, 'one more')).toEqual({ ok: false, problem: 'too_many' });
    // Re-adding an existing tag to a full list is still fine.
    expect(addTag(full, 'T0')).toEqual({ ok: true, tags: full });
  });

  it('removes by normalized name and toggles both ways', () => {
    expect(removeTag(['emo', '90s'], ' EMO ')).toEqual(['90s']);
    expect(toggleTag(['emo'], 'emo')).toEqual({ ok: true, tags: [] });
    expect(toggleTag(['emo'], '90s')).toEqual({ ok: true, tags: ['emo', '90s'] });
    const full = Array.from({ length: MAX_TAGS_PER_ITEM }, (_, i) => `t${i}`);
    expect(toggleTag(full, 'new')).toEqual({ ok: false, problem: 'too_many' });
    expect(toggleTag(full, 't3')).toEqual({ ok: true, tags: full.filter((t) => t !== 't3') });
  });

  it('has a user-facing message for every problem', () => {
    expect(TAG_MESSAGES.too_many).toContain(String(MAX_TAGS_PER_ITEM));
    expect(TAG_MESSAGES.too_long).toContain(String(TAG_MAX_LENGTH));
    expect(TAG_MESSAGES.empty).toBeTruthy();
  });
});

describe('filterTags', () => {
  const saved = [
    { name: '90s', itemCount: 2 },
    { name: 'emo', itemCount: 0 },
    { name: 'office casual', itemCount: 1 },
  ];

  it('returns everything for an empty or blank query', () => {
    expect(filterTags(saved, '')).toEqual(saved);
    expect(filterTags(saved, '   ')).toEqual(saved);
  });

  it('matches normalized substrings and keeps order', () => {
    expect(filterTags(saved, 'O')).toEqual([saved[1], saved[2]]);
    expect(filterTags(saved, 'office   CAS')).toEqual([saved[2]]);
    expect(filterTags(saved, 'zzz')).toEqual([]);
    expect(filterTags(['90s', 'emo'], '9')).toEqual(['90s']);
  });
});

describe('helpers', () => {
  it('sameTagSet ignores order', () => {
    expect(sameTagSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameTagSet([], [])).toBe(true);
    expect(sameTagSet(['a'], ['a', 'b'])).toBe(false);
    expect(sameTagSet(['a', 'b'], ['a', 'c'])).toBe(false);
  });

  it('compareTagNames sorts by code unit', () => {
    expect(['emo', '90s', 'y2k', 'boho'].sort(compareTagNames)).toEqual(['90s', 'boho', 'emo', 'y2k']);
    expect(compareTagNames('a', 'a')).toBe(0);
  });

  it('canonicalTagText is the shared normalization', () => {
    expect(canonicalTagText('  A  b ')).toBe('a b');
  });

  it('describeTagDeletion says how many items lose the tag', () => {
    expect(describeTagDeletion({ name: 'x', itemCount: 0 })).toMatch(/^No items use it\./);
    expect(describeTagDeletion({ name: 'x', itemCount: 1 })).toMatch(/removed from 1 item\./);
    expect(describeTagDeletion({ name: 'x', itemCount: 3 })).toMatch(/removed from 3 items\./);
  });
});
