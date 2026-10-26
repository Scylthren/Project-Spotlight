import type { ClosetTagger } from '@/ai/closet-tagger';
import {
  applyAttributeSuggestions,
  applyCategorySeasonSuggestions,
  applyDetectedColors,
  CATEGORY_LABELS,
  categorySeasonFields,
  createSingleFlight,
  describeImportSelection,
  describeAttributes,
  EMPTY_ATTRIBUTE_FIELDS,
  fieldsToAttributes,
  IMPORT_PHOTO_LIMIT,
  paletteName,
  pickCategory,
  selectImportPhotos,
  setAttribute,
  toggleAttribute,
  toggleFormSeason,
  type AttributeFields,
  type AttributeValueMap,
  type Category,
  type CategorySeasonFields,
  type ChoiceAttributeName,
  type ClothingItem,
  type ColorSelectionResult,
  type ItemColor,
  type ItemFormValues,
  type PhotoDraft,
  type Season,
  type TagListResult,
} from '@/core';

import { addClosetItem, CLOSET_ITEM_MESSAGES, generateItemId, type AddItemDeps, type AddItemResult } from './add-closet-item';
import { detectItemColors, type DetectOptions } from './detect-item-colors';
import type { GarmentIsolator } from './garment-isolator';
import { isEmptySuggestion, suggestFromPhoto, type PhotoSuggestions, type SuggestOptions, type TagImageSource } from './item-suggestions';
import type { PickedLibraryPhoto } from './photo-picker';
import { discardQuietly } from './temporary-files';

/** How many photos are tagged (and color-detected) at the same time. */
export const IMPORT_CONCURRENCY = 3;

/**
 * Where a draft's suggestions stand:
 * - 'waiting': queued behind other photos;
 * - 'tagging': being tagged (and its colors detected) now;
 * - 'suggested': the tagger suggested something;
 * - 'no-suggestions': the tagger failed (offline, no token, timeout, error)
 *   or suggested nothing usable. Never blocks saving.
 */
export type DraftSuggestionStatus = 'waiting' | 'tagging' | 'suggested' | 'no-suggestions';

export type DraftSaveState = { status: 'idle' } | { status: 'saving' } | { status: 'failed'; errors: string[] };

/**
 * Where a draft's colors came from. The tagger's colors replace the
 * on-device guess (D7); anything the user changed wins over both.
 */
export type DraftColorOrigin = 'none' | 'device' | 'tagger' | 'user';

/** A field the item needs before it can be saved. */
export type RequiredField = 'category' | 'colors' | 'seasons';

/** One photo of the import, becoming one item when saved (D9). Immutable; every change makes a new object. */
export interface ImportDraft {
  readonly id: string;
  /** The picker's temporary copy. Deleted when the draft is saved, removed, or the import is discarded. */
  readonly photo: PickedLibraryPhoto;
  /** The id the item's photo gets when saved. */
  readonly photoId: string;
  readonly name: string;
  readonly categorySeason: CategorySeasonFields;
  readonly colors: readonly ItemColor[];
  readonly colorOrigin: DraftColorOrigin;
  readonly tags: readonly string[];
  readonly attributes: AttributeFields;
  readonly suggestion: DraftSuggestionStatus;
  /** True while the on-device color detection runs. */
  readonly detectingColors: boolean;
  readonly save: DraftSaveState;
}

/** A change to a draft (mutable while it is being built). */
type DraftChanges = { -readonly [K in keyof ImportDraft]?: ImportDraft[K] };

export interface ImportSnapshot {
  /** In the order the picker returned the photos. Saved and removed drafts leave the list. */
  readonly drafts: readonly ImportDraft[];
  /** What was left out of the import (limit, duplicates, unreadable). */
  readonly notices: readonly string[];
  /** True while "Save" runs; editing and removing wait for it. */
  readonly saving: boolean;
  /** Items saved by this import so far. */
  readonly savedCount: number;
  /** The outcome of the last Save, or null before the first. */
  readonly lastSave: SaveReport | null;
  /** True once the import was discarded or finished. */
  readonly closed: boolean;
}

