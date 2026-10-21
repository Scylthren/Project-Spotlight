/**
 * Keeps item photos on the device. Picked photos live in a temporary cache
 * the OS may clear, so they are copied into app storage on save.
 *
 * `save` returns a *stored reference*: a path relative to the app's document
 * directory (e.g. `closet-images/abc-x7k2.jpg`), not an absolute file URI. On iOS
 * the absolute container path can change across app updates, so absolute
 * URIs saved in the database would break. Call `resolveUri` to display one.
 * Values that already have a URI scheme (e.g. remote images later) pass
 * through `resolveUri` unchanged.
 *
 * Nothing here uploads or uses the network.
 */
export interface ImageStore {
  /**
   * Copies the image at `sourceUri` into app storage for `itemId`. Every call
   * creates a new, uniquely named file and never overwrites an existing one,
   * so a failed or duplicate save cannot destroy another item's photo. The
   * caller owns the returned ref and must remove it if it ends up unused.
   * `extension` (e.g. `.jpg`) names the stored file's type when the caller
   * knows it; otherwise it is taken from `sourceUri`.
   */
  save(sourceUri: string, itemId: string, extension?: string): Promise<string>;
  /** Deletes a stored image. No-op if it does not exist. */
  remove(ref: string): Promise<void>;
  /** Turns a stored reference into a URI an <Image> can load. */
  resolveUri(ref: string): string;
}

export const IMAGE_DIRECTORY = 'closet-images';

const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_EXTENSION = /^\.[a-z0-9]{1,5}$/i;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export function hasUriScheme(value: string): boolean {
  return URI_SCHEME.test(value);
}

/** Lowercased extension from a URI's last path segment, or `.jpg` if missing or odd. */
export function extensionFromUri(uri: string): string {
  const path = uri.split(/[?#]/)[0];
  const segment = path.slice(path.lastIndexOf('/') + 1);
  const dot = segment.lastIndexOf('.');
  const ext = dot > 0 ? segment.slice(dot).toLowerCase() : '';
  return SAFE_EXTENSION.test(ext) ? ext : '.jpg';
}

/**
 * Stored reference for one saved copy of an item's image:
 * `closet-images/<itemId>-<suffix><ext>`. The suffix makes each save a new
 * file name (which also stops image caches from showing a replaced photo).
 * `<ext>` is `extension` if given (lowercased), else taken from `sourceUri`.
 * Rejects ids, suffixes, or extensions that could escape the directory.
 */
export function imageRefFor(itemId: string, sourceUri: string, suffix: string, extension?: string): string {
  if (!SAFE_ID.test(itemId)) throw new Error(`unsafe item id for a file name: ${itemId}`);
  if (!SAFE_ID.test(suffix)) throw new Error(`unsafe file name suffix: ${suffix}`);
  if (extension !== undefined && !SAFE_EXTENSION.test(extension)) {
    throw new Error(`unsafe file extension: ${extension}`);
  }
  return `${IMAGE_DIRECTORY}/${itemId}-${suffix}${extension?.toLowerCase() ?? extensionFromUri(sourceUri)}`;
}

/** Random file-name-safe suffix. Uniqueness is also enforced by refusing to overwrite. */
export function randomSuffix(random: () => number = Math.random): string {
  return Array.from({ length: 10 }, () => Math.floor(random() * 36).toString(36)).join('');
}

/** True if `ref` is one of our relative references (not a URI, no traversal). */
export function isStoredRef(ref: string): boolean {
  const prefix = `${IMAGE_DIRECTORY}/`;
  return ref.startsWith(prefix) && SAFE_ID.test(ref.slice(prefix.length).replace(/\.[^.]+$/, ''));
}
