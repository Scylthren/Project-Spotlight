/**
 * Guards an action so a second call while the first is still running is
 * dropped. The flag is plain mutable state, not React state, so two taps
 * in the same frame cannot both get through.
 */
export interface SingleFlight {
  /** True while a task started by `run` has not settled. */
  readonly busy: boolean;
  /**
   * Runs `task` unless one is already in flight. Resolves to the task's
   * result, or `{ ran: false }` if it was dropped. Rejections propagate and
   * release the guard.
   */
  run<T>(task: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }>;
}

export function createSingleFlight(): SingleFlight {
  let busy = false;
  return {
    get busy() {
      return busy;
    },
    async run(task) {
      if (busy) return { ran: false };
      busy = true;
      try {
        return { ran: true, value: await task() };
      } finally {
        busy = false;
      }
    },
  };
}
