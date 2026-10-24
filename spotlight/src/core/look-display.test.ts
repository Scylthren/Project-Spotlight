import { closetItem } from '@/ai/testing/outfit-fixtures';

import {
  lookNumberText,
  lookOfText,
  lookPiecesText,
  looksCountText,
  lookStillStands,
  numberWord,
  omittedItemsText,
  pieceText,
  REMOVED_PIECE_TEXT,
  splitLookPieces,
  type LookPiece,
} from './look-display';

const piece = (id: string, category: LookPiece['category'], item: LookPiece['item'] = closetItem(id, category)): LookPiece => ({
  id,
  category,
  item,
});

describe('look numbers and counts', () => {
  it('numbers looks "01" and "Look one of three"', () => {
    expect(lookNumberText(1)).toBe('01');
    expect(lookNumberText(12)).toBe('12');
    expect(lookOfText(1, 3)).toBe('Look one of three');
    expect(lookOfText(2, 2)).toBe('Look two of two');
    expect(numberWord(11)).toBe('11');
  });

  it('counts looks in the subtitle', () => {
    expect(looksCountText(3)).toBe('3 looks from your closet');
    expect(looksCountText(1)).toBe('1 look from your closet');
  });

  it('says quietly when pieces were left out, and nothing when none were', () => {
    expect(omittedItemsText(0)).toBeNull();
    expect(omittedItemsText(1)).toBe('1 piece was left out of this request (closet limit or incomplete details).');
    expect(omittedItemsText(12)).toMatch(/^12 pieces were left out/);
  });
});

describe('pieceText and lookPiecesText', () => {
  it('uses the name, else category and type, else the category', () => {
    expect(pieceText(piece('a', 'top', closetItem('a', 'top', { name: 'Band hoodie' })))).toBe('Band hoodie');
    const typed = closetItem('b', 'bottom', { attributes: { type: { value: 'Jeans', source: 'auto' } } });
    expect(pieceText(piece('b', 'bottom', typed))).toBe('Bottom · Jeans');
    expect(pieceText(piece('s', 'shoes'))).toBe('Shoes');
  });

  it('calls a deleted piece "Removed from closet"', () => {
    expect(pieceText(piece('x', 'top', null))).toBe(REMOVED_PIECE_TEXT);
    expect(REMOVED_PIECE_TEXT).toBe('Removed from closet');
  });

  it('joins the pieces into one line', () => {
    expect(lookPiecesText([piece('a', 'top', closetItem('a', 'top', { name: 'Tee' })), piece('s', 'shoes')])).toBe('Tee, Shoes.');
    expect(lookPiecesText([])).toBe('');
  });
});

describe('splitLookPieces', () => {
  it('puts top, bottom, dress and outerwear in the main row, shoes and accessories in the small row, in order', () => {
    const pieces = [piece('t', 'top'), piece('b', 'bottom'), piece('c', 'outerwear'), piece('s', 'shoes'), piece('a1', 'accessory'), piece('a2', 'accessory')];
    const { main, small } = splitLookPieces(pieces);
    expect(main.map((p) => p.id)).toEqual(['t', 'b', 'c']);
    expect(small.map((p) => p.id)).toEqual(['s', 'a1', 'a2']);
  });
});

describe('lookStillStands', () => {
  it('is true while a top, bottom or dress remains, false when all are gone', () => {
    expect(lookStillStands([piece('t', 'top', null), piece('b', 'bottom'), piece('s', 'shoes')])).toBe(true);
    expect(lookStillStands([piece('t', 'top', null), piece('b', 'bottom', null), piece('s', 'shoes')])).toBe(false);
    expect(lookStillStands([piece('d', 'dress', null), piece('c', 'outerwear'), piece('a', 'accessory')])).toBe(false);
  });
});
