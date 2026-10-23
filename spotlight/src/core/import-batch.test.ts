import { describeImportSelection, IMPORT_PHOTO_LIMIT, selectImportPhotos } from './import-batch';

const photo = (n: number, assetId: string | null = `asset-${n}`) => ({ uri: `file:///cache/p${n}.jpg`, assetId });
const many = (count: number) => Array.from({ length: count }, (_, i) => photo(i + 1));

describe('selectImportPhotos', () => {
  it('caps an import at 20 photos (D10)', () => {
    expect(IMPORT_PHOTO_LIMIT).toBe(20);
  });

  it('keeps every photo up to the limit, in the order returned', () => {
    const picked = many(20);
    const selection = selectImportPhotos(picked);
    expect(selection.kept).toEqual(picked);
    expect(selection.overLimit).toEqual([]);
    expect(describeImportSelection(selection)).toEqual([]);
  });

  it('keeps the first 20 and leaves the rest out when a picker ignores the limit', () => {
    const picked = many(23);
    const selection = selectImportPhotos(picked);
    expect(selection.kept).toEqual(picked.slice(0, 20));
    expect(selection.overLimit).toEqual(picked.slice(20));
    expect(describeImportSelection(selection)).toEqual([
      'One import takes up to 20 photos. The first 20 are here; the other 3 were left out. Import them next.',
    ]);
  });

  it('uses the singular for one photo over the limit', () => {
    expect(describeImportSelection(selectImportPhotos(many(21)))[0]).toContain('the last one was left out. Import it next.');
  });

  it('does not reorder photos (Android may return them in its own order)', () => {
    const picked = [photo(3), photo(1), photo(2)];
    expect(selectImportPhotos(picked).kept).toEqual(picked);
  });

  it('adds a photo chosen twice once, by library id, without counting it towards the limit', () => {
    const picked = [...many(20), photo(5)];
    const selection = selectImportPhotos(picked);
    expect(selection.kept).toEqual(many(20));
    expect(selection.duplicates).toEqual([photo(5)]);
    expect(selection.overLimit).toEqual([]);
    expect(describeImportSelection(selection)).toEqual(['1 photo chosen twice was added once.']);
  });

  it('never treats photos without a library id as duplicates', () => {
    const picked = [photo(1, null), photo(2, null)];
    expect(selectImportPhotos(picked).kept).toEqual(picked);
  });

  it('leaves out photos that came back without a file', () => {
    const selection = selectImportPhotos([photo(1), { uri: '', assetId: 'x' }]);
    expect(selection.kept).toEqual([photo(1)]);
    expect(describeImportSelection(selection)).toEqual(['1 photo could not be read and was left out.']);
  });

  it('honours a custom limit and reports every reason', () => {
    const selection = selectImportPhotos([photo(1), photo(1), photo(2), photo(3), { uri: '' }, { uri: '' }], 2);
    expect(selection.kept).toEqual([photo(1), photo(2)]);
    expect(describeImportSelection(selection, 2)).toEqual([
      'One import takes up to 2 photos. The first 2 are here; the last one was left out. Import it next.',
      '1 photo chosen twice was added once.',
      '2 photos could not be read and were left out.',
    ]);
  });
});
