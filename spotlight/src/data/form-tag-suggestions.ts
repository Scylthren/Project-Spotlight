import type { ClosetTagger } from '@/ai/closet-tagger';
import {
  applyAttributeSuggestions,
  applyCategorySeasonSuggestions,
  clearSuggestedAttributes,
  clearSuggestedCategorySeason,
  type AttributeFields,
  type CategorySeasonFields,
  type ItemColor,
} from '@/core';

import { isEmptySuggestion, suggestFromPhoto, type SuggestOptions, type TagImageSource } from './item-suggestions';

/** What the form gives the suggestions: its latest state and setters. */
export interface TagSuggestionHost {
  /** The form's latest attribute fields. */
  attributes(): AttributeFields;
  setAttributes(next: AttributeFields): void;
  /** The form's latest category and seasons, with their sources. */
  categorySeason(): CategorySeasonFields;
  setCategorySeason(next: CategorySeasonFields): void;
  /** Draft id of the current front photo, or null. */
  frontPhotoId(): string | null;
  /** The tagger's colors for front photo `id` (D7); the color detection decides whether they apply. */
  suggestColors(id: string, colors: ItemColor[]): void;
  setSuggesting(suggesting: boolean): void;
  /** True after the latest front photo got no suggestion (failure, or nothing usable); shown as "No suggestions". */
  setNoSuggestions(none: boolean): void;
  /** False once the form has closed. */
  isActive(): boolean;
}

/**
 * Tag suggestions for one item form (Gate 2 slices 2 and 3, rules D6, D7 and
 * the slice 3 tagging rules).
 *
 * - `frontPhotoPicked` runs when the front photo is picked or retaken. Values
 *   suggested from the previous front photo described a photo that is gone,
 *   so untouched ones are cleared at once; then the tagger is asked about the
 *   new photo in the background.
 * - A result applies only if it is for the latest pick and that photo is still
 *   the front. It fills only fields the user has not touched
 *   (`applyAttributeSuggestions`, `applyCategorySeasonSuggestions`), read
 *   from the form at that moment, so an edit made while waiting always wins.
 *   Out-of-vocabulary values are dropped.
 * - A failure (offline, error, timeout, no token) gives no suggestion and
 *   never blocks anything; the fields stay as they are, the form shows "No
 *   suggestions" (also when the answer had nothing usable), and the user
 *   fills them.
 * - One request per photo: a second call for the photo already being tagged
 *   is ignored.
 * - A request nobody will use is aborted (`AbortSignal`): when a new front
 *   photo replaces it, when the form is cleared (`reset`) and when the form
 *   closes (`cancel`). The abort is not a failure: nothing is shown for it,
 *   and it never touches saving.
 */
export class FormTagSuggestions {
  private current: string | null = null;
  private controller: AbortController | null = null;

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
    if (!this.host.isActive() || this.current === id) return;
    this.abortRunning();
    const controller = new AbortController();
    this.controller = controller;
    this.current = id;
    this.host.setAttributes(clearSuggestedAttributes(this.host.attributes()));
    this.host.setCategorySeason(clearSuggestedCategorySeason(this.host.categorySeason()));
    this.host.setNoSuggestions(false);
    this.host.setSuggesting(true);
    const result = await suggestFromPhoto(uri, this.deps, { ...this.options, signal: controller.signal });
    if (this.controller === controller) this.controller = null;
    if (this.current !== id || !this.host.isActive()) return; // superseded or cancelled; whoever did that owns the flag
    this.current = null;
    this.host.setSuggesting(false);
    if (this.host.frontPhotoId() !== id) return;
    if (result === null) {
      this.host.setNoSuggestions(true);
      return;
    }
    this.host.setAttributes(applyAttributeSuggestions(this.host.attributes(), result.attributes));
    this.host.setCategorySeason(applyCategorySeasonSuggestions(this.host.categorySeason(), result));
    if (result.colors.length > 0) this.host.suggestColors(id, result.colors);
    if (isEmptySuggestion(result)) this.host.setNoSuggestions(true);
  }

  /** The form was cleared: aborts and drops the running request. */
  reset(): void {
    this.abortRunning();
    this.current = null;
    if (this.host.isActive()) {
      this.host.setSuggesting(false);
      this.host.setNoSuggestions(false);
    }
  }

  /** The form closed: aborts the running request. */
  cancel(): void {
    this.abortRunning();
    this.current = null;
  }

  private abortRunning(): void {
    this.controller?.abort();
    this.controller = null;
  }
}