export interface SaveReport {
  saved: ClothingItem[];
  /** Drafts that could not be saved, with user-facing reasons. They stay in the list. */
  failed: { draftId: string; errors: string[] }[];
}

export interface ImportSessionDeps {
  tagger: ClosetTagger;
  /** Prepares the image the tagger receives, exactly as in the single-item form (`createTaggingServices`). */
  imageSource: TagImageSource;
  /** On-device color detection, as in the single-item form. */
  isolator: GarmentIsolator;
  /** Saving goes through `addClosetItem` with these. */
  addItem: Omit<AddItemDeps, 'newId'>;
  newId?: () => string;
  concurrency?: number;
  suggestOptions?: SuggestOptions;
  detectOptions?: DetectOptions;
}

/** The form values a draft would be saved with. */
export function draftValues(draft: ImportDraft): ItemFormValues {
  const name = draft.name.trim();
  return {
    ...(name ? { name: draft.name } : {}),
    category: draft.categorySeason.category.value,
    colors: draft.colors.map((c) => ({ ...c })),
    seasons: [...draft.categorySeason.seasons.value],
    tags: [...draft.tags],
    attributes: draft.attributes,
  };
}

/** The required fields a draft is still missing, in form order. */
export function missingFields(draft: ImportDraft): RequiredField[] {
  const missing: RequiredField[] = [];
  if (draft.colors.length === 0) missing.push('colors');
  if (draft.categorySeason.category.value === null) missing.push('category');
  if (draft.categorySeason.seasons.value.length === 0) missing.push('seasons');
  return missing;
}

/** True while suggestions or colors may still arrive for the draft. */
export function isDraftAnalyzing(draft: ImportDraft): boolean {
  return draft.suggestion === 'waiting' || draft.suggestion === 'tagging' || draft.detectingColors;
}

/**
 * True when "Save" would save this draft: nothing is still arriving for it
 * (so a late suggestion cannot change what was already saved), it has every
 * required field, and it is not being saved.
 */
export function isDraftReady(draft: ImportDraft): boolean {
  return !isDraftAnalyzing(draft) && missingFields(draft).length === 0 && draft.save.status !== 'saving';
}

const REQUIRED_LABELS: Readonly<Record<RequiredField, string>> = { category: 'a category', colors: 'a color', seasons: 'a season' };

