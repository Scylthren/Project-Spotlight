import { discardImportText } from './discard-import-text';

/** Web fallback for confirm-discard-import.ts: the browser's own confirm dialog. */
export function confirmDiscardImport(remaining: number): Promise<boolean> {
  const text = discardImportText(remaining);
  const ask = (globalThis as { confirm?: (message: string) => boolean }).confirm;
  return Promise.resolve(ask ? ask(`${text.title} ${text.detail}`) : false);
}
