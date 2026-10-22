/**
 * Camera permission flow for the Add and Edit screens (slice 5). Pure: the
 * view state is a function of the permission the OS reports and what the
 * user did. No platform code here; `CameraAccessFlow` (data) runs it.
 *
 * - undetermined: an explanation ("intro") with one button that triggers the
 *   real system prompt, plus "Not now". There is no fake "Don't Allow".
 * - granted: "Take photo" opens the camera. The camera only ever opens because
 *   the user tapped "Take photo" (directly, or by allowing access in the intro
 *   that the tap opened). Entering a screen never opens it.
 * - denied: an in-flow panel saying camera access is off. If the OS can ask
 *   again (Android after one refusal), the panel offers the real prompt;
 *   otherwise (iOS, or Android "don't ask again") it offers Settings.
 * - "Choose from photo library" is offered on every surface.
 */

export type CameraPermissionStatus = 'granted' | 'denied' | 'undetermined';

/** What the OS reports about camera permission. */
export interface CameraPermission {
  status: CameraPermissionStatus;
  /** False once only the system Settings app can grant access. */
  canAskAgain: boolean;
}

/** What is on screen for camera access: nothing, the intro modal, or the denied panel. */
export type CameraSurface = 'none' | 'intro' | 'denied';

export interface CameraAccessState {
  /** Null until the first check finishes. */
  permission: CameraPermission | null;
  surface: CameraSurface;
  /** True while the system prompt is up. */
  requesting: boolean;
  /** True if a "Take photo" tap opened the surface and is waiting on it. */
  pendingTake: boolean;
  /** The screen asked to prompt on entry and is waiting for the first check. */
  entryPromptWaiting: boolean;
}

export const INITIAL_CAMERA_ACCESS: CameraAccessState = Object.freeze({
  permission: null,
  surface: 'none',
  requesting: false,
  pendingTake: false,
  entryPromptWaiting: false,
});

export type CameraAccessEvent =
  /** A permission check finished (first check, app back in the foreground). */
  | { type: 'checked'; permission: CameraPermission }
  /**
   * The user entered the scan flow (the Add screen). `allowed` is false when
   * the entry prompt was already shown this app session.
   */
  | { type: 'entered'; allowed: boolean }
  /** The user tapped "Take photo"; `permission` was checked just now. */
  | { type: 'take-tapped'; permission: CameraPermission }
  /** The system prompt is being shown. */
  | { type: 'request-started' }
  | { type: 'request-finished'; permission: CameraPermission }
  /** The camera picker itself reported the permission refused (a race with Settings). */
  | { type: 'camera-refused'; permission: CameraPermission }
  /** "Not now" (or the modal's close gesture). */
  | { type: 'dismissed' }
  /** "Choose from photo library" on a surface. */
  | { type: 'library-chosen' };

/**
 * What the runner must do after an event:
 * - 'launch-camera': open the camera for the pending "Take photo" tap.
 * - 'pick-library': open the photo library instead.
 * - 'end-take': the pending tap ends without a photo.
 * - 'entry-prompt-shown': remember that this session's entry prompt was used.
 */
export type CameraAccessEffect = 'launch-camera' | 'pick-library' | 'end-take' | 'entry-prompt-shown' | null;

export interface CameraAccessStep {
  state: CameraAccessState;
  effect: CameraAccessEffect;
}

/** The surface that fits a permission that is not granted. */
function surfaceFor(permission: CameraPermission): CameraSurface {
  if (permission.status === 'granted') return 'none';
  return permission.status === 'undetermined' ? 'intro' : 'denied';
}

