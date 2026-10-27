import { describe, expect, it } from "vitest";
import { RateLimiter } from "./limiter.js";

describe("RateLimiter (protects the owner's AI credits)", () => {
  it("allows up to the limit, then refuses", () => {
    const l = new RateLimiter(3, 1000);
    expect([l.tryTake(0), l.tryTake(1), l.tryTake(2), l.tryTake(3)]).toEqual([true, true, true, false]);
  });
  it("frees room as the window slides", () => {
    const l = new RateLimiter(2, 1000);
    l.tryTake(0);
    l.tryTake(100);
    expect(l.tryTake(500)).toBe(false);
    expect(l.tryTake(1001)).toBe(true);
  });
});
