import type { ClosetTagger, TagImage } from '@/ai/closet-tagger';
import type { ItemTags } from '@/ai/tag-item-contract';
import {
  cleanAttributeSuggestions,
  isPaletteId,
  MAX_ITEM_COLORS,
  paletteColor,
  type AttributeSuggestions,
  type ItemColor,
} from '@/core';

/**
 * Turns a photo into the image the tagger receives. Slice 3 adds the real one
 * (downscale, re-encode, strip metadata, base64).
 */
export interface TagImageSource {
  read(photoUri: string): Promise<TagImage>;
}

/**
 * Gate 2 slice 2 placeholder: the app's tagger is `MockClosetTagger`, which
 * ignores the image, so no photo is read. It returns an empty image; if the
 * remote tagger were wired to it by mistake, the function rejects it (400)
 * and the form simply gets no suggestion.
 */
export class PlaceholderTagImageSource implements TagImageSource {
  async read(): Promise<TagImage> {
    return { base64: '', contentType: 'image/jpeg' };
  }
}

/** What a photo suggests for the form. */
export interface PhotoSuggestions {
  /** In-vocabulary values only; out-of-vocabulary ones are dropped. */
  attributes: AttributeSuggestions;
  /**
   * The tagger's colors as 'auto' palette colors (reference hex), most
   * prominent first, at most MAX_ITEM_COLORS. Empty when it suggested none,
   * or when the answer was the canned stub (its colors say nothing about the
   * photo, so the on-device guess stays).
   */
  colors: ItemColor[];
}

/** Suggestion that takes longer than this counts as "no suggestion" (above the remote tagger's own 20 s). */
export const TAG_SUGGESTION_TIMEOUT_MS = 30_000;

export interface SuggestOptions {
  timeoutMs?: number;
  /** Told about swallowed failures (for a dev warning). */
  onError?: (error: unknown) => void;
}

/** Maps the tagger's tags to form suggestions (see `PhotoSuggestions`). */
export function toPhotoSuggestions(tags: ItemTags, stub: boolean): PhotoSuggestions {
  const colors: ItemColor[] = [];
  if (!stub) {
    for (const id of tags.colors) {
      if (colors.length >= MAX_ITEM_COLORS) break;
      if (!isPaletteId(id) || colors.some((c) => c.paletteId === id)) continue;
      colors.push({ paletteId: id, hex: paletteColor(id)!.hex, source: 'auto' });
    }
  }
  return {
    attributes: cleanAttributeSuggestions({
      type: tags.type,
      pattern: tags.pattern,
      material: tags.material,
      fit: tags.fit,
      formality: tags.formality,
    }),
    colors,
  };
}

/**
 * Asks the tagger about a photo. Resolves to the suggestions, or null for "no
 * suggestion" (any tagger failure, a thrown error, or a timeout). Never
 * rejects, so a failure can never block saving.
 */
export async function suggestFromPhoto(
  photoUri: string,
  deps: { tagger: ClosetTagger; imageSource: TagImageSource },
  { timeoutMs = TAG_SUGGESTION_TIMEOUT_MS, onError }: SuggestOptions = {},
): Promise<PhotoSuggestions | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const work = (async () => {
    const image = await deps.imageSource.read(photoUri);
    const outcome = await deps.tagger.tag(image);
    return outcome.ok ? toPhotoSuggestions(outcome.tags, outcome.stub) : null;
  })();
  try {
    const result = await Promise.race([work, timeout]);
    if (result === 'timeout') {
      work.catch(() => undefined);
      report(onError, new Error(`tag suggestion timed out after ${timeoutMs} ms`));
      return null;
    }
    return result;
  } catch (error) {
    report(onError, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function report(onError: ((error: unknown) => void) | undefined, error: unknown): void {
  try {
    onError?.(error);
  } catch {
    // A failing reporter must not break suggestions.
  }
}
