import { PickedPhotoSlot } from './picked-photo-slot';
import { discardQuietly, isInsideDirectory, RecordingTemporaryFiles } from './temporary-files';

const CACHE = 'file:///data/user/0/app/cache';

describe('isInsideDirectory', () => {
  it('accepts files under the directory, with or without a trailing slash on the base', () => {
    expect(isInsideDirectory(`${CACHE}/ImagePicker/A.jpeg`, CACHE)).toBe(true);
    expect(isInsideDirectory(`${CACHE}/ImageManipulator/b.jpg`, `${CACHE}/`)).toBe(true);
  });

  it('rejects the user library, app documents, other schemes, and look-alike prefixes', () => {
    for (const uri of [
      'ph://ABC-123/L0/001',
      'content://media/external/images/media/42',
      'file:///storage/emulated/0/DCIM/Camera/IMG_1.jpg',
      'file:///data/user/0/app/files/closet-images/x.jpg',
      'file:///data/user/0/app/cache-other/x.jpg',
      `${CACHE}`,
      `${CACHE}/`,
    ]) {
      expect(isInsideDirectory(uri, CACHE)).toBe(false);
    }
  });

  it('rejects paths that try to climb out', () => {
    expect(isInsideDirectory(`${CACHE}/../files/spotlight.db`, CACHE)).toBe(false);
    expect(isInsideDirectory(`${CACHE}/ImagePicker/../../files/x`, CACHE)).toBe(false);
    expect(isInsideDirectory(`${CACHE}/./x.jpg`, CACHE)).toBe(false);
    expect(isInsideDirectory(`${CACHE}//x.jpg`, CACHE)).toBe(false);
    expect(isInsideDirectory(`${CACHE}/..%2Ffiles%2Fx`, CACHE)).toBe(false);
    expect(isInsideDirectory(`${CACHE}/a\\..\\x`, CACHE)).toBe(false);
  });

  it('rejects any percent-encoding, since it could decode to a traversal', () => {
    for (const rest of ['%2e%2e/files/x', '%2E%2E%2Ffiles', '.%2e/x', 'ImagePicker/%252e%252e/x', 'a%20b.jpg']) {
      expect(isInsideDirectory(`${CACHE}/${rest}`, CACHE)).toBe(false);
    }
  });
});

describe('discardQuietly', () => {
  it('discards, skips empty values, and never rejects', async () => {
    const files = new RecordingTemporaryFiles();
    await discardQuietly(files, 'file:///cache/a.jpg');
    await discardQuietly(files, null);
    await discardQuietly(files, undefined);
    await discardQuietly(files, '');
    expect(files.discarded).toEqual(['file:///cache/a.jpg']);

    const onError = jest.fn();
    const error = new Error('EACCES');
    files.failNext = error;
    await expect(discardQuietly(files, 'file:///cache/b.jpg', onError)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(error, 'file:///cache/b.jpg');

    files.failNext = new Error('again');
    const throwingReporter = () => {
      throw new Error('reporter broke');
    };
    await expect(discardQuietly(files, 'file:///cache/c.jpg', throwingReporter)).resolves.toBeUndefined();
  });
});

describe('PickedPhotoSlot', () => {
  const photo = (uri: string) => ({ uri, width: 10, height: 10 });

  it('discards the previous pick when a new one replaces it', async () => {
    const files = new RecordingTemporaryFiles();
    const slot = new PickedPhotoSlot(files);
    await slot.replace(photo('file:///cache/1.jpg'));
    expect(files.discarded).toEqual([]);
    await slot.replace(photo('file:///cache/2.jpg'));
    expect(files.discarded).toEqual(['file:///cache/1.jpg']);
    expect(slot.current?.uri).toBe('file:///cache/2.jpg');
  });

  it('does not discard when the same file is picked again', async () => {
    const files = new RecordingTemporaryFiles();
    const slot = new PickedPhotoSlot(files);
    await slot.replace(photo('file:///cache/1.jpg'));
    await slot.replace(photo('file:///cache/1.jpg'));
    expect(files.discarded).toEqual([]);
  });

  it('clear discards the held pick once and holds nothing', async () => {
    const files = new RecordingTemporaryFiles();
    const slot = new PickedPhotoSlot(files);
    await slot.clear();
    await slot.replace(photo('file:///cache/1.jpg'));
    await slot.clear();
    await slot.clear();
    expect(files.discarded).toEqual(['file:///cache/1.jpg']);
    expect(slot.current).toBeNull();
  });

  it('never throws when deleting fails', async () => {
    const files = new RecordingTemporaryFiles();
    const onError = jest.fn();
    const slot = new PickedPhotoSlot(files, onError);
    await slot.replace(photo('file:///cache/1.jpg'));
    files.failNext = new Error('EBUSY');
    await expect(slot.replace(photo('file:///cache/2.jpg'))).resolves.toBeUndefined();
    files.failNext = new Error('EBUSY');
    await expect(slot.clear()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
