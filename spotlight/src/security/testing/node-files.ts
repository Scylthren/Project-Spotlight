/**
 * TEST-ONLY file and process helpers via Node built-ins, for the secret
 * scan and the contract drift test. Typed locally because the app's tsconfig
 * deliberately does not load Node's global types.
 */

// Provided by Jest's CommonJS module wrapper.
declare const __dirname: string;

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs') as {
  existsSync(path: string): boolean;
  readFileSync(path: string): Uint8Array;
  readFileSync(path: string, encoding: 'utf8'): string;
  statSync(path: string): { size: number };
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean; isFile(): boolean }[];
  writeFileSync(path: string, data: string | Uint8Array): void;
  mkdirSync(path: string, options?: { recursive: boolean }): void;
};
const childProcess = require('node:child_process') as {
  execFileSync(file: string, args: string[], options: { cwd: string; encoding?: 'utf8'; stdio?: 'ignore' }): string;
};
const path = require('node:path') as { join(...parts: string[]): string };
/* eslint-enable @typescript-eslint/no-require-imports */

/** The repository root (`spotlight/..`). */
export const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');

export const joinPath = path.join;
export const fileExists = fs.existsSync;
export const fileSize = (file: string) => fs.statSync(file).size;
export const readBytes = (file: string): Uint8Array => fs.readFileSync(file);
export const readText = (file: string): string => fs.readFileSync(file, 'utf8');
export const writeFile = fs.writeFileSync;
export const mkdir = (dir: string) => fs.mkdirSync(dir, { recursive: true });

/** Folders the directory walk never enters (dependencies, build output, local state). */
export const WALK_SKIPPED_DIRS = ['.git', 'node_modules', '.expo', 'dist', 'web-build', 'ios', 'android', '.temp', '.branches'];

/**
 * Every file under `root` as a `/`-separated relative path, skipping
 * WALK_SKIPPED_DIRS. The fallback when git is not available; unlike git it
 * also lists ignored files such as a local `.env`, which only scans more.
 */
export function walkFiles(root: string, prefix = ''): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!WALK_SKIPPED_DIRS.includes(entry.name)) files.push(...walkFiles(root, relative));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

/** Runs `git` in the repository; returns stdout. Throws on a non-zero exit. */
export function git(args: string[]): string {
  return childProcess.execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

/** True when git ignores `repoPath` (relative to the repository root). */
export function isGitIgnored(repoPath: string): boolean {
  try {
    childProcess.execFileSync('git', ['check-ignore', '-q', repoPath], { cwd: REPO_ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** UTF-8 text to bytes and base64 / base64url, without Node's Buffer. */
export const utf8 = (text: string) => new TextEncoder().encode(text);

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    value = (value << 6) | B64.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

export const toBase64Url = (text: string) => toBase64(utf8(text)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
