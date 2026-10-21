import { garmentPhoto, inBox, rgb } from '@/core/testing/synthetic-images';

import { COLOR_DETECTION_TIMEOUT_MS, detectItemColors, FrontPhotoColorDetection } from './detect-item-colors';
import { FakeGarmentIsolator, NoGarmentIsolator, type GarmentIsolation } from './garment-isolator';

/** A clean isolation of a navy shirt with the given confidence. */
function navyShirt(confidence = 1): GarmentIsolation {
  const image = garmentPhoto(() => rgb('#202A60'), () => rgb('#F4F4F2'));
  const mask = new Uint8Array(image.width * image.height);
  for (let i = 0; i < mask.length; i++) mask[i] = inBox(i % image.width, Math.floor(i / image.width)) ? 1 : 0;
  return { ok: true, garment: { image, mask, confidence } };
}

/** A promise the test resolves by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('detectItemColors', () => {
  it('returns the measured colors of the isolated garment', async () => {
    const isolator = new FakeGarmentIsolator();
    isolator.queue.push(navyShirt(0.9));
    const detected = await detectItemColors('file:///cache/front.jpg', isolator);
    expect(isolator.inputs).toEqual(['file:///cache/front.jpg']);
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({ paletteId: 'navy', hex: '#202A60' });
    expect(detected[0].confidence).toBeCloseTo(0.9);
  });

  it('gives no detection with the mock isolator', async () => {
    expect(await detectItemColors('file:///a.jpg', new NoGarmentIsolator())).toEqual([]);
  });

  it('swallows a rejection and reports it', async () => {
    const isolator = new FakeGarmentIsolator();
    isolator.queue.push(new Error('decode failed'));
    const onError = jest.fn(() => {
      throw new Error('reporter broke too');
    });
    expect(await detectItemColors('file:///a.jpg', isolator, { onError })).toEqual([]);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'decode failed' }));
  });

  it('gives no detection when the mask has too few pixels', async () => {
    const shirt = navyShirt();
    if (!shirt.ok) throw new Error('fixture');
    const isolator = new FakeGarmentIsolator();
    isolator.queue.push({ ok: true, garment: { ...shirt.garment, mask: new Uint8Array(shirt.garment.mask.length) } });
    expect(await detectItemColors('file:///a.jpg', isolator)).toEqual([]);
  });

  it('gives up after the timeout', async () => {
    jest.useFakeTimers();
    try {
      const slow = deferred<GarmentIsolation>();
      const isolator = new FakeGarmentIsolator();
      isolator.queue.push(() => slow.promise);
      const onError = jest.fn();
      const result = detectItemColors('file:///a.jpg', isolator, { onError });
      jest.advanceTimersByTime(COLOR_DETECTION_TIMEOUT_MS);
      expect(await result).toEqual([]);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('timed out') }));
      slow.resolve(navyShirt()); // a late result goes nowhere
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('FrontPhotoColorDetection', () => {
  it('returns the result for the latest front photo', async () => {
    const isolator = new FakeGarmentIsolator();
    isolator.queue.push(navyShirt());
    const detection = new FrontPhotoColorDetection(isolator);
    const running = detection.run('draft-1', 'file:///a.jpg');
    expect(detection.pending).toBe('draft-1');
    expect((await running)?.[0].paletteId).toBe('navy');
    expect(detection.pending).toBeNull();
  });

  it('drops a result superseded by a retake, even if it finishes last', async () => {
    const first = deferred<GarmentIsolation>();
    const isolator = new FakeGarmentIsolator();
    isolator.queue.push(() => first.promise, navyShirt());
    const detection = new FrontPhotoColorDetection(isolator);
    const old = detection.run('draft-1', 'file:///a.jpg');
    const latest = await detection.run('draft-2', 'file:///b.jpg');
    first.resolve(navyShirt());
    expect(await old).toBeNull();
    expect(latest).not.toBeNull();
  });

  it('drops a result after cancel (form reset or closed)', async () => {
    const first = deferred<GarmentIsolation>();
    const isolator = new FakeGarmentIsolator();
    isolator.queue.push(() => first.promise);
    const detection = new FrontPhotoColorDetection(isolator);
    const running = detection.run('draft-1', 'file:///a.jpg');
    detection.cancel();
    first.resolve(navyShirt());
    expect(await running).toBeNull();
  });

  it('resolves to [] (not null) when detection fails for the current photo', async () => {
    const isolator = new FakeGarmentIsolator();
    isolator.queue.push(new Error('boom'));
    const detection = new FrontPhotoColorDetection(isolator, { onError: () => undefined });
    expect(await detection.run('draft-1', 'file:///a.jpg')).toEqual([]);
  });
});
