import { applyDetectedColors, type ItemColor } from '@/core';

import { FrontPhotoColorDetection, type DetectOptions } from './detect-item-colors';
import type { GarmentIsolator } from './garment-isolator';

/** What the form gives the detection: its latest state and setters. */
export interface ColorDetectionHost {
  /** The form's latest colors. */
  colors(): readonly ItemColor[];
  /** Draft id of the current front photo, or null. */
  frontPhotoId(): string | null;
  setColors(colors: ItemColor[]): void;
  /** Opens the color matrix with a notice. Only called when no sheet is in the way. */
  openMatrix(notice: string): void;
  setDetecting(detecting: boolean): void;
  /** False once the form has closed. */
  isActive(): boolean;
}

/**
 * Something that must not have the color matrix opened over it:
 * - 'picker': the system photo picker (iOS refuses to present two sheets).
 * - 'camera-intro': the camera permission modal.
 * - 'save': a save in progress (the form is locked; it may reset after).
 */
export type NoticeHold = 'picker' | 'camera-intro' | 'save';

/**
 * Color detection for one item form (slice 4 logic, moved out of the hook).
 *
 * - `frontPhotoPicked` detects the new front photo's colors in the background
 *   and applies them only if that photo is still the front one, through
 *   `applyDetectedColors` (never over a user's change).
 * - `userChangedColors` records that the user touched the colors since the
 *   front photo was picked, so a running detection cannot undo it (e.g. a
 *   deselect that left only auto colors).
 * - A notice that would open the matrix while something holds it (`hold`) is
 *   kept and shown once the last hold is released, unless it was dropped.
 * - `detecting` is true from a pick until its own result arrives; a newer
 *   pick or `reset` takes over the flag.
 * - `taggerColors` (Gate 2, D7): colors suggested by the tagger for the
 *   current front photo replace the on-device guess, unless the user changed
 *   the colors. After that, the on-device result for the same photo (and its
 *   notice) is ignored; it stays the fallback when the tagger gives none.
 */
export class FormColorDetection {
  private readonly detection: FrontPhotoColorDetection;
  private readonly holds = new Set<NoticeHold>();
  private heldNotice: string | null = null;
  private userTouched = false;
  /** The front photo draft whose colors came from the tagger, or null. */
  private taggerColorsFor: string | null = null;

  constructor(
    isolator: GarmentIsolator,
    private readonly host: ColorDetectionHost,
    options: DetectOptions = {},
  ) {
    this.detection = new FrontPhotoColorDetection(isolator, options);
  }

  /** Detects the colors of front photo draft `id`. Resolves when done; never rejects. */
  async frontPhotoPicked(id: string, uri: string): Promise<void> {
    this.userTouched = false;
    this.taggerColorsFor = null;
    this.host.setDetecting(true);
    const detected = await this.detection.run(id, uri);
    if (detected === null || !this.host.isActive()) return; // superseded or cancelled; whoever did that owns the flag
    this.host.setDetecting(false);
    if (this.host.frontPhotoId() !== id) return;
    if (this.taggerColorsFor === id) return; // the tagger's colors won (D7)
    const applied = applyDetectedColors(this.host.colors(), detected, { userTouched: this.userTouched });
    if (applied) this.apply(applied.colors, applied.notice);
  }

  /**
   * The tagger suggested `colors` (source 'auto', most prominent first) for
   * front photo draft `id`. Applied without a notice when that photo is still
   * the front and the user has not touched the colors; any notice kept from
   * the on-device guess is dropped. Ignored otherwise, or when empty.
   */
  taggerColors(id: string, colors: readonly ItemColor[]): void {
    if (!this.host.isActive() || colors.length === 0 || this.host.frontPhotoId() !== id) return;
    if (this.userTouched || this.host.colors().some((c) => c.source === 'user')) return;
    this.taggerColorsFor = id;
    this.heldNotice = null;
    this.apply(colors.map((c) => ({ ...c, source: 'auto' })), null);
  }

  /** The user picked, removed, or reordered a color. */
  userChangedColors(): void {
    this.userTouched = true;
  }

  /** Sets colors without touching anything else, and opens the matrix with `notice` when there is one. */
  apply(colors: ItemColor[], notice: string | null): void {
    if (!this.host.isActive()) return;
    this.host.setColors(colors.map((c) => ({ ...c })));
    if (notice) this.showNotice(notice);
  }

  hold(reason: NoticeHold): void {
    this.holds.add(reason);
  }

  /** Ends a hold. The kept notice shows when no hold is left, or is dropped if `drop`. */
  release(reason: NoticeHold, { drop = false }: { drop?: boolean } = {}): void {
    this.holds.delete(reason);
    if (drop) this.heldNotice = null;
    if (this.holds.size > 0 || this.heldNotice === null) return;
    const notice = this.heldNotice;
    this.heldNotice = null;
    if (this.host.isActive()) this.host.openMatrix(notice);
  }

  isHeld(reason?: NoticeHold): boolean {
    return reason ? this.holds.has(reason) : this.holds.size > 0;
  }

  /** The form was cleared: drops running detection and any kept notice. Holds stay (they track real UI). */
  reset(): void {
    this.detection.cancel();
    this.heldNotice = null;
    this.userTouched = false;
    this.taggerColorsFor = null;
    if (this.host.isActive()) this.host.setDetecting(false);
  }

  /** The form closed. */
  cancel(): void {
    this.detection.cancel();
    this.heldNotice = null;
  }

  private showNotice(notice: string): void {
    if (this.holds.size > 0) this.heldNotice = notice;
    else this.host.openMatrix(notice);
  }
}
