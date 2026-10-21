/**
 * TEST-ONLY temp directory helpers via Node built-ins. Typed locally because
 * the app's tsconfig deliberately does not load Node's global types.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs') as {
  mkdtempSync(prefix: string): string;
  rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
};
const os = require('node:os') as { tmpdir(): string };
const path = require('node:path') as { join(...parts: string[]): string };
/* eslint-enable @typescript-eslint/no-require-imports */

export function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export const joinPath = path.join;
