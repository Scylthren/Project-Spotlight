import {
  isLookRating,
  isOccasion,
  looksWithNoPiecesLeft,
  savedLookKey,
  validateSavedLook,
  type LookRating,
  type Occasion,
  type SavedLook,
} from '@/core';

import { OutfitRepositoryError, type OutfitRepository } from './outfit-repository';
import type { SqlDatabase } from './sql-database';
import { SqlSerialQueue } from './sql-serial-queue';

interface OutfitRow {
  id: string;
  request: string;
  rationale: string;
  rating: string | null;
  occasion: string | null;
  created_at: string;
  model: string | null;
}

interface OutfitItemRow {
  outfit_id: string;
  item_id: string;
  category: string;
  position: number;
}

const COLUMNS = 'id, request, rationale, rating, occasion, created_at, model';

/** Maps a row and its piece rows (in position order) to a look, or null if the stored data is not valid. */
export function rowToSavedLook(row: OutfitRow, pieces: OutfitItemRow[]): SavedLook | null {
  const candidate = {
    id: row.id,
    request: row.request,
    rationale: row.rationale,
    pieces: pieces.map((p, index) => (p.position === index ? { itemId: p.item_id, category: p.category } : null)),
    rating: row.rating,
    occasion: row.occasion,
    createdAt: row.created_at,
    model: row.model,
  };
  return validateSavedLook(candidate).length === 0 ? (candidate as SavedLook) : null;
}

/**
 * On-device `OutfitRepository` in the closet database (migration 8). Run
 * `migrateClosetDatabase` first. Pass the closet repository's
 * `SqlSerialQueue` so the two never interleave on the shared connection.
 */
export class SqliteOutfitRepository implements OutfitRepository {
  constructor(
    private readonly db: SqlDatabase,
    private readonly queue: SqlSerialQueue = new SqlSerialQueue(),
    private readonly onCorruptRow: (id: string) => void = (id) => console.warn(`Skipping unreadable saved look ${id}`),
  ) {}

  private async piecesByLook(outfitId?: string): Promise<Map<string, OutfitItemRow[]>> {
    const rows = await this.db.getAllAsync<OutfitItemRow>(
      `SELECT outfit_id, item_id, category, position FROM outfit_items
        ${outfitId === undefined ? '' : 'WHERE outfit_id = ?'} ORDER BY outfit_id, position`,
      outfitId === undefined ? [] : [outfitId],
    );
    const map = new Map<string, OutfitItemRow[]>();
    for (const row of rows) {
      const list = map.get(row.outfit_id);
      if (list) list.push(row);
      else map.set(row.outfit_id, [row]);
    }
    return map;
  }

  /** Every readable look, newest first; unreadable rows are reported and skipped. */
  private async readAll(): Promise<SavedLook[]> {
    const rows = await this.db.getAllAsync<OutfitRow>(
      `SELECT ${COLUMNS} FROM outfits ORDER BY julianday(created_at) DESC, id ASC`,
      [],
    );
    const pieces = await this.piecesByLook();
    const looks: SavedLook[] = [];
    for (const row of rows) {
      const look = rowToSavedLook(row, pieces.get(row.id) ?? []);
      if (look) looks.push(look);
      else this.onCorruptRow(row.id);
    }
    return looks;
  }

  private async readOne(id: string): Promise<SavedLook | null> {
    const row = await this.db.getFirstAsync<OutfitRow>(`SELECT ${COLUMNS} FROM outfits WHERE id = ?`, [id]);
    if (!row) return null;
    const look = rowToSavedLook(row, (await this.piecesByLook(id)).get(id) ?? []);
    if (!look) this.onCorruptRow(id);
    return look;
  }

  list(): Promise<SavedLook[]> {
    return this.queue.run(() => this.readAll());
  }

  get(id: string): Promise<SavedLook | null> {
    return this.queue.run(() => this.readOne(id));
  }

  async save(look: SavedLook): Promise<{ look: SavedLook; created: boolean }> {
    const errors = validateSavedLook(look);
    if (errors.length > 0) throw new OutfitRepositoryError('invalid', errors.join('; '));
    const key = savedLookKey(look.pieces.map((p) => p.itemId));
    return this.queue.transaction(this.db, async () => {
      const same = await this.db.getFirstAsync<{ id: string }>('SELECT id FROM outfits WHERE item_key = ?', [key]);
      if (same) {
        const existing = await this.readOne(same.id);
        if (existing) return { look: existing, created: false };
        throw new OutfitRepositoryError('invalid', `saved look ${same.id} with these pieces is unreadable`);
      }
      const result = await this.db.runAsync(
        `INSERT OR IGNORE INTO outfits (id, item_key, request, rationale, rating, occasion, created_at, model)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [look.id, key, look.request, look.rationale, look.rating, look.occasion, look.createdAt, look.model],
      );
      if (result.changes === 0) throw new OutfitRepositoryError('duplicate', `look ${look.id} already exists`);
      for (const [position, piece] of look.pieces.entries()) {
        await this.db.runAsync('INSERT INTO outfit_items (outfit_id, item_id, category, position) VALUES (?, ?, ?, ?)', [
          look.id,
          piece.itemId,
          piece.category,
          position,
        ]);
      }
      return { look: { ...look, pieces: look.pieces.map((p) => ({ ...p })) }, created: true };
    });
  }

  async setRating(id: string, rating: LookRating | null): Promise<void> {
    if (rating !== null && !isLookRating(rating)) throw new OutfitRepositoryError('invalid', 'unknown rating');
    await this.updateField(id, 'rating', rating);
  }

  async setOccasion(id: string, occasion: Occasion | null): Promise<void> {
    if (occasion !== null && !isOccasion(occasion)) throw new OutfitRepositoryError('invalid', 'unknown occasion');
    await this.updateField(id, 'occasion', occasion);
  }

  private async updateField(id: string, column: 'rating' | 'occasion', value: string | null): Promise<void> {
    await this.queue.run(async () => {
      const result = await this.db.runAsync(`UPDATE outfits SET ${column} = ? WHERE id = ?`, [value, id]);
      if (result.changes === 0) throw new OutfitRepositoryError('not_found', `look ${id} does not exist`);
    });
  }

  async remove(id: string): Promise<void> {
    await this.queue.transaction(this.db, async () => {
      // Explicit as well as the cascade, like the closet repository: a
      // connection without foreign keys must not leave orphan pieces.
      await this.db.runAsync('DELETE FROM outfit_items WHERE outfit_id = ?', [id]);
      const result = await this.db.runAsync('DELETE FROM outfits WHERE id = ?', [id]);
      if (result.changes === 0) throw new OutfitRepositoryError('not_found', `look ${id} does not exist`);
    });
  }

  removeLooksWithNoPiecesIn(closetIds: ReadonlySet<string>): Promise<string[]> {
    return this.queue.transaction(this.db, async () => {
      // Unreadable looks are left alone (and keep being reported), not deleted.
      const ids = looksWithNoPiecesLeft(await this.readAll(), closetIds);
      for (const id of ids) {
        await this.db.runAsync('DELETE FROM outfit_items WHERE outfit_id = ?', [id]);
        await this.db.runAsync('DELETE FROM outfits WHERE id = ?', [id]);
      }
      return ids;
    });
  }
}
