/** The question asked before an import with unsaved photos is discarded. */
export function discardImportText(remaining: number): { title: string; detail: string } {
  const unsaved = remaining === 1 ? '1 photo has' : `${remaining} photos have`;
  return {
    title: 'Discard the import?',
    detail: `${unsaved} not been saved and will be dropped. Pieces you already saved stay in your closet.`,
  };
}
