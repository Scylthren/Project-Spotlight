import {
  canonicalTagText,
  compareTagNames,
  validateClothingItem,
  type ClothingItem,
  type TagSummary,
} from '@/core';

import { ClosetRepositoryError, type ClosetRepository } from './closet-repository';
import type { SqlDatabase } from './sql-database';

interface ClothingItemRow {
  id: string;
  category: string;
  seasons: string;
  created_at: string;
  updated_at: string;
}

interface ItemTagRow {
  item_id: string;
  tag_name: string;
}

interface ItemColorRow {
  item_id: string;
  rank: number;
  palette_id: string;
  hex: string;
  source: string;
}

interface ItemPhotoRow {
  id: string;
  item_id: string;
  role: string;
  storage_path: string;
  sort_order: number;
  is_primary: number;
}

const COLUMNS = 'id, category, seasons, created_at, updated_at';
const PHOTO_COLUMNS = 'id, item_id, role, storage_path, sort_order, is_primary';
const COLOR_COLUMNS = 'item_id, rank, palette_id, hex, source';

/**
 * Maps an item's color rows (in rank order) to unvalidated colors. Ranks must
 * be 0, 1, 2, ... with no gap: a gap (say, no primary) yields a null entry,
 * which fails validation, so the item is reported as unreadable.
 */
function rowsToColors(rows: ItemColorRow[]): unknown[] {
  return rows.map((row, index) =>
    row.rank === index ? { paletteId: row.palette_id, hex: row.hex, source: row.source } : null,
  );
}

/**
 * Maps a photo row to an unvalidated photo; `rowToItem` validates it with the
 * item. An `is_primary` other than 0 or 1 (the table's CHECK refuses those)
 * stays a number, which fails validation.
 */
function rowToPhoto(row: ItemPhotoRow): unknown {
  return {
    id: row.id,
    role: row.role,
    path: row.storage_path,
    sortOrder: row.sort_order,
    isPrimary: row.is_primary === 1 ? true : row.is_primary === 0 ? false : row.is_primary,
  };
}

function groupByItem<T>(rows: T[], itemId: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(itemId(row));
    if (list) list.push(row);
    else map.set(itemId(row), [row]);
  }
  return map;
}