export function cameraAccessReducer(state: CameraAccessState, event: CameraAccessEvent): CameraAccessStep {
  switch (event.type) {
    case 'checked': {
      const { permission } = event;
      let next: CameraAccessState = { ...state, permission };
      if (state.entryPromptWaiting) {
        next = { ...next, entryPromptWaiting: false };
        if (permission.status !== 'granted') {
          return { state: { ...next, surface: surfaceFor(permission) }, effect: 'entry-prompt-shown' };
        }
        return { state: next, effect: null };
      }
      if (state.surface === 'none' || state.requesting) return { state: next, effect: null };
      // A surface is up and the permission changed underneath it (e.g. back from Settings).
      if (permission.status === 'granted') {
        // Never open the camera on return from Settings: the user taps "Take photo" again.
        return {
          state: { ...next, surface: 'none', pendingTake: false },
          effect: state.pendingTake ? 'end-take' : null,
        };
      }
      return { state: { ...next, surface: surfaceFor(permission) }, effect: null };
    }
    case 'entered': {
      if (!event.allowed || state.surface !== 'none') return { state, effect: null };
      if (state.permission === null) return { state: { ...state, entryPromptWaiting: true }, effect: null };
      if (state.permission.status === 'granted') return { state, effect: null };
      return { state: { ...state, surface: surfaceFor(state.permission) }, effect: 'entry-prompt-shown' };
    }
    case 'take-tapped': {
      const { permission } = event;
      // An entry prompt still waiting for its check is covered by this tap.
      const base = { ...state, permission, entryPromptWaiting: false, requesting: false };
      if (permission.status === 'granted') {
        return { state: { ...base, surface: 'none', pendingTake: false }, effect: 'launch-camera' };
      }
      return { state: { ...base, surface: surfaceFor(permission), pendingTake: true }, effect: null };
    }
    case 'request-started':
      if (state.surface === 'none' || state.requesting) return { state, effect: null };
      return { state: { ...state, requesting: true }, effect: null };
    case 'request-finished': {
      const { permission } = event;
      const next = { ...state, permission, requesting: false };
      if (permission.status === 'granted') {
        // Allowing access after a "Take photo" tap continues to the camera; after the entry prompt it does not.
        return {
          state: { ...next, surface: 'none', pendingTake: false },
          effect: state.pendingTake ? 'launch-camera' : null,
        };
      }
      return { state: { ...next, surface: surfaceFor(permission) }, effect: null };
    }
    case 'camera-refused': {
      const permission: CameraPermission =
        event.permission.status === 'granted' ? { status: 'denied', canAskAgain: event.permission.canAskAgain } : event.permission;
      return { state: { ...state, permission, surface: surfaceFor(permission), requesting: false }, effect: null };
    }
    case 'dismissed':
      if (state.surface === 'none') return { state, effect: null };
      return {
        state: { ...state, surface: 'none', requesting: false, pendingTake: false },
        effect: state.pendingTake ? 'end-take' : null,
      };
    case 'library-chosen':
      return {
        state: { ...state, surface: 'none', requesting: false, pendingTake: false },
        effect: 'pick-library',
      };
  }
}

/** What the denied panel's main button does: ask again (Android, when allowed) or open Settings. */
export function deniedPanelAction(permission: CameraPermission | null): 'ask-again' | 'open-settings' {
  return permission?.canAskAgain ? 'ask-again' : 'open-settings';
}

/** Copy for the intro modal and the denied panel. */
export const CAMERA_ACCESS_TEXT = Object.freeze({
  introTitle: 'Photograph your clothes',
  introBody:
    'Spotlight uses the camera so you can take a photo of each item for your closet. Photos are saved on this device. To suggest details, a smaller copy without location data is sent to our server and to Claude (Anthropic). You can also choose photos from your library instead.',
  introAllow: 'Continue',
  notNow: 'Not now',
  library: 'Choose from photo library',
  deniedTitle: 'Camera access is off',
  deniedBodySettings:
    'To take photos of your clothes, turn on Camera for Spotlight in Settings. You can still choose photos from your library.',
  deniedBodyAskAgain:
    'To take photos of your clothes, Spotlight needs camera access. You can still choose photos from your library.',
  openSettings: 'Open Settings',
  askAgain: 'Allow camera access',
});
