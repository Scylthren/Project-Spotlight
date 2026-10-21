import { extensionFromUri, hasUriScheme, imageRefFor, isStoredRef, randomSuffix } from './image-store';
import { MemoryImageStore } from './memory-image-store';

describe('image store helpers', () => {
  it('extracts a safe lowercase extension, defaulting to .jpg', () => {
    expect(extensionFromUri('file:///a/b/IMG_1.HEIC')).toBe('.heic');
    expect(extensionFromUri('file:///a/b.c/photo.png?x=1#y')).toBe('.png');
    expect(extensionFromUri('file:///a/b.c/photo')).toBe('.jpg');
    expect(extensionFromUri('file:///a/.hidden')).toBe('.jpg');
    expect(extensionFromUri('content://media/external/images/123')).toBe('.jpg');
    expect(extensionFromUri('file:///a/x.toolongext')).toBe('.jpg');
  });

  it('builds relative refs and rejects ids or suffixes that could escape the directory', () => {
    expect(imageRefFor('abc-1', 'file:///x.png', 'r4nd')).toBe('closet-images/abc-1-r4nd.png');
    expect(isStoredRef(imageRefFor('abc-1', 'file:///x.png', 'r4nd'))).toBe(true);
    expect(() => imageRefFor('../evil', 'file:///x.png', 'r')).toThrow(/unsafe/);
    expect(() => imageRefFor('a/b', 'file:///x.png', 'r')).toThrow(/unsafe/);
    expect(() => imageRefFor('', 'file:///x.png', 'r')).toThrow(/unsafe/);
    expect(() => imageRefFor('abc', 'file:///x.png', '../x')).toThrow(/unsafe/);
    expect(() => imageRefFor('abc', 'file:///x.png', '')).toThrow(/unsafe/);
  });

  it('uses an explicit extension over the source name, and rejects unsafe ones', () => {
    expect(imageRefFor('abc', 'file:///IMG_1.HEIC', 'r', '.jpg')).toBe('closet-images/abc-r.jpg');
    expect(imageRefFor('abc', 'file:///x', 'r', '.PNG')).toBe('closet-images/abc-r.png');
    expect(() => imageRefFor('abc', 'file:///x.jpg', 'r', '/../x')).toThrow(/unsafe/);
    expect(() => imageRefFor('abc', 'file:///x.jpg', 'r', 'jpg')).toThrow(/unsafe/);
    expect(() => imageRefFor('abc', 'file:///x.jpg', 'r', '')).toThrow(/unsafe/);
  });

  it('makes a different ref for every suffix, so saves never collide', () => {
    expect(imageRefFor('a', 'file:///x.jpg', 's1')).not.toBe(imageRefFor('a', 'file:///x.jpg', 's2'));
    expect(randomSuffix(() => 0.5)).toBe('i'.repeat(10));
    expect(randomSuffix()).toMatch(/^[a-z0-9]{10}$/);
    expect(new Set(Array.from({ length: 1000 }, () => randomSuffix())).size).toBe(1000);
  });

  it('recognizes URIs and our own refs', () => {
    expect(hasUriScheme('file:///x.jpg')).toBe(true);
    expect(hasUriScheme('https://example.com/x.jpg')).toBe(true);
    expect(hasUriScheme('closet-images/x.jpg')).toBe(false);
    expect(isStoredRef('closet-images/abc-1.jpg')).toBe(true);
    expect(isStoredRef('closet-images/../secret.db')).toBe(false);
    expect(isStoredRef('other/abc.jpg')).toBe(false);
    expect(isStoredRef('file:///closet-images/abc.jpg')).toBe(false);
  });
});

describe('MemoryImageStore', () => {
  it('saves, resolves, and removes', async () => {
    const store = new MemoryImageStore();
    const ref = await store.save('file:///tmp/a.jpg', 'x1');
    expect(ref).toBe('closet-images/x1-m1.jpg');
    expect(store.resolveUri(ref)).toBe('memory://closet-images/x1-m1.jpg');
    expect(store.resolveUri('https://cdn/x.jpg')).toBe('https://cdn/x.jpg');
    await store.remove(ref);
    expect(store.files.size).toBe(0);
    expect(await store.save('file:///tmp/IMG.HEIC', 'x1', '.jpg')).toBe('closet-images/x1-m2.jpg');
  });

  it('gives every save of the same item its own file', async () => {
    const store = new MemoryImageStore();
    const first = await store.save('file:///tmp/a.jpg', 'x1');
    const second = await store.save('file:///tmp/b.jpg', 'x1');
    expect(second).not.toBe(first);
    expect([...store.files]).toEqual([
      [first, 'file:///tmp/a.jpg'],
      [second, 'file:///tmp/b.jpg'],
    ]);
  });
});
