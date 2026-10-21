/**
 * Tests ExpoTemporaryFiles against a fake expo-file-system (the native module
 * is not available in Jest). jest.mock is hoisted above the import by babel-jest.
 */
import { ExpoTemporaryFiles } from './expo-temporary-files';

const mockFs = { files: new Set<string>(), deleted: [] as string[] };

jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return mockFs.files.has(this.uri);
    }
    delete() {
      mockFs.deleted.push(this.uri);
      mockFs.files.delete(this.uri);
    }
  }
  return { File, Paths: { cache: { uri: 'file:///app/Library/Caches/' } } };
});

beforeEach(() => {
  mockFs.files = new Set();
  mockFs.deleted = [];
});

describe('ExpoTemporaryFiles', () => {
  it('deletes a picker or manipulator file in the cache directory', async () => {
    const picked = 'file:///app/Library/Caches/ImagePicker/ABC.jpeg';
    const processed = 'file:///app/Library/Caches/ImageManipulator/out.jpg';
    mockFs.files.add(picked);
    mockFs.files.add(processed);
    const files = new ExpoTemporaryFiles();
    await files.discard(picked);
    await files.discard(processed);
    expect(mockFs.deleted).toEqual([picked, processed]);
  });

  it('is a no-op for a file that is already gone', async () => {
    await new ExpoTemporaryFiles().discard('file:///app/Library/Caches/ImagePicker/gone.jpeg');
    expect(mockFs.deleted).toEqual([]);
  });

  it('never deletes outside the cache: library originals, app documents, traversal', async () => {
    const outside = [
      'ph://ABC-123/L0/001',
      'content://media/external/images/media/42',
      'file:///app/Documents/closet-images/x.jpg',
      'file:///app/Documents/spotlight.db',
      'file:///app/Library/Caches/../../Documents/spotlight.db',
      'file:///app/Library/Caches/..%2F..%2FDocuments%2Fspotlight.db',
      'file:///app/Library/Caches/%2e%2e/%2e%2e/Documents/spotlight.db',
      'file:///app/Library/Caches/%2E%2E%2f%2E%2E%2fDocuments/spotlight.db',
      'file:///app/Library/Caches/ImagePicker/%252e%252e/x.jpg',
      'file:///var/mobile/Media/DCIM/100APPLE/IMG_0001.HEIC',
    ];
    for (const uri of outside) mockFs.files.add(uri);
    const files = new ExpoTemporaryFiles();
    for (const uri of outside) await files.discard(uri);
    expect(mockFs.deleted).toEqual([]);
  });
});
