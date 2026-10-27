/**
 * A tiny async lock. The gateway uses it so that "evaluate the policy" and
 * "reserve the budget" happen as ONE indivisible step. Without it, ten agent
 * calls arriving together would all read the same budget and all pass.
 */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
