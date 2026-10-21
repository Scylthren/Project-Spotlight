import { extractGarmentColors, toDetectedColors, type DetectedColor } from '@/core';

import type { GarmentIsolator } from './garment-isolator';

/** Detection that takes longer than this counts as "no detection". */
export const COLOR_DETECTION_TIMEOUT_MS = 5000;

export interface DetectOptions {
  timeoutMs?: number;
  /** Told about swallowed failures (for a dev warning). Never throws into the caller. */
  onError?: (error: unknown) => void;
}

/**
 * Detects an item's colors from its front photo: isolate the garment, then
 * measure its colors (core/garment-colors.ts). Resolves to the detected
 * colors, most prominent first, or [] for "no detection" (no garment found,
 * an error, or a timeout). Never rejects.
 */
export async function detectItemColors(
  photoUri: string,
  isolator: GarmentIsolator,
  { timeoutMs = COLOR_DETECTION_TIMEOUT_MS, onError }: DetectOptions = {},
): Promise<DetectedColor[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const work = (async () => {
    const isolation = await isolator.isolate(photoUri);
    if (!isolation.ok) return [];
    const { image, mask, confidence } = isolation.garment;
    const extracted = extractGarmentColors(image, mask, confidence);
    return extracted.ok ? toDetectedColors(extracted.colors) : [];
  })();
  try {
    const outcome = await Promise.race([work, timeout]);
    if (outcome === 'timeout') {
      // The work keeps running; make sure its late failure is not unhandled.
      work.catch(() => undefined);
      report(onError, new Error(`color detection timed out after ${timeoutMs} ms`));
      return [];
    }
    return outcome;
  } catch (error) {
    report(onError, error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function report(onError: ((error: unknown) => void) | undefined, error: unknown): void {
  try {
    onError?.(error);
  } catch {
    // A failing reporter must not break detection.
  }
}

/**
 * Runs detection for one form's front photo. Only the latest request counts:
 * starting a new one (the front photo was retaken) or `cancel` (the form was
 * reset or closed) makes earlier ones resolve to null, so a slow result can
 * never land on the wrong photo.
 */
export class FrontPhotoColorDetection {
  private current: string | null = null;

  constructor(
    private readonly isolator: GarmentIsolator,
    private readonly options: DetectOptions = {},
  ) {}

  /** The draft id being detected, or null. */
  get pending(): string | null {
    return this.current;
  }

  /** Detects colors for the front photo draft `draftId`. Null if superseded or cancelled meanwhile. */
  async run(draftId: string, photoUri: string): Promise<DetectedColor[] | null> {
    this.current = draftId;
    const detected = await detectItemColors(photoUri, this.isolator, this.options);
    if (this.current !== draftId) return null;
    this.current = null;
    return detected;
  }

  cancel(): void {
    this.current = null;
  }
}
