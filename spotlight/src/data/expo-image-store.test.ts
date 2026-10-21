/**
 * Tests ExpoImageStore against a fake expo-file-system (the native module is
 * not available in Jest). Checks which paths it creates, copies, and deletes.
 * jest.mock is hoisted above this import by babel-jest.
 */
import { ExpoImageStore } from './expo-image-store';

const mockFs = {
  files: new Set<string>(),
  dirs: new Set<string>(),
  createCalls: [] as { uri: string; options: unknown }[],
  copyCalls: [] as { from: string; to: string; options: unknown }[],
  failCopy: false,
  deleted: [] as string[],
  /** Runs at the start of File.delete, after the caller's exists check. */
  beforeDelete: null as ((uri: string) => void) | null,
  /** URIs whose delete throws and leaves the file. */
  failDelete: new Set<string>(),
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
    create(options: unknown) {
      mockFs.createCalls.push({ uri: this.uri, options });
      mockFs.dirs.add(this.uri);
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFs.files.has(this.uri);
    }
    async copy(dest: File, options: { overwrite?: boolean } | undefined) {
      mockFs.copyCalls.push({ from: this.uri, to: dest.uri, options });
      if (mockFs.failCopy) throw new Error('copy failed');
      // Mirrors expo-file-system: overwrite defaults to false.
      if (mockFs.files.has(dest.uri) && !options?.overwrite) throw new Error('destination exists');
      mockFs.files.add(dest.uri);
    }
    delete() {
      mockFs.beforeDelete?.(this.uri);
      // Like expo-file-system, deleting a missing file throws.
      if (!mockFs.files.has(this.uri) || mockFs.failDelete.has(this.uri)) throw new Error(`cannot delete ${this.uri}`);
      mockFs.deleted.push(this.uri);
      mockFs.files.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: new Directory('file:///docs') } };
});

beforeEach(() => {
  mockFs.files.clear();
  mockFs.dirs.clear();
  mockFs.createCalls = [];
  mockFs.copyCalls = [];
  mockFs.failCopy = false;
  mockFs.deleted = [];
  mockFs.beforeDelete = null;
  mockFs.failDelete = new Set();
});

describe('ExpoImageStore', () => {
  it('copies from the picker cache into the document directory and returns a relative ref', async () => {
    const store = new ExpoImageStore(() => 'abc123');
    const ref = await store.save('file:///cache/ImagePicker/p.JPG', 'item-9');

    expect(ref).toBe('closet-images/item-9-abc123.jpg');
    expect(mockFs.createCalls).toEqual([
      { uri: 'file:///docs/closet-images', options: { idempotent: true, intermediates: true } },
    ]);
    expect(mockFs.copyCalls).toEqual([
      {
        from: 'file:///cache/ImagePicker/p.JPG',
        to: 'file:///docs/closet-images/item-9-abc123.jpg',
        options: { overwrite: false },
      },
    ]);
    expect(store.resolveUri(ref)).toBe('file:///docs/closet-images/item-9-abc123.jpg');
  });

  it('names the file with an explicit extension when given', async () => {
    const store = new ExpoImageStore(() => 'abc123');
    const ref = await store.save('file:///cache/ImageManipulator/out.HEIC', 'item-9', '.jpg');
    expect(ref).toBe('closet-images/item-9-abc123.jpg');
    expect(mockFs.copyCalls[0].to).toBe('file:///docs/closet-images/item-9-abc123.jpg');
  });

  it('uses a new random file name for each save of the same item', async () => {
    const store = new ExpoImageStore();
    const first = await store.save('file:///cache/a.jpg', 'item-9');
    const second = await store.save('file:///cache/b.jpg', 'item-9');
    expect(first).toMatch(/^closet-images\/item-9-[a-z0-9]{10}\.jpg$/);
    expect(second).not.toBe(first);
    expect(mockFs.files.has(store.resolveUri(first))).toBe(true);
    expect(mockFs.files.has(store.resolveUri(second))).toBe(true);
    expect(mockFs.copyCalls.every((c) => (c.options as { overwrite: boolean }).overwrite === false)).toBe(true);
  });

  it('never overwrites an existing file, even if a suffix repeats', async () => {
    const store = new ExpoImageStore(() => 'same');
    const ref = await store.save('file:///cache/original.jpg', 'item-9');
    await expect(store.save('file:///cache/other.jpg', 'item-9')).rejects.toThrow(/refusing to overwrite/);
    expect(mockFs.copyCalls).toHaveLength(1);
    expect(mockFs.files.has(store.resolveUri(ref))).toBe(true);
  });

  it('propagates copy failures', async () => {
    mockFs.failCopy = true;
    await expect(new ExpoImageStore().save('file:///cache/p.jpg', 'a')).rejects.toThrow('copy failed');
  });

  it('removes only its own refs', async () => {
    const store = new ExpoImageStore(() => 'r1');
    const ref = await store.save('file:///cache/p.jpg', 'a');
    mockFs.files.add('file:///docs/spotlight.db');
    await store.remove('closet-images/../spotlight.db');
    await store.remove('file:///docs/spotlight.db');
    expect(mockFs.files.has('file:///docs/spotlight.db')).toBe(true);
    await store.remove(ref);
    expect(mockFs.files.has('file:///docs/closet-images/a-r1.jpg')).toBe(false);
    await expect(store.remove(ref)).resolves.toBeUndefined();
  });

  it('deletes the cleanup copy before the photo, so a racing cleanup swap cannot bring it back', async () => {
    const store = new ExpoImageStore(() => 'r1');
    const ref = await store.save('file:///cache/p.jpg', 'a');
    const photo = 'file:///docs/closet-images/a-r1.jpg';
    mockFs.files.add(`${photo}.stripping`);
    mockFs.deleted = [];
    await store.remove(ref);
    expect(mockFs.deleted).toEqual([`${photo}.stripping`, photo]);
    expect(mockFs.files.size).toBe(0);
  });

  it('still deletes the photo when the cleanup move finishes between the copy\'s exists check and its delete', async () => {
    const store = new ExpoImageStore(() => 'r1');
    const ref = await store.save('file:///cache/p.jpg', 'a');
    const photo = 'file:///docs/closet-images/a-r1.jpg';
    mockFs.files.add(`${photo}.stripping`);
    // The native rename completes in the gap: the copy becomes the photo.
    mockFs.beforeDelete = (uri) => {
      if (uri !== `${photo}.stripping`) return;
      mockFs.beforeDelete = null;
      mockFs.files.delete(uri);
      mockFs.files.add(photo);
    };
    await expect(store.remove(ref)).resolves.toBeUndefined();
    expect(mockFs.files.size).toBe(0);
    expect(mockFs.deleted).toEqual([photo]);
  });

  it('deletes the photo even if the cleanup copy cannot be deleted, then reports the error', async () => {
    const store = new ExpoImageStore(() => 'r1');
    const ref = await store.save('file:///cache/p.jpg', 'a');
    const photo = 'file:///docs/closet-images/a-r1.jpg';
    mockFs.files.add(`${photo}.stripping`);
    mockFs.failDelete.add(`${photo}.stripping`);
    await expect(store.remove(ref)).rejects.toThrow(/cannot delete/);
    expect(mockFs.files.has(photo)).toBe(false);
    expect(mockFs.files.has(`${photo}.stripping`)).toBe(true);
  });

  it('passes absolute URIs through resolveUri unchanged', () => {
    expect(new ExpoImageStore().resolveUri('https://cdn/x.jpg')).toBe('https://cdn/x.jpg');
  });
});
