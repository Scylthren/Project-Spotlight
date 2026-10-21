import type { RgbaImage } from '@/core';

/**
 * The garment found in a photo: a small decoded copy of the photo and a mask
 * over it (one byte per pixel, 1 = garment). Used to measure colors only.
 * Nothing here is stored: a stored cutout (PNG with transparency, kept
 * beside the original) is a Gate 2 decision and would extend this interface.
 */
export interface IsolatedGarment {
  image: RgbaImage;
  mask: Uint8Array;
  /** 0..1: how sure the isolator is that the mask is the garment. */
  confidence: number;
}

export type GarmentIsolation = { ok: true; garment: IsolatedGarment } | { ok: false; reason: string };

/**
 * Separates the garment from the background in a photo.
 *
 * `photoUri` is a local file the image manipulator can read: a picked or
 * taken photo (temporary copy) or a stored one (`ImageStore.resolveUri`).
 * Implementations must not change or keep that file, and must delete any
 * temporary file they write. A failure resolves `{ ok: false }` or rejects;
 * callers treat both as "no detection" and never block saving on it.
 *
 * Implementations: `NoGarmentIsolator` (the mock: never finds one),
 * `FakeGarmentIsolator` (tests), and `LocalGarmentIsolator` (on-device heuristic).
 */
export interface GarmentIsolator {
  isolate(photoUri: string): Promise<GarmentIsolation>;
}

/** Mock `GarmentIsolator`: returns no garment, like a device where isolation is unavailable. */
export class NoGarmentIsolator implements GarmentIsolator {
  async isolate(): Promise<GarmentIsolation> {
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * Configurable `GarmentIsolator` for tests. Each call takes the next queued
 * outcome (a result, an Error to reject with, or a function to call), then
 * falls back to `fallback`. `inputs` records every URI.
 */
export class FakeGarmentIsolator implements GarmentIsolator {
  readonly inputs: string[] = [];
  readonly queue: (GarmentIsolation | Error | (() => Promise<GarmentIsolation>))[] = [];
  fallback: GarmentIsolation = { ok: false, reason: 'unavailable' };

  async isolate(photoUri: string): Promise<GarmentIsolation> {
    this.inputs.push(photoUri);
    const next = this.queue.shift() ?? this.fallback;
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next();
    return next;
  }
}
