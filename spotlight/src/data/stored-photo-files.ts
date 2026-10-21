/**
 * Byte-level access to the stored photo files in `closet-images/`, for
 * maintenance tasks that rewrite photos in place (see
 * photo-metadata-backfill.ts). Separate from `ImageStore`, whose contract is
 * "never overwrite"; only maintenance code uses this.
 *
 * Every `name` is a bare file name inside the directory (no slashes); see
 * `isSafeFileName`. Implementations reject anything else.
 *
 * Implementations: `MemoryStoredPhotoFiles` (tests) and `ExpoStoredPhotoFiles`.
 */
export interface StoredPhotoFiles {
  /** Names of the files directly inside the directory. Empty if it does not exist. */
  list(): Promise<string[]>;
  exists(name: string): Promise<boolean>;
  read(name: string): Promise<Uint8Array>;
  /** Creates `name`, or replaces its contents, with `bytes`. */
  write(name: string, bytes: Uint8Array): Promise<void>;
  /**
   * Moves `from` onto `to`, replacing `to` if it exists. NOT atomic: it
   * deletes `to` first, then renames, and on Android may fall back to copying
   * then deleting `from` (see photo-metadata-backfill.ts for the native code).
   * A crash can leave only `from`, or `from` plus a partial `to`; callers
   * must recover from both.
   */
  replace(from: string, to: string): Promise<void>;
  /** Deletes `name`. No-op if it does not exist. */
  remove(name: string): Promise<void>;
}

const SAFE_FILE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

/** True for a plain file name: no slashes, no `..`, not hidden. */
export function isSafeFileName(name: string): boolean {
  return SAFE_FILE_NAME.test(name) && !name.includes('..');
}

export function assertSafeFileName(name: string): void {
  if (!isSafeFileName(name)) throw new Error(`unsafe stored photo file name: ${name}`);
}

type Operation = 'list' | 'exists' | 'read' | 'write' | 'replace' | 'remove';

/** Points inside `replace` where a crash can happen. */
export type ReplaceStage = 'destination-deleted' | 'half-copied' | 'copied';

/**
 * Mock `StoredPhotoFiles` over a Map. `replace` follows expo-file-system's
 * overwrite move: delete `to`, then either rename (`moveModel: 'rename'`,
 * iOS and Android's normal path) or copy then delete `from`
 * (`moveModel: 'copy'`, Android's fallback). `failWhen` makes a matching
 * call throw before it changes anything. `crashInsideReplace` throws at a
 * stage inside `replace`, leaving the files as a crash there would.
 * `dropWritesTo` makes writes to a name report success without changing
 * anything.
 */
export class MemoryStoredPhotoFiles implements StoredPhotoFiles {
  readonly files = new Map<string, Uint8Array>();
  readonly calls: string[] = [];
  moveModel: 'rename' | 'copy' = 'rename';
  failWhen: ((operation: Operation, name: string) => boolean) | null = null;
  crashInsideReplace: ((stage: ReplaceStage, from: string, to: string) => boolean) | null = null;
  dropWritesTo = new Set<string>();

  constructor(initial: Record<string, Uint8Array> = {}) {
    for (const [name, bytes] of Object.entries(initial)) this.files.set(name, bytes.slice());
  }

  /** Records the call, then throws if `failWhen` matches. `name` is the file the call acts on (`from` for replace). */
  private check(operation: Operation, name: string, label = `${operation} ${name}`): void {
    if (operation !== 'list') assertSafeFileName(name);
    this.calls.push(label.trim());
    if (this.failWhen?.(operation, name)) throw new Error(`${operation} ${name} failed`);
  }

  async list(): Promise<string[]> {
    this.check('list', '');
    return [...this.files.keys()];
  }

  async exists(name: string): Promise<boolean> {
    this.check('exists', name);
    return this.files.has(name);
  }

  async read(name: string): Promise<Uint8Array> {
    this.check('read', name);
    const bytes = this.files.get(name);
    if (!bytes) throw new Error(`ENOENT ${name}`);
    return bytes.slice();
  }

  async write(name: string, bytes: Uint8Array): Promise<void> {
    this.check('write', name);
    if (!this.dropWritesTo.has(name)) this.files.set(name, bytes.slice());
  }

  async replace(from: string, to: string): Promise<void> {
    assertSafeFileName(to);
    this.check('replace', from, `replace ${from} -> ${to}`);
    const bytes = this.files.get(from);
    if (!bytes) throw new Error(`ENOENT ${from}`);
    const crash = (stage: ReplaceStage) => {
      if (this.crashInsideReplace?.(stage, from, to)) throw new Error(`crashed while replacing (${stage})`);
    };
    this.files.delete(to);
    crash('destination-deleted');
    if (this.moveModel === 'copy') {
      this.files.set(to, bytes.slice(0, Math.floor(bytes.length / 2)));
      crash('half-copied');
      this.files.set(to, bytes.slice());
      crash('copied');
      this.files.delete(from);
    } else {
      this.files.delete(from);
      this.files.set(to, bytes);
    }
  }

  async remove(name: string): Promise<void> {
    this.check('remove', name);
    this.files.delete(name);
  }
}