function parseJsonArray(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Maps a row, its photos (in sort order), colors (in rank order), and tags to
 * an item, or returns null if the stored data is not a valid item.
 */
export function rowToItem(
  row: ClothingItemRow,
  photos: unknown[] = [],
  tags: string[] = [],
  colors: unknown[] = [],
): ClothingItem | null {
  const candidate = {
    id: row.id,
    photos,
    category: row.category,
    colors,
    seasons: parseJsonArray(row.seasons),
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return validateClothingItem(candidate).length === 0 ? (candidate as ClothingItem) : null;
}

/**
 * On-device `ClosetRepository` backed by SQLite. Run `migrateClosetDatabase`
 * on the database before constructing this.
 *
 * Every call runs one at a time through an internal queue, and multi-statement
 * writes run in a transaction. The app shares one connection, so without the
 * queue a second write could try to BEGIN inside the first one's transaction,
 * or a read could see a half-written item. Use one instance per connection.
 */
export class SqliteClosetRepository implements ClosetRepository {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly db: SqlDatabase,
    private readonly onCorruptRow: (id: string) => void = (id) =>
      console.warn(`Skipping unreadable closet item ${id}`),
  ) {}

  /**
   * Runs `task` after every earlier call has settled. Not re-entrant: never
   * call a public repository method (or `serialize`/`transaction`) from inside
   * `task` or a `transaction` body. That call would queue behind the running
   * task, which waits for it, and both would hang forever. Inside, use
   * `this.db` and the private helpers only.
   */
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /**
   * Serialized, and inside BEGIN/COMMIT; rolls back and rethrows on error.
   * Same rule as `serialize`: `work` must not call public methods (deadlock).
   */
  private transaction<T>(work: () => Promise<T>): Promise<T> {
    return this.serialize(async () => {
      await this.db.execAsync('BEGIN;');
      try {
        const value = await work();
        await this.db.execAsync('COMMIT;');
        return value;
      } catch (error) {
        await this.db.execAsync('ROLLBACK;').catch(() => undefined);
        throw error;
      }
    });
  }

  private async tagsByItem(itemId?: string): Promise<Map<string, string[]>> {
    const rows = await this.db.getAllAsync<ItemTagRow>(
      `SELECT item_id, tag_name FROM item_tags ${itemId === undefined ? '' : 'WHERE item_id = ?'}
       ORDER BY item_id, position`,
      itemId === undefined ? [] : [itemId],
    );
    const grouped = groupByItem(rows, (r) => r.item_id);
    return new Map([...grouped].map(([id, list]) => [id, list.map((r) => r.tag_name)]));
  }

  private async photosByItem(itemId?: string): Promise<Map<string, unknown[]>> {
    const rows = await this.db.getAllAsync<ItemPhotoRow>(
      `SELECT ${PHOTO_COLUMNS} FROM item_photos ${itemId === undefined ? '' : 'WHERE item_id = ?'}
       ORDER BY item_id, sort_order`,
      itemId === undefined ? [] : [itemId],
    );
    const grouped = groupByItem(rows, (r) => r.item_id);
    return new Map([...grouped].map(([id, list]) => [id, list.map(rowToPhoto)]));
  }

  private async colorsByItem(itemId?: string): Promise<Map<string, unknown[]>> {
    const rows = await this.db.getAllAsync<ItemColorRow>(
      `SELECT ${COLOR_COLUMNS} FROM item_colors ${itemId === undefined ? '' : 'WHERE item_id = ?'}
       ORDER BY item_id, rank`,
      itemId === undefined ? [] : [itemId],
    );
    const grouped = groupByItem(rows, (r) => r.item_id);
    return new Map([...grouped].map(([id, list]) => [id, rowsToColors(list)]));
  }

  /** Replaces the item's color rows; rank is the position in `item.colors`. */
  private async writeColors(item: ClothingItem): Promise<void> {
    await this.db.runAsync('DELETE FROM item_colors WHERE item_id = ?', [item.id]);
    for (const [rank, color] of item.colors.entries()) {
      await this.db.runAsync(`INSERT INTO item_colors (${COLOR_COLUMNS}) VALUES (?, ?, ?, ?, ?)`, [
        item.id,
        rank,
        color.paletteId,
        color.hex,
        color.source,
      ]);
    }
  }

  /**
   * Replaces the item's photo rows. Rejects (code 'invalid') a photo id that
   * another item uses, rather than letting the primary key error escape.
   */
  private async writePhotos(item: ClothingItem): Promise<void> {
    for (const photo of item.photos) {
      const owner = await this.db.getFirstAsync<{ item_id: string }>(
        'SELECT item_id FROM item_photos WHERE id = ?',
        [photo.id],
      );
      if (owner && owner.item_id !== item.id) {
        throw new ClosetRepositoryError('invalid', `photo id ${photo.id} belongs to another item`);
      }
    }
    await this.db.runAsync('DELETE FROM item_photos WHERE item_id = ?', [item.id]);
    for (const photo of item.photos) {
      await this.db.runAsync(
        `INSERT INTO item_photos (${PHOTO_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`,
        [photo.id, item.id, photo.role, photo.path, photo.sortOrder, photo.isPrimary ? 1 : 0],
      );
    }
  }

  private async writeTags(item: ClothingItem): Promise<void> {
    await this.db.runAsync('DELETE FROM item_tags WHERE item_id = ?', [item.id]);
    for (const [position, tag] of item.tags.entries()) {
      await this.db.runAsync('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tag]);
      await this.db.runAsync('INSERT INTO item_tags (item_id, tag_name, position) VALUES (?, ?, ?)', [
        item.id,
        tag,
        position,
      ]);
    }
  }

  list(): Promise<ClothingItem[]> {
    return this.serialize(async () => {
      const rows = await this.db.getAllAsync<ClothingItemRow>(
        `SELECT ${COLUMNS} FROM clothing_items ORDER BY julianday(created_at) DESC, id ASC`,
        [],
      );
      const photos = await this.photosByItem();
      const tags = await this.tagsByItem();
      const colors = await this.colorsByItem();
      const items: ClothingItem[] = [];
      for (const row of rows) {
        const item = rowToItem(row, photos.get(row.id), tags.get(row.id), colors.get(row.id));
        if (item) items.push(item);
        else this.onCorruptRow(row.id);
      }
      return items;
    });
  }

  get(id: string): Promise<ClothingItem | null> {
    return this.serialize(async () => {
      const row = await this.db.getFirstAsync<ClothingItemRow>(
        `SELECT ${COLUMNS} FROM clothing_items WHERE id = ?`,
        [id],
      );
      if (!row) return null;
      const item = rowToItem(
        row,
        (await this.photosByItem(id)).get(id),
        (await this.tagsByItem(id)).get(id),
        (await this.colorsByItem(id)).get(id),
      );
      if (!item) this.onCorruptRow(row.id);
      return item;
    });
  }

  async add(item: ClothingItem): Promise<void> {
    const errors = validateClothingItem(item);
    if (errors.length > 0) throw new ClosetRepositoryError('invalid', errors.join('; '));
    await this.transaction(async () => {
      // INSERT OR IGNORE + changes avoids parsing driver-specific constraint errors.
      const result = await this.db.runAsync(
        `INSERT OR IGNORE INTO clothing_items (${COLUMNS}) VALUES (?, ?, ?, ?, ?)`,
        [item.id, item.category, JSON.stringify(item.seasons), item.createdAt, item.updatedAt],
      );
      if (result.changes === 0) {
        throw new ClosetRepositoryError('duplicate', `item ${item.id} already exists`);
      }
      await this.writePhotos(item);
      await this.writeColors(item);
      await this.writeTags(item);
    });
  }

  async update(item: ClothingItem): Promise<void> {
    const errors = validateClothingItem(item);
    if (errors.length > 0) throw new ClosetRepositoryError('invalid', errors.join('; '));
    await this.transaction(async () => {
      // created_at is deliberately not in the SET list: it never changes.
      const result = await this.db.runAsync(
        `UPDATE clothing_items
           SET category = ?, seasons = ?, updated_at = ?
         WHERE id = ?`,
        [item.category, JSON.stringify(item.seasons), item.updatedAt, item.id],
      );
      if (result.changes === 0) {
        throw new ClosetRepositoryError('not_found', `item ${item.id} does not exist`);
      }
      await this.writePhotos(item);
      await this.writeColors(item);
      await this.writeTags(item);
    });
  }

  async remove(id: string): Promise<void> {
    await this.transaction(async () => {
      // The foreign key cascade also does this; deleting explicitly keeps a
      // connection without foreign keys from leaving links that a later item
      // with the same id would inherit.
      await this.db.runAsync('DELETE FROM item_tags WHERE item_id = ?', [id]);
      await this.db.runAsync('DELETE FROM item_photos WHERE item_id = ?', [id]);
      await this.db.runAsync('DELETE FROM item_colors WHERE item_id = ?', [id]);
      const result = await this.db.runAsync('DELETE FROM clothing_items WHERE id = ?', [id]);
      if (result.changes === 0) {
        throw new ClosetRepositoryError('not_found', `item ${id} does not exist`);
      }
    });
  }

  listTags(): Promise<TagSummary[]> {
    return this.serialize(async () => {
      const rows = await this.db.getAllAsync<{ name: string; item_count: number }>(
        `SELECT t.name AS name, COUNT(it.item_id) AS item_count
           FROM tags t LEFT JOIN item_tags it ON it.tag_name = t.name
          GROUP BY t.name`,
        [],
      );
      // Sorted here, not in SQL, so the order matches the in-memory repository exactly.
      return rows
        .map((r) => ({ name: r.name, itemCount: Number(r.item_count) }))
        .sort((a, b) => compareTagNames(a.name, b.name));
    });
  }

  async deleteTag(name: string): Promise<void> {
    const key = canonicalTagText(name);
    await this.transaction(async () => {
      // Explicit for the same reason as in `remove`. updated_at is not touched.
      await this.db.runAsync('DELETE FROM item_tags WHERE tag_name = ?', [key]);
      const result = await this.db.runAsync('DELETE FROM tags WHERE name = ?', [key]);
      if (result.changes === 0) {
        throw new ClosetRepositoryError('not_found', `tag ${key} does not exist`);
      }
    });
  }
}
