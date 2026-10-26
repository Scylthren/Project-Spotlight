import { SqlSerialQueue, sqlQueueFor } from './sql-serial-queue';

describe('sqlQueueFor', () => {
  it('gives every user of one connection the same queue, and another connection its own', () => {
    const connection = {};
    const other = {};
    const queue = sqlQueueFor(connection);
    expect(queue).toBeInstanceOf(SqlSerialQueue);
    expect(sqlQueueFor(connection)).toBe(queue);
    expect(sqlQueueFor(other)).not.toBe(queue);
  });
});

describe('SqlSerialQueue', () => {
  it('runs tasks one at a time in order, and a failed task does not stop the next', async () => {
    const queue = new SqlSerialQueue();
    const order: string[] = [];
    const slow = queue.run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push('slow');
    });
    const failing = queue.run(async () => {
      order.push('failing');
      throw new Error('boom');
    });
    const fast = queue.run(async () => {
      order.push('fast');
      return 1;
    });
    await slow;
    await expect(failing).rejects.toThrow('boom');
    expect(await fast).toBe(1);
    expect(order).toEqual(['slow', 'failing', 'fast']);
  });
});
