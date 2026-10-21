import {
  canonicalTagText,
  compareTagNames,
  validateClothingItem,
  type ClothingItem,
  type TagSummary,
} from '@/core';

import {
  ClosetRepositoryError,
  cloneItem,
  compareNewestFirst,
  type ClosetRepository,
} from './closet-repository';

/** Mock `ClosetRepository` for tests and previews. Data lives only in memory. */
export class InMemoryClosetRepository implements ClosetRepository {
  private readonly items = new Map<string, ClothingItem>();
  private readonly tags = new Set<string>();

  constructor(initial: ClothingItem[] = []) {
    for (const item of initial) {
      this.items.set(item.id, cloneItem(item));
      for (const tag of item.tags) this.tags.add(tag);
    }
  }

  async list(): Promise<ClothingItem[]> {
    return [...this.items.values()].map(cloneItem).sort(compareNewestFirst);
  }

  async get(id: string): Promise<ClothingItem | null> {
    const item = this.items.get(id);
    return item ? cloneItem(item) : null;
  }

  async add(item: ClothingItem): Promise<void> {
    const errors = validateClothingItem(item);
    if (errors.length > 0) throw new ClosetRepositoryError('invalid', errors.join('; '));
    if (this.items.has(item.id)) {
      throw new ClosetRepositoryError('duplicate', `item ${item.id} already exists`);
    }
    this.items.set(item.id, cloneItem(item));
    for (const tag of item.tags) this.tags.add(tag);
  }

  async update(item: ClothingItem): Promise<void> {
    const errors = validateClothingItem(item);
    if (errors.length > 0) throw new ClosetRepositoryError('invalid', errors.join('; '));
    const stored = this.items.get(item.id);
    if (!stored) throw new ClosetRepositoryError('not_found', `item ${item.id} does not exist`);
    this.items.set(item.id, { ...cloneItem(item), createdAt: stored.createdAt });
    for (const tag of item.tags) this.tags.add(tag);
  }

  async remove(id: string): Promise<void> {
    if (!this.items.delete(id)) {
      throw new ClosetRepositoryError('not_found', `item ${id} does not exist`);
    }
  }

  async listTags(): Promise<TagSummary[]> {
    const counts = new Map<string, number>([...this.tags].map((t) => [t, 0]));
    for (const item of this.items.values()) {
      for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts]
      .map(([name, itemCount]) => ({ name, itemCount }))
      .sort((a, b) => compareTagNames(a.name, b.name));
  }

  async deleteTag(name: string): Promise<void> {
    const key = canonicalTagText(name);
    if (!this.tags.delete(key)) throw new ClosetRepositoryError('not_found', `tag ${key} does not exist`);
    for (const item of this.items.values()) {
      if (item.tags.includes(key)) item.tags = item.tags.filter((t) => t !== key);
    }
  }
}
