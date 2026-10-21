import { isSafeFileName, MemoryStoredPhotoFiles } from './stored-photo-files';

describe('isSafeFileName', () => {
  it('accepts plain stored photo names and their temporary copies', () => {
    for (const name of ['item-1-abc.jpg', 'a_b.jpg', 'item-1-abc.jpg.stripping', 'x']) {
      expect(isSafeFileName(name)).toBe(true);
    }
  });

  it('rejects paths, traversal, hidden files, and odd characters', () => {
    for (const name of ['', '.', '..', '../spotlight.db', 'a/b.jpg', 'a\\b.jpg', '.hidden', 'a..b', 'a b.jpg', 'a%2fb', 'file:///x']) {
      expect(isSafeFileName(name)).toBe(false);
    }
  });
});

describe('MemoryStoredPhotoFiles', () => {
  it('replace deletes the destination first, like expo-file-system', async () => {
    const files = new MemoryStoredPhotoFiles({ 'a.jpg': new Uint8Array([1]), 'a.jpg.tmp': new Uint8Array([2]) });
    files.crashInsideReplace = () => true;
    await expect(files.replace('a.jpg.tmp', 'a.jpg')).rejects.toThrow('crashed');
    expect([...files.files.keys()]).toEqual(['a.jpg.tmp']);
    files.crashInsideReplace = null;
    await files.replace('a.jpg.tmp', 'a.jpg');
    expect([...files.files.entries()]).toEqual([['a.jpg', new Uint8Array([2])]]);
  });

  it('in copy mode, replace deletes the destination, copies, then deletes the source, with a crash point at each step', async () => {
    const source = new Uint8Array([1, 2, 3, 4]);
    const states: [string, string[]][] = [];
    for (const stage of ['destination-deleted', 'half-copied', 'copied'] as const) {
      const files = new MemoryStoredPhotoFiles({ 'a.jpg': new Uint8Array([9]), 'a.jpg.tmp': source });
      files.moveModel = 'copy';
      files.crashInsideReplace = (at) => at === stage;
      await expect(files.replace('a.jpg.tmp', 'a.jpg')).rejects.toThrow(stage);
      states.push([stage, [...files.files.entries()].map(([k, v]) => `${k}=${[...v].join(',')}`)]);
    }
    expect(states).toEqual([
      ['destination-deleted', ['a.jpg.tmp=1,2,3,4']],
      ['half-copied', ['a.jpg.tmp=1,2,3,4', 'a.jpg=1,2']],
      ['copied', ['a.jpg.tmp=1,2,3,4', 'a.jpg=1,2,3,4']],
    ]);
    const files = new MemoryStoredPhotoFiles({ 'a.jpg.tmp': source });
    files.moveModel = 'copy';
    await files.replace('a.jpg.tmp', 'a.jpg');
    expect([...files.files.entries()]).toEqual([['a.jpg', source]]);
  });

  it('refuses unsafe names', async () => {
    const files = new MemoryStoredPhotoFiles();
    await expect(files.read('../spotlight.db')).rejects.toThrow(/unsafe/);
    await expect(files.replace('a.jpg', '../b.jpg')).rejects.toThrow(/unsafe/);
  });
});
