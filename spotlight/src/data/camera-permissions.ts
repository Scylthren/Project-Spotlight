import type { CameraPermission } from '@/core';

/**
 * Camera permission as the OS reports it. Never rejects: a failed check
 * resolves to a best guess (see the real implementation).
 *
 * Implementations: `FakeCameraPermissions` (tests) and
 * `ExpoCameraPermissions` (expo-image-picker plus Linking).
 */
export interface CameraPermissions {
  /** Current permission, without prompting. */
  check(): Promise<CameraPermission>;
  /** Shows the real system prompt if the OS still can; resolves to the result. */
  request(): Promise<CameraPermission>;
  /** Opens this app's page in the system Settings app. */
  openSettings(): Promise<void>;
}

/**
 * Configurable `CameraPermissions` for tests. `current` is what `check`
 * returns; `request` takes the next queued outcome (or a function to await),
 * stores it as `current`, and returns it. With an empty queue a request
 * returns `current` unchanged (like an OS that will not ask again).
 */
export class FakeCameraPermissions implements CameraPermissions {
  current: CameraPermission;
  readonly requests: (CameraPermission | (() => Promise<CameraPermission>))[] = [];
  checks = 0;
  requestCalls = 0;
  settingsOpened = 0;

  constructor(current: CameraPermission = { status: 'undetermined', canAskAgain: true }) {
    this.current = current;
  }

  async check(): Promise<CameraPermission> {
    this.checks++;
    return { ...this.current };
  }

  async request(): Promise<CameraPermission> {
    this.requestCalls++;
    const next = this.requests.shift();
    if (next) this.current = typeof next === 'function' ? await next() : next;
    return { ...this.current };
  }

  async openSettings(): Promise<void> {
    this.settingsOpened++;
  }
}

/**
 * Remembers, for one app session (module lifetime), whether the scan flow's
 * entry prompt was already shown. "Not now" therefore hides it until the app
 * is restarted; tapping "Take photo" still shows it any time.
 */
export class EntryPromptSession {
  shown = false;
}
