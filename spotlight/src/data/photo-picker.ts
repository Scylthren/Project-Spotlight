/** A photo the user picked or took. `uri` points at a temporary copy. */
export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

/** Where the photo comes from: the device's photo library or its camera. */
export type PhotoSource = 'library' | 'camera';

export type PickPhotoResult =
  | { status: 'picked'; photo: PickedPhoto }
  | { status: 'cancelled' }
  /** The user (or a device policy) refused access. If `canAskAgain` is false, only Settings can fix it. */
  | { status: 'permission-denied'; canAskAgain: boolean }
  | { status: 'error'; message: string };

/** Lets the user choose one photo from the library or take one with the camera. */
export interface PhotoPicker {
  pick(source: PhotoSource): Promise<PickPhotoResult>;
}

/**
 * Mock `PhotoPicker` that returns queued results in order, then 'cancelled'.
 * `calls` records the source of every call.
 */
export class QueuedPhotoPicker implements PhotoPicker {
  readonly calls: PhotoSource[] = [];

  constructor(private readonly results: PickPhotoResult[] = []) {}

  async pick(source: PhotoSource): Promise<PickPhotoResult> {
    this.calls.push(source);
    return this.results.shift() ?? { status: 'cancelled' };
  }
}

/** A photo picked from the library in a multi-select import. */
export interface PickedLibraryPhoto extends PickedPhoto {
  /** The library's id for the photo, or null when the picker gives none (used to spot a photo chosen twice). */
  assetId: string | null;
}

export type PickManyResult =
  | { status: 'picked'; photos: PickedLibraryPhoto[] }
  | { status: 'cancelled' }
  | { status: 'permission-denied'; canAskAgain: boolean }
  | { status: 'error'; message: string };

/**
 * Lets the user choose several photos from the library at once (Gate 2
 * slice 6). `limit` is passed to the system picker where it supports one;
 * callers must still enforce it, since some pickers ignore it.
 */
export interface MultiPhotoPicker {
  pickMany(limit: number): Promise<PickManyResult>;
}

/** Mock `MultiPhotoPicker`: returns queued results in order, then 'cancelled'. `calls` records each limit. */
export class QueuedMultiPhotoPicker implements MultiPhotoPicker {
  readonly calls: number[] = [];

  constructor(private readonly results: PickManyResult[] = []) {}

  async pickMany(limit: number): Promise<PickManyResult> {
    this.calls.push(limit);
    return this.results.shift() ?? { status: 'cancelled' };
  }
}

/** What the form should show after a pick attempt that did not produce a photo. */
export interface PickProblem {
  message: string;
  /** True if the fix is in the system Settings app (permission permanently denied). */
  suggestSettings: boolean;
}

/**
 * User-facing message for a failed pick, or null for 'picked' and 'cancelled'
 * (cancelling is not a problem; the form keeps its current photo).
 */
export function describePickProblem(result: PickPhotoResult | PickManyResult, source: PhotoSource): PickProblem | null {
  const what = source === 'camera' ? 'camera' : 'photos';
  switch (result.status) {
    case 'picked':
    case 'cancelled':
      return null;
    case 'permission-denied':
      return result.canAskAgain
        ? {
            message: `Spotlight needs access to your ${what} for this. Try again and choose Allow.`,
            suggestSettings: false,
          }
        : {
            message: `Spotlight is not allowed to use your ${what}. You can turn on access for Spotlight in Settings.`,
            suggestSettings: true,
          };
    case 'error':
      return {
        message:
          source === 'camera'
            ? `Could not open the camera: ${result.message}`
            : `Could not open your photos: ${result.message}`,
        suggestSettings: false,
      };
  }
}
