/**
 * Rules for importing several photos at once (Gate 2 slice 6, D9 and D10).
 * One photo becomes one item (D9); one import takes at most
 * IMPORT_PHOTO_LIMIT photos (D10). Plain TypeScript, no Expo imports.
 */

/** D10: at most this many photos per import. */
export const IMPORT_PHOTO_LIMIT = 20;

/** The fields of a picked photo these rules look at. */
export interface ImportCandidate {
  /** Temporary copy made by the picker. Empty when the picker gave none. */
  uri: string;
  /** The library's id for the photo, when the picker reports one (iOS, most Android pickers). */
  assetId?: string | null;
}

/** Which picked photos an import keeps, and which it leaves out and why. */
export interface ImportSelection<T extends ImportCandidate> {
  /** In the order the picker returned them, at most `limit`. */
  kept: T[];
  /** Readable, new photos beyond the limit (the last ones returned). */
  overLimit: T[];
  /** Photos with the same library id as an earlier one in this batch. */
  duplicates: T[];
  /** Photos the picker returned without a file. */
  unreadable: T[];
}

/**
 * Splits a picker result into the photos to import and the ones left out.
 * Order is kept as returned (iOS returns the selection order; Android
 * pickers may not, and nothing here reorders them). Duplicates are detected
 * by library id only; photos without one are never treated as duplicates.
 * Duplicates and unreadable photos do not count towards the limit.
 */
export function selectImportPhotos<T extends ImportCandidate>(
  photos: readonly T[],
  limit: number = IMPORT_PHOTO_LIMIT,
): ImportSelection<T> {
  const selection: ImportSelection<T> = { kept: [], overLimit: [], duplicates: [], unreadable: [] };
  const seen = new Set<string>();
  for (const photo of photos) {
    if (!photo.uri) {
      selection.unreadable.push(photo);
      continue;
    }
    if (photo.assetId) {
      if (seen.has(photo.assetId)) {
        selection.duplicates.push(photo);
        continue;
      }
      seen.add(photo.assetId);
    }
    (selection.kept.length < limit ? selection.kept : selection.overLimit).push(photo);
  }
  return selection;
}

function photos(count: number): string {
  return count === 1 ? '1 photo' : `${count} photos`;
}

/**
 * What the review screen says about photos left out of the import, one
 * sentence per reason, or [] when every photo was kept.
 */
export function describeImportSelection(
  selection: { kept: readonly unknown[]; overLimit: readonly unknown[]; duplicates: readonly unknown[]; unreadable: readonly unknown[] },
  limit: number = IMPORT_PHOTO_LIMIT,
): string[] {
  const lines: string[] = [];
  if (selection.overLimit.length > 0) {
    lines.push(
      `One import takes up to ${limit} photos. The first ${selection.kept.length} are here; ${
        selection.overLimit.length === 1 ? 'the last one was' : `the other ${selection.overLimit.length} were`
      } left out. Import ${selection.overLimit.length === 1 ? 'it' : 'them'} next.`,
    );
  }
  if (selection.duplicates.length > 0) {
    lines.push(`${photos(selection.duplicates.length)} chosen twice ${selection.duplicates.length === 1 ? 'was' : 'were'} added once.`);
  }
  if (selection.unreadable.length > 0) {
    lines.push(`${photos(selection.unreadable.length)} could not be read and ${selection.unreadable.length === 1 ? 'was' : 'were'} left out.`);
  }
  return lines;
}
