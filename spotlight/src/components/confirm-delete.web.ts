/** Web fallback for confirm-delete.ts: the browser's own confirm dialog. */
export const DELETE_ITEM_DETAIL = 'This cannot be undone.';

export function confirmDelete(what: string, detail: string = DELETE_ITEM_DETAIL): Promise<boolean> {
  const ask = (globalThis as { confirm?: (message: string) => boolean }).confirm;
  return Promise.resolve(ask ? ask(`Delete ${what}? ${detail}`) : false);
}
