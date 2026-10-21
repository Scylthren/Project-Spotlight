import { makeItem, makePhoto } from './closet-repository.contract';
import { migrateClosetDatabase } from './closet-schema';
import { SetPhotoReferences, SqlitePhotoReferences } from './photo-references';
import { SqliteClosetRepository } from './sqlite-closet-repository';
import { NodeSqlDatabase } from './testing/node-sql-database';

const open: NodeSqlDatabase[] = [];
afterEach(() => {
  while (open.length) open.pop()!.close();
});

describe('SqlitePhotoReferences', () => {
  it('reports whether any item photo uses a stored path, and follows deletes', async () => {
    const db = new NodeSqlDatabase();
    open.push(db);
    await migrateClosetDatabase(db);
    const repo = new SqliteClosetRepository(db);
    await repo.add(makeItem({ id: 'a', photos: [makePhoto('a'), makePhoto('a', { sortOrder: 1, role: 'back' })] }));
    const refs = new SqlitePhotoReferences(db);

    expect(await refs.isReferenced('closet-images/a-0.jpg')).toBe(true);
    expect(await refs.isReferenced('closet-images/a-1.jpg')).toBe(true);
    expect(await refs.isReferenced('closet-images/b-0.jpg')).toBe(false);

    await repo.remove('a');
    expect(await refs.isReferenced('closet-images/a-0.jpg')).toBe(false);
  });
});

describe('SetPhotoReferences', () => {
  it('answers from its set and can simulate a failure', async () => {
    const refs = new SetPhotoReferences(['closet-images/a.jpg']);
    expect(await refs.isReferenced('closet-images/a.jpg')).toBe(true);
    refs.failNext = new Error('locked');
    await expect(refs.isReferenced('closet-images/a.jpg')).rejects.toThrow('locked');
    expect(await refs.isReferenced('closet-images/b.jpg')).toBe(false);
  });
});
