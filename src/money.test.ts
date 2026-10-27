import { describe, expect, it } from "vitest";
import { cents, fromDecimalString, parseAmountString, toDecimalString } from "./money.js";

describe("money", () => {
  it("formats cents as 2-decimal strings", () => {
    expect(toDecimalString(cents(1250))).toBe("12.50");
    expect(toDecimalString(cents(5))).toBe("0.05");
    expect(toDecimalString(cents(0))).toBe("0.00");
    expect(toDecimalString(cents(100000))).toBe("1000.00");
  });

  it("round-trips", () => {
    for (const n of [0, 1, 99, 100, 101, 49999, 123456]) {
      expect(fromDecimalString(toDecimalString(cents(n)))).toBe(n);
    }
  });

  it("rejects bad cents", () => {
    expect(() => cents(-1)).toThrow();
    expect(() => cents(1.5)).toThrow();
    expect(() => cents(Number.NaN)).toThrow();
  });

  it("rejects ambiguous money strings", () => {
    for (const bad of ["12.5", "12.505", "-1.00", "abc", "", "1,000.00"]) {
      expect(() => fromDecimalString(bad)).toThrow();
    }
  });

  it("parseAmountString accepts 1-2 decimals and rejects the rest", () => {
    expect(parseAmountString("5")).toBe(500);
    expect(parseAmountString("5.5")).toBe(550);
    expect(parseAmountString("5.50")).toBe(550);
    expect(parseAmountString("0.01")).toBe(1);
    for (const bad of ["", ".5", "5.", "-5", "5.005", "1e3", "1,000.00", " 5", "abc", "0x10"]) {
      expect(() => parseAmountString(bad)).toThrow();
    }
  });
});