/** "Needs a category and a season", or null when nothing is missing. */
export function describeMissing(missing: readonly RequiredField[]): string | null {
  if (missing.length === 0) return null;
  const parts = missing.map((m) => REQUIRED_LABELS[m]);
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Needs ${list}`;
}

/** The status line of a draft in the review list. */
export function describeDraftStatus(draft: ImportDraft): string {
  if (draft.save.status === 'saving') return 'Saving...';
  if (draft.save.status === 'failed') return 'Not saved';
  switch (draft.suggestion) {
    case 'waiting':
      return 'Waiting for suggestions';
    case 'tagging':
      return 'Getting suggestions...';
    case 'suggested':
      return draft.detectingColors ? 'Detecting colors...' : 'Suggested';
    case 'no-suggestions':
      return draft.detectingColors ? 'Detecting colors...' : 'No suggestions';
  }
}

/** What a review row shows about a draft. */
export interface DraftHeadline {
  /** The name, else the category, else "No category yet". */
  title: string;
  /** Category (when the title is the name) and the attributes, joined with " · "; empty when none. */
  details: string;
  /** Color names, primary first; empty when none. */
  colors: string;
}

export function describeDraftHeadline(draft: ImportDraft): DraftHeadline {
  const category = draft.categorySeason.category.value;
  const name = draft.name.trim();
  const title = name || (category ? CATEGORY_LABELS[category] : 'No category yet');
  const details = [
    ...(name && category ? [CATEGORY_LABELS[category]] : []),
    ...describeAttributes(fieldsToAttributes(draft.attributes)).map((a) => a.text),
  ].join(' · ');
  return { title, details, colors: draft.colors.map((c) => paletteName(c.paletteId)).join(', ') };
}

export interface ReviewSummary {
  total: number;
  ready: number;
  /** Done analyzing but missing a required field. */
  needsDetails: number;
  analyzing: number;
  failed: number;
}

export function summarizeDrafts(drafts: readonly ImportDraft[]): ReviewSummary {
  const summary: ReviewSummary = { total: drafts.length, ready: 0, needsDetails: 0, analyzing: 0, failed: 0 };
  for (const draft of drafts) {
    if (draft.save.status === 'failed') summary.failed += 1;
    if (isDraftReady(draft)) summary.ready += 1;
    else if (isDraftAnalyzing(draft)) summary.analyzing += 1;
    else if (missingFields(draft).length > 0) summary.needsDetails += 1;
  }
  return summary;
}

function pieces(count: number): string {
  return count === 1 ? '1 piece' : `${count} pieces`;
}

/** The label of the Save button: it saves only the ready drafts. */
export function saveButtonLabel(summary: ReviewSummary): string {
  if (summary.ready === 0) return 'Nothing ready to save';
  return summary.ready === summary.total ? `Save all ${pieces(summary.ready)}` : `Save ${pieces(summary.ready)}`;
}

/** The line under the Save button that explains what is not saved and why, or null. */
export function describeNotReady(summary: ReviewSummary): string | null {
  const parts: string[] = [];
  if (summary.needsDetails > 0) {
    parts.push(`${pieces(summary.needsDetails)} ${summary.needsDetails === 1 ? 'needs' : 'need'} details`);
  }
  if (summary.analyzing > 0) {
    parts.push(`${pieces(summary.analyzing)} still getting suggestions`);
  }
  if (parts.length === 0) return null;
  return `${parts.join('; ')}. ${summary.ready > 0 ? 'Only ready pieces are saved; the rest stay here.' : 'Tap a piece to fill in what it needs.'}`;
}

/** What the review says after a Save. */
export function describeSaveReport(report: SaveReport): string {
  const saved = report.saved.length;
  const failed = report.failed.length;
  if (failed === 0) return `Saved ${pieces(saved)}.`;
  const prefix = saved > 0 ? `Saved ${pieces(saved)}. ` : '';
  return `${prefix}${pieces(failed)} could not be saved; see below and try again.`;
}

function newDraft(photo: PickedLibraryPhoto, newId: () => string): ImportDraft {
  return {
    id: newId(),
    photo,
    photoId: newId(),
    name: '',
    categorySeason: categorySeasonFields(null, []),
    colors: [],
    colorOrigin: 'none',
    tags: [],
    attributes: { ...EMPTY_ATTRIBUTE_FIELDS },
    suggestion: 'waiting',
    detectingColors: false,
    save: { status: 'idle' },
  };
}

/**
 * One multi-select import (Gate 2 slice 6): a list of drafts, one per photo,
 * that live only in memory until the user saves them. Nothing is written to
 * the closet before `saveReady`; killing the app loses the drafts and leaves
 * the closet untouched (the picker's temporary copies are left to the OS).
 *
 * - `start` tags each photo and detects its colors, `concurrency` photos at
 *   a time, in list order, with the same services and rules as the item
 *   form: the image the tagger receives is prepared by the same
 *   `TagImageSource`; suggestions fill only fields the user has not touched
 *   (auto/user rule), so an edit made while waiting always wins; the
 *   tagger's colors replace the on-device guess unless the user changed the
 *   colors (D7). A failure gives "No suggestions" for that draft only.
 * - Edits made through the methods below mark fields as the user's.
 * - `saveReady` saves every ready draft one at a time through
 *   `addClosetItem` (so photos are downscaled, re-encoded and stripped the
 *   same way). A draft that fails stays with its reasons; the others are
 *   saved. A second call while one runs is ignored.
 * - `discard` (the user cancels) drops every draft, aborts every tagging
 *   request still running (`AbortSignal`; not shown as a failure) and
 *   deletes the temporary copies; results that arrive later are ignored.
 *   `remove` aborts that draft's request the same way.
 *
 * Subscribe with `subscribe`/`getSnapshot` (React's useSyncExternalStore).
 */
export class ImportSession {
  private snapshot: ImportSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly saveGuard = createSingleFlight();
  private readonly newId: () => string;
  private started: Promise<void> | null = null;
  /** Drafts already handed to `discard` cleanup, so no file is discarded twice. */
  private readonly released = new Set<string>();
  /** Running tagging requests by draft id, aborted when the draft is removed or the import discarded. */
  private readonly tagging = new Map<string, AbortController>();

  constructor(
    photos: readonly PickedLibraryPhoto[],
    private readonly deps: ImportSessionDeps,
    notices: readonly string[] = [],
  ) {
    this.newId = deps.newId ?? (() => generateItemId());
    this.snapshot = {
      drafts: photos.map((photo) => newDraft(photo, this.newId)),
      notices: [...notices],
      saving: false,
      savedCount: 0,
      lastSave: null,
      closed: false,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ImportSnapshot => this.snapshot;

  draft(id: string): ImportDraft | null {
    return this.snapshot.drafts.find((d) => d.id === id) ?? null;
  }

  /** Starts tagging and color detection. Resolves when every draft has been analyzed (or the import closed). */
  start(): Promise<void> {
    this.started ??= (async () => {
      const workers = Math.max(1, this.deps.concurrency ?? IMPORT_CONCURRENCY);
      await Promise.all(Array.from({ length: workers }, () => this.worker()));
    })();
    return this.started;
  }

  // --- Editing (each marks the field as the user's; ignored while saving or after closing) ---

  setName(id: string, name: string): void {
    this.edit(id, () => ({ name }));
  }

  setCategory(id: string, category: Category | null): void {
    this.edit(id, (d) => ({ categorySeason: pickCategory(d.categorySeason, category) }));
  }

  toggleSeason(id: string, season: Season): void {
    this.edit(id, (d) => ({ categorySeason: toggleFormSeason(d.categorySeason, season) }));
  }

  setItemType(id: string, text: string): void {
    this.edit(id, (d) => ({ attributes: setAttribute(d.attributes, 'type', text) }));
  }

  toggleAttribute<K extends ChoiceAttributeName>(id: string, name: K, value: AttributeValueMap[K]): void {
    this.edit(id, (d) => ({ attributes: toggleAttribute(d.attributes, name, value) }));
  }

  /** Applies a color matrix change. Returns the refused change's result, or null when applied or ignored. */
  changeColors(id: string, change: (current: ItemColor[]) => ColorSelectionResult): ColorSelectionResult | null {
    let refused: ColorSelectionResult | null = null;
    this.edit(id, (d) => {
      const result = change(d.colors.map((c) => ({ ...c })));
      if (!result.ok) {
        refused = result;
        return null;
      }
      return { colors: result.colors, colorOrigin: 'user' };
    });
    return refused;
  }

  /** Applies a tag change. Returns the result (a refused one says why), or null when ignored. */
  changeTags(id: string, change: (current: string[]) => TagListResult): TagListResult | null {
    let outcome: TagListResult | null = null;
    this.edit(id, (d) => {
      const result = change([...d.tags]);
      outcome = result;
      return result.ok ? { tags: result.tags } : null;
    });
    return outcome;
  }

  /** Removes a draft and deletes its temporary photo. Ignored while saving. */
  async remove(id: string): Promise<void> {
    if (this.snapshot.closed || this.snapshot.saving) return;
    const draft = this.draft(id);
    if (!draft) return;
    this.update({ drafts: this.snapshot.drafts.filter((d) => d.id !== id) });
    this.tagging.get(id)?.abort();
    await this.release(draft);
  }

  // --- Saving and closing ---

  /**
   * Saves every ready draft (see `isDraftReady`), one at a time. Saved drafts
   * leave the list; failed ones stay with their reasons. Returns the report,
   * or null when a save was already running or the import is closed.
   */
  async saveReady(): Promise<SaveReport | null> {
    if (this.snapshot.closed) return null;
    const outcome = await this.saveGuard.run(async () => {
      const report: SaveReport = { saved: [], failed: [] };
      const ids = this.snapshot.drafts.filter(isDraftReady).map((d) => d.id);
      this.update({ saving: true });
      try {
        for (const id of ids) {
          if (this.snapshot.closed) break;
          const draft = this.draft(id);
          if (!draft || !isDraftReady(draft)) continue;
          this.patch(id, { save: { status: 'saving' } });
          const photo: PhotoDraft = { kind: 'picked', id: draft.photoId, role: 'front', isPrimary: true, uri: draft.photo.uri };
          let result: AddItemResult;
          try {
            result = await addClosetItem({ ...draftValues(draft), photos: [photo] }, { ...this.deps.addItem, newId: this.newId });
          } catch {
            result = { ok: false, errors: [CLOSET_ITEM_MESSAGES.saveFailed] };
          }
          if (result.ok) {
            // addClosetItem already deleted the temporary photo.
            this.released.add(id);
            report.saved.push(result.item);
            this.update({
              drafts: this.snapshot.drafts.filter((d) => d.id !== id),
              savedCount: this.snapshot.savedCount + 1,
            });
          } else {
            report.failed.push({ draftId: id, errors: result.errors });
            this.patch(id, { save: { status: 'failed', errors: result.errors } });
          }
        }
      } finally {
        this.update({ saving: false, lastSave: report });
      }
      if (this.snapshot.closed) await this.releaseAll();
      return report;
    });
    return outcome.ran ? outcome.value : null;
  }

  /**
   * Ends the import: drops every remaining draft and deletes its temporary
   * photo (after a running save has finished with the draft it is on).
   * Saved items stay saved. Safe to call more than once.
   */
  async discard(): Promise<void> {
    if (this.snapshot.closed) return;
    this.update({ closed: true });
    for (const controller of this.tagging.values()) controller.abort();
    if (!this.snapshot.saving) await this.releaseAll();
  }

  // --- Internals ---

  private async worker(): Promise<void> {
    for (;;) {
      if (this.snapshot.closed) return;
      const next = this.snapshot.drafts.find((d) => d.suggestion === 'waiting');
      if (!next) return;
      // Marked before any await, so two workers never take the same draft.
      this.patch(next.id, { suggestion: 'tagging', detectingColors: true });
      await this.analyze(next);
    }
  }

  private async analyze(draft: ImportDraft): Promise<void> {
    const { uri } = draft.photo;
    const detect = detectItemColors(uri, this.deps.isolator, this.deps.detectOptions).then((detected) =>
      this.applyDetected(draft.id, detected),
    );
    const controller = new AbortController();
    this.tagging.set(draft.id, controller);
    const suggest = suggestFromPhoto(
      uri,
      { tagger: this.deps.tagger, imageSource: this.deps.imageSource },
      { ...this.deps.suggestOptions, signal: controller.signal },
    ).then((result) => {
      this.tagging.delete(draft.id);
      this.applySuggestions(draft.id, result);
    });
    await Promise.all([detect, suggest]);
  }

  private applyDetected(id: string, detected: Parameters<typeof applyDetectedColors>[1]): void {
    const draft = this.live(id);
    if (!draft) return;
    const changes: DraftChanges = { detectingColors: false };
    // Only fills empty colors: the tagger's colors win (D7), the user's always do.
    if (draft.colorOrigin === 'none') {
      const applied = applyDetectedColors(draft.colors, detected);
      if (applied && applied.colors.length > 0) {
        changes.colors = applied.colors;
        changes.colorOrigin = 'device';
      }
    }
    this.patch(id, changes);
  }

  private applySuggestions(id: string, result: PhotoSuggestions | null): void {
    const draft = this.live(id);
    if (!draft) return;
    if (result === null) {
      this.patch(id, { suggestion: 'no-suggestions' });
      return;
    }
    const changes: DraftChanges = {
      attributes: applyAttributeSuggestions(draft.attributes, result.attributes),
      categorySeason: applyCategorySeasonSuggestions(draft.categorySeason, result),
      suggestion: isEmptySuggestion(result) ? 'no-suggestions' : 'suggested',
    };
    if (result.colors.length > 0 && draft.colorOrigin !== 'user') {
      changes.colors = result.colors;
      changes.colorOrigin = 'tagger';
    }
    this.patch(id, changes);
  }

  /** The draft if the import is open and it is still in the list. */
  private live(id: string): ImportDraft | null {
    return this.snapshot.closed ? null : this.draft(id);
  }

  /** A user edit: ignored while saving, after closing, or for a gone draft; clears a failed save's reasons. */
  private edit(id: string, change: (draft: ImportDraft) => DraftChanges | null): void {
    if (this.snapshot.saving) return;
    const draft = this.live(id);
    if (!draft) return;
    const changes = change(draft);
    if (changes) this.patch(id, { ...changes, save: { status: 'idle' } });
  }

  private patch(id: string, changes: DraftChanges): void {
    this.update({ drafts: this.snapshot.drafts.map((d) => (d.id === id ? { ...d, ...changes } : d)) });
  }

  private update(changes: Partial<ImportSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    for (const listener of [...this.listeners]) listener();
  }

  private async release(draft: ImportDraft): Promise<void> {
    if (this.released.has(draft.id)) return;
    this.released.add(draft.id);
    await discardQuietly(this.deps.addItem.temporaryFiles, draft.photo.uri);
  }

  private async releaseAll(): Promise<void> {
    const drafts = this.snapshot.drafts;
    this.update({ drafts: [] });
    for (const draft of drafts) await this.release(draft);
  }
}

/** The start of an import: the session, and how many photos were left out. */
export interface StartedImport {
  session: ImportSession;
  /** Photos the picker returned (before the limit and duplicates). */
  pickedCount: number;
}

/**
 * Applies the limit (D10) and the duplicate check to a picker result,
 * deletes the temporary copies of the photos left out, and creates the
 * session (not started). Returns null when no photo is left.
 */
export async function beginImport(
  photos: readonly PickedLibraryPhoto[],
  deps: ImportSessionDeps,
  limit: number = IMPORT_PHOTO_LIMIT,
): Promise<StartedImport | null> {
  const selection = selectImportPhotos(photos, limit);
  const keptUris = new Set(selection.kept.map((p) => p.uri));
  for (const photo of [...selection.overLimit, ...selection.duplicates]) {
    if (!keptUris.has(photo.uri)) await discardQuietly(deps.addItem.temporaryFiles, photo.uri);
  }
  if (selection.kept.length === 0) return null;
  return {
    session: new ImportSession(selection.kept, deps, describeImportSelection(selection, limit)),
    pickedCount: photos.length,
  };
}

/**
 * Holds the import being reviewed, shared by the review and draft screens.
 * One at a time: beginning a new one discards the previous one. In memory
 * only, so nothing survives the app being killed.
 */
export class ImportSessions {
  private session: ImportSession | null = null;

  get current(): ImportSession | null {
    return this.session;
  }

  begin(session: ImportSession): void {
    const previous = this.session;
    this.session = session;
    if (previous && previous !== session) void previous.discard();
  }

  /** Discards `session` and forgets it if it is the current one. */
  async end(session: ImportSession): Promise<void> {
    if (this.session === session) this.session = null;
    await session.discard();
  }
}
