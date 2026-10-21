import {
  cameraAccessReducer,
  INITIAL_CAMERA_ACCESS,
  type CameraAccessEffect,
  type CameraAccessEvent,
  type CameraAccessState,
  type CameraPermission,
  type PhotoTarget,
} from '@/core';

import type { CameraPermissions, EntryPromptSession } from './camera-permissions';
import type { PhotoSource } from './photo-picker';

/** What a pick produced: the new draft id (or null), and the permission if the camera refused it. */
export interface CameraFlowPick {
  id: string | null;
  cameraRefused?: CameraPermission;
}

export interface CameraAccessHost {
  /** Opens the camera or library for `target` (the form's guarded picker). */
  pick(source: PhotoSource, target: PhotoTarget): Promise<CameraFlowPick>;
  /** Where a library photo goes when no "Take photo" tap is waiting (the entry prompt). */
  defaultTarget(): PhotoTarget;
  /** The intro modal appeared (true) or finished closing (false). Sheets must wait for false. */
  onIntroVisible?(visible: boolean): void;
}

export interface CameraAccessFlowOptions {
  /**
   * How long to wait for the intro modal to report it has closed before
   * opening a picker anyway. iOS cannot present the picker while the modal
   * is still animating away; the modal reports `introClosed` when done.
   */
  introCloseTimeoutMs?: number;
}

interface PendingTake {
  target: PhotoTarget;
  resolve: (id: string | null) => void;
}

/**
 * Runs the camera permission flow (rules in core/camera-access.ts) for one
 * form. Screens subscribe to `getState`; buttons call the methods. Never
 * throws into the UI.
 *
 * `takePhoto` resolves once the tap's flow ends: to the new draft id after a
 * camera or library photo, or null ("Not now", access turned on in Settings,
 * cancelled, or replaced by another tap).
 */
export class CameraAccessFlow {
  private state: CameraAccessState = INITIAL_CAMERA_ACCESS;
  private readonly listeners = new Set<() => void>();
  private pending: PendingTake | null = null;
  /** Bumped by every check, so an older check finishing late is ignored. */
  private checkSeq = 0;
  /** True from the intro appearing until it has finished closing. */
  private introOnScreen = false;
  /** Work waiting for the intro to finish closing. */
  private afterIntro: (() => void) | null = null;
  private introTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly introCloseTimeoutMs: number;

  constructor(
    private readonly permissions: CameraPermissions,
    private readonly session: EntryPromptSession,
    private host: CameraAccessHost,
    { introCloseTimeoutMs = 1000 }: CameraAccessFlowOptions = {},
  ) {
    this.introCloseTimeoutMs = introCloseTimeoutMs;
  }

  getState = (): CameraAccessState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Re-reads the permission (first mount, app back in the foreground). */
  async check(): Promise<void> {
    const seq = ++this.checkSeq;
    const permission = await this.permissions.check();
    if (seq !== this.checkSeq || this.disposed) return;
    this.dispatch({ type: 'checked', permission });
  }

  /** The user entered the scan flow: show the entry prompt if needed (once per app session). */
  enter(): void {
    this.dispatch({ type: 'entered', allowed: !this.session.shown });
  }

  /** "Take photo" for `target`. */
  async takePhoto(target: PhotoTarget): Promise<string | null> {
    this.endPending();
    this.checkSeq++; // a check still running is older than this one; drop it
    const permission = await this.permissions.check();
    if (this.disposed) return null;
    return new Promise<string | null>((resolve) => {
      this.pending = { target, resolve };
      this.dispatch({ type: 'take-tapped', permission });
    });
  }

  /** The intro's main button, or the denied panel's "Allow camera access": shows the real system prompt. */
  async allow(): Promise<void> {
    if (this.state.surface === 'none' || this.state.requesting) return;
    this.dispatch({ type: 'request-started' });
    const permission = await this.permissions.request();
    if (this.disposed) return;
    this.checkSeq++; // drop checks that started before the prompt answered
    this.dispatch({ type: 'request-finished', permission });
  }

  /** "Not now". */
  notNow(): void {
    this.dispatch({ type: 'dismissed' });
  }

  /** "Choose from photo library" on the intro or the denied panel. */
  chooseLibrary(): void {
    if (this.state.surface === 'none') return;
    this.dispatch({ type: 'library-chosen' });
  }

  openSettings(): Promise<void> {
    return this.permissions.openSettings();
  }

  /** The intro modal has finished closing (iOS `onDismiss`; right after hiding elsewhere). */
  introClosed(): void {
    if (this.state.surface === 'intro' || !this.introOnScreen) return;
    this.finishIntroClose();
  }

  /** Replaces the host (a React hook passes its latest callbacks after each render). */
  setHost(host: CameraAccessHost): void {
    this.host = host;
  }

  /** (Re)starts the flow after `dispose` (React Strict Mode runs effects twice in development). */
  start(): void {
    this.disposed = false;
  }

  /** The form closed: ends a waiting tap and drops late results. */
  dispose(): void {
    this.disposed = true;
    if (this.introTimer) clearTimeout(this.introTimer);
    this.introTimer = null;
    this.afterIntro = null;
    this.introOnScreen = false;
    this.endPending();
  }

  private dispatch(event: CameraAccessEvent): void {
    if (this.disposed) return;
    const before = this.state.surface;
    const step = cameraAccessReducer(this.state, event);
    this.state = step.state;
    const after = this.state.surface;
    if (after === 'intro' && !this.introOnScreen) {
      this.introOnScreen = true;
      this.host.onIntroVisible?.(true);
    }
    const leavingIntro = before === 'intro' && after !== 'intro';
    if (leavingIntro) this.startIntroClose();
    this.runEffect(step.effect, leavingIntro);
    for (const listener of [...this.listeners]) listener();
  }

  private runEffect(effect: CameraAccessEffect, afterIntroCloses: boolean): void {
    switch (effect) {
      case null:
        return;
      case 'entry-prompt-shown':
        this.session.shown = true;
        return;
      case 'end-take':
        this.endPending();
        return;
      case 'launch-camera':
      case 'pick-library': {
        const source: PhotoSource = effect === 'launch-camera' ? 'camera' : 'library';
        const take = this.pending;
        this.pending = null;
        const target = take?.target ?? this.host.defaultTarget();
        const open = () => void this.pick(source, target, take);
        if (afterIntroCloses) this.afterIntro = open;
        else open();
        return;
      }
    }
  }

  private async pick(source: PhotoSource, target: PhotoTarget, take: PendingTake | null): Promise<void> {
    let result: CameraFlowPick = { id: null };
    try {
      result = await this.host.pick(source, target);
    } catch (error) {
      console.warn('Photo pick failed', error);
    }
    if (result.cameraRefused && !this.disposed) {
      this.dispatch({ type: 'camera-refused', permission: result.cameraRefused });
    }
    take?.resolve(result.id);
  }

  private startIntroClose(): void {
    if (this.introTimer) clearTimeout(this.introTimer);
    this.introTimer = setTimeout(() => this.finishIntroClose(), this.introCloseTimeoutMs);
  }

  private finishIntroClose(): void {
    if (this.introTimer) clearTimeout(this.introTimer);
    this.introTimer = null;
    if (!this.introOnScreen) return;
    this.introOnScreen = false;
    const action = this.afterIntro;
    this.afterIntro = null;
    if (this.disposed) return;
    this.host.onIntroVisible?.(false);
    action?.();
  }

  private endPending(): void {
    const take = this.pending;
    this.pending = null;
    take?.resolve(null);
  }
}
