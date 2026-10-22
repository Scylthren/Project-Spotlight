import type { ClosetTagger } from '@/ai/closet-tagger';
import {
  applyAttributeSuggestions,
  clearSuggestedAttributes,
  type AttributeFields,
  type ItemColor,
} from '@/core';

import { suggestFromPhoto, type SuggestOptions, type TagImageSource } from './item-suggestions';

/** What the form gives the suggestions: its latest state and setters. */
export interface TagSuggestionHost {
  /** The form's latest attribute fields. */
  attributes(): AttributeFields;
  setAttributes(next: AttributeFields): void;
  /** Draft id of the current front photo, or null. */
  frontPhotoId(): string | null;
  /** The tagger's colors for front photo `id` (D7); the color detection decides whether they apply. */
  suggestColors(id: string, colors: ItemColor[]): void;
  setSuggesting(suggesting: boolean): void;
  /** False once the form has closed. */
  isActive(): boolean;
}

/**
 * Tag suggestions for one item form (Gate 2 slice 2, rules D6 and D7).
 *
 * - `frontPhotoPicked` runs when the front photo is picked or retaken. Values
 *   suggested from the previous front photo described a photo that is gone,
 *   so untouched ones are cleared at once; then the tagger is asked about the
 *   new photo in the background.
 * - A result applies only if it is for the latest pick and that photo is still
 *   the front. It fills only fields the user has not touched
 *   (`applyAttributeSuggestions`), read from the form at that moment, so an
 *   edit made while waiting always wins. Out-of-vocabulary values are dropped.
 * - A failure (offline, error, timeout) gives no suggestion and never blocks
 *   anything; the fields stay as they are and the user fills them.
 */
export class FormTagSuggestions {
  private current: string | null = null;

  constructor(
    private readonly deps: { tagger: ClosetTagger; imageSource: TagImageSource },
    private readonly host: TagSuggestionHost,
    private readonly options: SuggestOptions = {},
  ) {}

  /** The draft id being tagged, or null. */
  get pending(): string | null {
    return this.current;
  }

  /** Suggests tags for front photo draft `id`. Resolves when done; never rejects. */
  async frontPhotoPicked(id: string, uri: string): Promise<void> {
    if (!this.host.isActive()) return;
    this.current = id;
    this.host.setAttributes(clearSuggestedAttributes(this.host.attributes()));
    this.host.setSuggesting(true);
    const result = await suggestFromPhoto(uri, this.deps, this.options);
    if (this.current !== id || !this.host.isActive()) return; // superseded or cancelled; whoever did that owns the flag
    this.current = null;
    this.host.setSuggesting(false);
    if (result === null || this.host.frontPhotoId() !== id) return;
    this.host.setAttributes(applyAttributeSuggestions(this.host.attributes(), result.attributes));
    if (result.colors.length > 0) this.host.suggestColors(id, result.colors);
  }

  /** The form was cleared: drops the running request. */
  reset(): void {
    this.current = null;
    if (this.host.isActive()) this.host.setSuggesting(false);
  }

  /** The form closed. */
  cancel(): void {
    this.current = null;
  }
}
