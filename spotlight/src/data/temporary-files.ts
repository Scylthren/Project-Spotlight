/**
 * Deletes temporary image files the add and edit flows created or received:
 * the photo picker's cache copy (which may still carry GPS EXIF) and the
 * processed JPEG written by `ImageProcessor`. Implementations must only ever
 * delete files inside the app's cache directory, so a URI that points at the
 * user's photo library, app storage, or anywhere else is left alone.
 *
 * Implementations: `RecordingTemporaryFiles` (tests) and `ExpoTemporaryFiles`.
 */
export interface TemporaryFiles {
  /** Deletes `uri` if it is a file in the app cache. No-op otherwise or if already gone. */
  discard(uri: string): Promise<void>;
}

export function warnDiscardError(error: unknown, uri: string): void {
  console.warn(`Could not delete temporary file ${uri}; the OS will clear it eventually.`, error);
}

/**
 * Discards `uri` and never rejects: cleanup is best effort and must not turn a
 * successful save into a failure. Errors go to `onError`.
 */
export async function discardQuietly(
  files: TemporaryFiles,
  uri: string | null | undefined,
  onError: (error: unknown, uri: string) => void = warnDiscardError,
): Promise<void> {
  if (!uri) return;
  try {
    await files.discard(uri);
  } catch (error) {
    try {
      onError(error, uri);
    } catch {
      // A failing reporter must not fail the caller either.
    }
  }
}

/**
 * True if `uri` names something strictly inside the directory `cacheUri`
 * (both `file://` URIs). Rejects `..` and `.` segments, backslashes, and any
 * percent-encoding at all (picker and manipulator file names never use it,
 * and `%2e%2e` or `%2F` could decode to a traversal), so a crafted path
 * cannot climb out of the cache.
 */
export function isInsideDirectory(uri: string, directoryUri: string): boolean {
  const base = directoryUri.endsWith('/') ? directoryUri : `${directoryUri}/`;
  if (!uri.startsWith(base) || uri.length === base.length) return false;
  const rest = uri.slice(base.length).split(/[?#]/)[0];
  if (/[%\\]/.test(rest)) return false;
  return rest.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/** Mock `TemporaryFiles`: records discarded URIs. `failNext` simulates an error. */
export class RecordingTemporaryFiles implements TemporaryFiles {
  readonly discarded: string[] = [];
  failNext: Error | null = null;

  async discard(uri: string): Promise<void> {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    this.discarded.push(uri);
  }
}
