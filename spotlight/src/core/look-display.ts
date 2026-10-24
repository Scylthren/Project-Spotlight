/**
 * How a suggested look reads on the Results screen (Results.dc.html, Gate 3
 * slice 2): its number ("01", "Look one of three"), the line naming its
 * pieces, and which photos are large (the main pieces) or small (shoes and
 * accessories). Plain data; the screen only lays it out.
 */
import { CATEGORY_LABELS } from './labels';
import type { Category, ClothingItem } from './types';

/** What a piece that is no longer in the closet is called (Gate 3 decision D5). */
export const REMOVED_PIECE_TEXT = 'Removed from closet';

/** The pieces shown large: what the look is built around, plus outerwear. */
export const MAIN_LOOK_CATEGORIES: readonly Category[] = ['top', 'bottom', 'dress', 'outerwear'];
/** The pieces a look cannot stand without: when all of them are gone, the look drops out. */
export const REQUIRED_LOOK_CATEGORIES: readonly Category[] = ['top', 'bottom', 'dress'];

/** One piece of a look: its id, its category when the look arrived, and the item now (null once deleted). */
export interface LookPiece {
  id: string;
  category: Category;
  item: ClothingItem | null;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "one" to "ten", else the digits. */
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** The big number over a look: "01". */
export function lookNumberText(position: number): string {
  return String(position).padStart(2, '0');
}

/** The label beside it: "Look one of three". */
export function lookOfText(position: number, total: number): string {
  return `Look ${numberWord(position)} of ${numberWord(total)}`;
}

/** The subtitle under the request: "3 looks from your closet", "1 look from your closet". */
export function looksCountText(count: number): string {
  return `${count} ${count === 1 ? 'look' : 'looks'} from your closet`;
}

/** The quiet line when closet items were left out of the request, or null when none were. */
export function omittedItemsText(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? '1 piece was left out of this request (closet limit or incomplete details).'
    : `${count} pieces were left out of this request (closet limit or incomplete details).`;
}

/** A piece by name; without a name its category and type ("Top · Hoodie"); "Removed from closet" once deleted. */
export function pieceText(piece: LookPiece): string {
  const { item } = piece;
  if (!item) return REMOVED_PIECE_TEXT;
  if (item.name !== undefined) return item.name;
  const type = item.attributes?.type?.value;
  const category = CATEGORY_LABELS[item.category];
  return type ? `${category} · ${type}` : category;
}

/** The line naming every piece: "Black band hoodie, Bottom · Jeans, Shoes." */
export function lookPiecesText(pieces: readonly LookPiece[]): string {
  return pieces.length === 0 ? '' : `${pieces.map(pieceText).join(', ')}.`;
}

/** Main pieces (large photos) and the rest (shoes and accessories, a smaller row), each in look order. */
export function splitLookPieces<P extends Pick<LookPiece, 'category'>>(pieces: readonly P[]): { main: P[]; small: P[] } {
  const main = pieces.filter((piece) => MAIN_LOOK_CATEGORIES.includes(piece.category));
  const small = pieces.filter((piece) => !MAIN_LOOK_CATEGORIES.includes(piece.category));
  return { main, small };
}

/** True while at least one piece the look is built around (top, bottom or dress) is still in the closet. */
export function lookStillStands(pieces: readonly LookPiece[]): boolean {
  return pieces.some((piece) => piece.item !== null && REQUIRED_LOOK_CATEGORIES.includes(piece.category));
}
