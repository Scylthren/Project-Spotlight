/**
 * Tests ExpoStoredPhotoFiles against a fake expo-file-system (the native
 * module is not available in Jest). Checks the paths it touches and that it
 * passes `overwrite: true` only to the swap. jest.mock is hoisted by babel-jest.
 */
import { ExpoStoredPhotoFiles } from './expo-stored-photo-files';

const mockFs = {
  files: new Map<string, Uint8Array>(),
  dirs: new Set<string>(),
  moveCalls: [] as { from: string; to: string; options: unknown }[],
};

jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts
      .map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri))
      .reduce((a, b) => `${a.replace(/\/$/, '')}/${b.replace(/^\//, '')}`);
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFs.dirs.has(this.uri);
    }
    list() {
      const prefix = `${this.uri}/`;
      const children: unknown[] = [];
      for (const uri of mockFs.files.keys()) {
        if (uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/')) children.push(new File(uri));
      }
      for (const uri of mockFs.dirs) {
        if (uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/')) children.push(new Directory(uri));
      }
      return children;
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get exists() {
      return mockFs.files.has(this.uri);
    }
    create() {
      if (mockFs.files.has(this.uri)) throw new Error('already exists');
      mockFs.files.set(this.uri, new Uint8Array(0));
    }
    async bytes() {
      const data = mockFs.files.get(this.uri);
      if (!data) throw new Error(`ENOENT ${this.uri}`);
      return data.slice();
    }
    write(content: Uint8Array) {
      if (!mockFs.files.has(this.uri)) throw new Error(`ENOENT ${this.uri}`);
      mockFs.files.set(this.uri, content.slice());
    }
    async move(destination: File, options: { overwrite?: boolean }) {
      mockFs.moveCalls.push({ from: this.uri, to: destination.uri, options });
      if (mockFs.files.has(destination.uri) && !options?.overwrite) throw new Error('destination exists');
      mockFs.files.set(destination.uri, mockFs.files.get(this.uri)!);
      mockFs.files.delete(this.uri);
    }
    delete() {
      mockFs.files.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: new Directory('file:///docs') } };
});

const DIR = 'file:///docs/closet-images';

beforeEach(() => {
  mockFs.files = new Map();
  mockFs.dirs = new Set();
  mockFs.moveCalls = [];
});

describe('ExpoStoredPhotoFiles', () => {
  it('lists only the files directly inside closet-images', async () => {
    expect(await new ExpoStoredPhotoFiles().list()).toEqual([]);
    mockFs.dirs.add(DIR);
    mockFs.dirs.add(`${DIR}/sub`);
    mockFs.files.set(`${DIR}/a.jpg`, new Uint8Array([1]));
    mockFs.files.set(`${DIR}/sub/b.jpg`, new Uint8Array([2]));
    mockFs.files.set('file:///docs/spotlight.db', new Uint8Array([3]));
    expect(await new ExpoStoredPhotoFiles().list()).toEqual(['a.jpg']);
  });

  it('reads, writes (creating the file), swaps with overwrite, and removes inside closet-images', async () => {
    mockFs.dirs.add(DIR);
    mockFs.files.set(`${DIR}/a.jpg`, new Uint8Array([1]));
    const files = new ExpoStoredPhotoFiles();

    await files.write('a.jpg.stripping', new Uint8Array([9]));
    expect(await files.read('a.jpg.stripping')).toEqual(new Uint8Array([9]));
    await files.write('a.jpg.stripping', new Uint8Array([8]));
    expect(await files.exists('a.jpg.stripping')).toBe(true);

    await files.replace('a.jpg.stripping', 'a.jpg');
    expect(mockFs.moveCalls).toEqual([{ from: `${DIR}/a.jpg.stripping`, to: `${DIR}/a.jpg`, options: { overwrite: true } }]);
    expect([...mockFs.files.entries()]).toEqual([[`${DIR}/a.jpg`, new Uint8Array([8])]]);

    await files.remove('a.jpg');
    await files.remove('a.jpg');
    expect(mockFs.files.size).toBe(0);
  });

  it('refuses names that could leave the directory', async () => {
    mockFs.files.set('file:///docs/spotlight.db', new Uint8Array([3]));
    const files = new ExpoStoredPhotoFiles();
    await expect(files.remove('../spotlight.db')).rejects.toThrow(/unsafe/);
    await expect(files.read('../spotlight.db')).rejects.toThrow(/unsafe/);
    await expect(files.replace('a.jpg', '../spotlight.db')).rejects.toThrow(/unsafe/);
    expect(mockFs.files.has('file:///docs/spotlight.db')).toBe(true);
  });
});
