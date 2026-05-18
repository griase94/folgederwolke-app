/**
 * In-process event bus — §4.1.1 #2.
 *
 * A lightweight publish/subscribe emitter used for audit log writes, mail
 * dispatch triggers, and future integrations. All handlers are awaited in
 * parallel so a slow handler does not block others.
 *
 * Usage:
 *   bus.on('auslagen.submitted', async (payload) => { ... });
 *   await bus.emit('auslagen.submitted', { submissionId: '...' });
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler<T = any> = (payload: T) => void | Promise<void>;

class EventBus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handlers = new Map<string, Set<Handler<any>>>();

  /** Register a handler for the given event name. */
  on<T>(event: string, fn: Handler<T>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(fn as Handler);
  }

  /** Remove a previously registered handler. No-op if not found. */
  off<T>(event: string, fn: Handler<T>): void {
    this.handlers.get(event)?.delete(fn as Handler);
  }

  /**
   * Emit an event and await all registered handlers in parallel.
   * A handler error does not prevent other handlers from running — errors
   * are re-thrown as an AggregateError if any handler fails.
   */
  async emit<T>(event: string, payload: T): Promise<void> {
    const fns = this.handlers.get(event);
    if (!fns || fns.size === 0) return;

    const results = await Promise.allSettled([...fns].map((fn) => fn(payload)));

    const failures = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason);

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `EventBus: ${failures.length} handler(s) failed for event "${event}"`,
      );
    }
  }
}

export const bus = new EventBus();
