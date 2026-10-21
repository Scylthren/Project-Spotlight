import { createSingleFlight } from './single-flight';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createSingleFlight', () => {
  it('drops a second call made before the first settles (double tap)', async () => {
    const guard = createSingleFlight();
    const gate = deferred<string>();
    const task = jest.fn(() => gate.promise);

    const first = guard.run(task);
    const second = guard.run(task);
    expect(guard.busy).toBe(true);
    expect(await second).toEqual({ ran: false });
    gate.resolve('saved');
    expect(await first).toEqual({ ran: true, value: 'saved' });
    expect(task).toHaveBeenCalledTimes(1);
    expect(guard.busy).toBe(false);
  });

  it('allows another run after the previous one finished', async () => {
    const guard = createSingleFlight();
    expect(await guard.run(async () => 1)).toEqual({ ran: true, value: 1 });
    expect(await guard.run(async () => 2)).toEqual({ ran: true, value: 2 });
  });

  it('releases the guard when the task rejects', async () => {
    const guard = createSingleFlight();
    await expect(guard.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(guard.busy).toBe(false);
    expect(await guard.run(async () => 'ok')).toEqual({ ran: true, value: 'ok' });
  });
});
