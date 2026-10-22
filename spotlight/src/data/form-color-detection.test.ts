import { COLOR_NOTICES, type ItemColor } from '@/core';
import { garmentPhoto, inBox, rgb } from '@/core/testing/synthetic-images';

import { FormColorDetection, type ColorDetectionHost } from './form-color-detection';
import { FakeGarmentIsolator, type GarmentIsolation } from './garment-isolator';

/** A clean isolation of a navy shirt with the given confidence. */
function navyShirt(confidence = 1): GarmentIsolation {
  const image = garmentPhoto(() => rgb('#202A60'), () => rgb('#F4F4F2'));
  const mask = new Uint8Array(image.width * image.height);
  for (let i = 0; i < mask.length; i++) mask[i] = inBox(i % image.width, Math.floor(i / image.width)) ? 1 : 0;
  return { ok: true, garment: { image, mask, confidence } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const AUTO_RED: ItemColor = { paletteId: 'red', hex: '#B5122B', source: 'auto' };
const USER_WHITE: ItemColor = { paletteId: 'white', hex: '#FFFFFF', source: 'user' };

/** A fake form: plain fields the test can read and change. */
function setup(initial: ItemColor[] = []) {
  const form = {
    colors: [...initial],
    front: 'draft-1' as string | null,
    matrix: [] as string[],
    detecting: [] as boolean[],
    active: true,
  };
  const host: ColorDetectionHost = {
    colors: () => form.colors,
    frontPhotoId: () => form.front,
    setColors: (colors) => {
      form.colors = colors;
    },
    openMatrix: (notice) => form.matrix.push(notice),
    setDetecting: (detecting) => form.detecting.push(detecting),
    isActive: () => form.active,
  };
  const isolator = new FakeGarmentIsolator();
  const detection = new FormColorDetection(isolator, host, { onError: () => undefined });
  return { form, isolator, detection };
}

describe('FormColorDetection', () => {
  it('fills colors from the front photo and toggles the detecting flag', async () => {
    const { form, isolator, detection } = setup();
    isolator.queue.push(navyShirt());
    await detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    expect(form.colors).toEqual([expect.objectContaining({ paletteId: 'navy', source: 'auto' })]);
    expect(form.detecting).toEqual([true, false]);
    expect(form.matrix).toEqual([]);
  });

  it('ignores a result for a photo that is no longer the front', async () => {
    const { form, isolator, detection } = setup();
    isolator.queue.push(navyShirt());
    form.front = 'draft-2';
    await detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    expect(form.colors).toEqual([]);
    expect(form.detecting).toEqual([true, false]);
  });

  it('a user deselect during detection is not undone (review fix 1)', async () => {
    const { form, isolator, detection } = setup([AUTO_RED]);
    const slow = deferred<GarmentIsolation>();
    isolator.queue.push(() => slow.promise);
    const running = detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    // The user removes the auto red: no 'user' color is left, but they touched the colors.
    form.colors = [];
    detection.userChangedColors();
    slow.resolve(navyShirt());
    await running;
    expect(form.colors).toEqual([]);
    expect(form.matrix).toEqual([]);
  });

  it('a new front photo starts fresh: a touch on the old photo does not block it', async () => {
    const { form, isolator, detection } = setup([AUTO_RED]);
    detection.userChangedColors();
    isolator.queue.push(navyShirt());
    await detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    expect(form.colors[0].paletteId).toBe('navy');
  });

  it('never replaces a user color', async () => {
    const { form, isolator, detection } = setup([USER_WHITE]);
    isolator.queue.push(navyShirt());
    await detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    expect(form.colors).toEqual([USER_WHITE]);
  });

  it('on failure clears stale auto colors and opens the matrix (review fix 2)', async () => {
    const { form, isolator, detection } = setup([AUTO_RED]);
    isolator.queue.push(new Error('decode failed'));
    await detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    expect(form.colors).toEqual([]);
    expect(form.matrix).toEqual([COLOR_NOTICES.notDetected]);
  });

  it('holds a notice while the picker is open and shows it once released', async () => {
    const { form, isolator, detection } = setup();
    isolator.queue.push(navyShirt(0.2));
    detection.hold('picker');
    await detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    expect(form.colors).toHaveLength(1); // colors apply at once
    expect(form.matrix).toEqual([]); // the matrix waits
    detection.release('picker');
    expect(form.matrix).toEqual([COLOR_NOTICES.lowConfidence]);
  });

  it('waits for every hold, e.g. the picker and the camera intro', async () => {
    const { form, detection } = setup();
    detection.hold('picker');
    detection.hold('camera-intro');
    await detection.frontPhotoPicked('draft-1', 'file:///front.jpg'); // fake fallback: no garment
    detection.release('picker');
    expect(form.matrix).toEqual([]);
    detection.release('camera-intro');
    expect(form.matrix).toEqual([COLOR_NOTICES.notDetected]);
  });

  it('never opens the matrix during a save; a successful save drops the notice (review fix 4)', async () => {
    const { form, detection } = setup();
    detection.hold('save');
    expect(detection.isHeld('save')).toBe(true);
    await detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    expect(form.matrix).toEqual([]);
    detection.release('save', { drop: true });
    expect(form.matrix).toEqual([]);
    expect(detection.isHeld()).toBe(false);
  });

  it('a failed save shows the kept notice', async () => {
    const { form, detection } = setup();
    detection.hold('save');
    await detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    detection.release('save');
    expect(form.matrix).toEqual([COLOR_NOTICES.notDetected]);
  });

  it('reset drops a running detection and its notice, and clears the flag', async () => {
    const { form, isolator, detection } = setup();
    const slow = deferred<GarmentIsolation>();
    isolator.queue.push(() => slow.promise);
    detection.hold('picker');
    const running = detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    detection.reset();
    slow.resolve(navyShirt());
    await running;
    detection.release('picker');
    expect(form.colors).toEqual([]);
    expect(form.matrix).toEqual([]);
    expect(form.detecting).toEqual([true, false]);
  });

  it('a retake supersedes the earlier detection; the newer one owns the flag', async () => {
    const { form, isolator, detection } = setup();
    const first = deferred<GarmentIsolation>();
    isolator.queue.push(() => first.promise, navyShirt());
    const old = detection.frontPhotoPicked('draft-1', 'file:///a.jpg');
    form.front = 'draft-2';
    await detection.frontPhotoPicked('draft-2', 'file:///b.jpg');
    first.resolve({ ok: false, reason: 'late' });
    await old;
    expect(form.colors[0].paletteId).toBe('navy');
    expect(form.detecting).toEqual([true, true, false]);
    expect(form.matrix).toEqual([]);
  });

  it('does nothing after the form closed', async () => {
    const { form, isolator, detection } = setup();
    isolator.queue.push(navyShirt(0.2));
    const running = detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    form.active = false;
    await running;
    expect(form.colors).toEqual([]);
    expect(form.matrix).toEqual([]);
    detection.cancel();
  });
});

describe('FormColorDetection: tagger colors (Gate 2, D7)', () => {
  const AI_NAVY: ItemColor = { paletteId: 'navy', hex: '#202A60', source: 'auto' };
  const AI_RED: ItemColor = { paletteId: 'red', hex: '#B5122B', source: 'auto' };

  it('tagger colors replace the on-device guess', async () => {
    const { form, isolator, detection } = setup();
    isolator.queue.push(navyShirt());
    await detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    expect(form.colors.map((c) => c.paletteId)).toEqual(['navy']);
    detection.taggerColors('draft-1', [AI_RED, AI_NAVY]);
    expect(form.colors).toEqual([AI_RED, AI_NAVY]);
    expect(form.matrix).toEqual([]);
  });

  it('an on-device result that arrives after the tagger colors is ignored, notice included', async () => {
    const { form, isolator, detection } = setup();
    const pending = deferred<GarmentIsolation>();
    isolator.queue.push(() => pending.promise);
    const running = detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    detection.taggerColors('draft-1', [AI_RED]);
    pending.resolve(navyShirt(0.2));
    await running;
    expect(form.colors).toEqual([AI_RED]);
    expect(form.matrix).toEqual([]);
    expect(form.detecting).toEqual([true, false]);
  });

  it('user colors always win, also when the user only deselected', async () => {
    const withUser = setup([USER_WHITE]);
    withUser.detection.taggerColors('draft-1', [AI_RED]);
    expect(withUser.form.colors).toEqual([USER_WHITE]);

    const { form, isolator, detection } = setup();
    isolator.queue.push(navyShirt());
    await detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    form.colors = [];
    detection.userChangedColors();
    detection.taggerColors('draft-1', [AI_RED]);
    expect(form.colors).toEqual([]);
  });

  it('ignores tagger colors for another photo or an empty list, and the on-device guess stays the fallback', async () => {
    const { form, isolator, detection } = setup();
    isolator.queue.push(navyShirt());
    await detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    detection.taggerColors('draft-0', [AI_RED]);
    detection.taggerColors('draft-1', []);
    expect(form.colors.map((c) => c.paletteId)).toEqual(['navy']);
  });

  it('drops a held on-device notice once the tagger colors arrive; a new photo starts over', async () => {
    const { form, isolator, detection } = setup([AUTO_RED]);
    isolator.queue.push(navyShirt(0.2));
    detection.hold('picker');
    await detection.frontPhotoPicked('draft-1', 'file:///front.jpg');
    detection.taggerColors('draft-1', [AI_NAVY]);
    detection.release('picker');
    expect(form.matrix).toEqual([]);
    expect(form.colors).toEqual([AI_NAVY]);

    form.front = 'draft-2';
    isolator.queue.push(navyShirt());
    await detection.frontPhotoPicked('draft-2', 'file:///two.jpg');
    expect(form.colors.map((c) => [c.paletteId, c.source])).toEqual([['navy', 'auto']]);
  });
});
