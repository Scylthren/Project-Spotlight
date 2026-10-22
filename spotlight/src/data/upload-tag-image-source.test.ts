import { TAG_ITEM_MAX_IMAGE_BASE64_LENGTH, validateTagItemRequest } from '@/ai/tag-item-contract';
import {
  exifSegment,
  TINY_JPEG,
  withSegmentsAfterSoi,
  xmpSegment,
} from '@/core/testing/jpeg-fixtures';
import { findJpegMetadata, isMetadataFree } from '@/core';

import { FakeImageProcessor } from './image-processor';
import { TAG_IMAGE_MAX_EDGE, UploadTagImageSource } from './upload-tag-image-source';

function decode(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

describe('UploadTagImageSource', () => {
  it('asks for a 1024 px long edge and sends exactly the processed bytes as a valid request', async () => {
    const processor = new FakeImageProcessor();
    processor.uploadBytes = TINY_JPEG;
    const image = await new UploadTagImageSource(processor).read('file:///cache/ImagePicker/a.jpg');
    expect(TAG_IMAGE_MAX_EDGE).toBe(1024);
    expect(processor.uploads).toEqual([{ sourceUri: 'file:///cache/ImagePicker/a.jpg', maxEdge: 1024 }]);
    expect(image.contentType).toBe('image/jpeg');
    expect(decode(image.base64)).toEqual(TINY_JPEG);
    expect(validateTagItemRequest({ imageBase64: image.base64, contentType: image.contentType }).ok).toBe(true);
  });

  it('the fake processor\'s default bytes are a metadata-free JPEG', async () => {
    const image = await new UploadTagImageSource(new FakeImageProcessor()).read('x');
    expect(isMetadataFree(findJpegMetadata(decode(image.base64)))).toBe(true);
  });

  it.each([
    ['Exif with GPS', withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order: 'II', gps: true, orientation: 1 }))],
    ['Exif without GPS', withSegmentsAfterSoi(TINY_JPEG, exifSegment({ order: 'MM', orientation: 1 }))],
    ['XMP', withSegmentsAfterSoi(TINY_JPEG, xmpSegment(true))],
  ])('refuses to send bytes that still carry %s (fails closed)', async (_name, bytes) => {
    const processor = new FakeImageProcessor();
    processor.uploadBytes = bytes;
    await expect(new UploadTagImageSource(processor).read('x')).rejects.toThrow(/metadata/);
  });

  it('refuses bytes that are not a JPEG', async () => {
    const processor = new FakeImageProcessor();
    processor.uploadBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    await expect(new UploadTagImageSource(processor).read('x')).rejects.toThrow();
  });

  it('refuses an image over the contract limit instead of sending it', async () => {
    const processor = new FakeImageProcessor();
    const big = new Uint8Array(Math.ceil((TAG_ITEM_MAX_IMAGE_BASE64_LENGTH / 4) * 3) + 3);
    big.set(TINY_JPEG.subarray(0, TINY_JPEG.length - 2));
    // A long run of scan data before EOI keeps it a valid, metadata-free JPEG.
    big[big.length - 2] = 0xff;
    big[big.length - 1] = 0xd9;
    processor.uploadBytes = big;
    await expect(new UploadTagImageSource(processor).read('x')).rejects.toThrow(/too large/);
  });

  it('passes on a processing failure (the form shows no suggestion)', async () => {
    const processor = new FakeImageProcessor();
    processor.failNextUpload = new Error('cannot decode image');
    await expect(new UploadTagImageSource(processor).read('x')).rejects.toThrow('cannot decode image');
  });
});
