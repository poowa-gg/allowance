/** A tiny sliding-window limiter. It protects the owner's AI credits when the demo is public. */
export class RateLimiter {
  private hits: number[] = [];
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Returns true and records a use if there is room; false if the window is full. */
  tryTake(now: number = Date.now()): boolean {
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
    if (this.hits.length >= this.max) return false;
    this.hits.push(now);
    return true;
  }
}
