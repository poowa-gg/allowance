/**
 * WHY INTEGER CENTS
 * 0.1 + 0.2 !== 0.3 in floating point. In a spending firewall, "$100.00 limit"
 * vs "$100.00000000000001 purchase" must never be a coin flip.
 * Internally we ONLY use integer cents. We convert to PayPal's decimal string
 * ("12.50") at the very edge, in exactly one place: this file.
 */

export type Cents = number & { readonly __brand: "Cents" };

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Cents must be a non-negative safe integer, got ${value}`);
  }
  return value as Cents;
}

/** 1250 -> "12.50" (PayPal wants a string with 2 decimals for USD). */
export function toDecimalString(amount: Cents): string {
  const whole = Math.floor(amount / 100);
  const frac = amount % 100;
  return `${whole}.${frac.toString().padStart(2, "0")}`;
}

/** "12.50" -> 1250. Strict: rejects "12.5", "12.505", "-1", "abc". */
export function fromDecimalString(s: string): Cents {
  if (!/^\d+\.\d{2}$/.test(s)) {
    throw new RangeError(`Invalid money string: "${s}"`);
  }
  const [whole, frac] = s.split(".") as [string, string];
  return cents(Number(whole) * 100 + Number(frac));
}

/**
 * Lenient-but-exact parser for amounts that arrive from an AI agent.
 * Accepts "5", "5.5", "5.50" (1-2 decimals), rejects everything ambiguous:
 * "", ".5", "5.", "-5", "5.005", "1e3", "1,000.00", " 5".
 * Returns integer cents or throws RangeError.
 */
export function parseAmountString(s: string): Cents {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) {
    throw new RangeError(`Invalid amount: "${s}"`);
  }
  const [whole, frac = ""] = s.split(".") as [string, string?];
  return cents(Number(whole) * 100 + Number(frac.padEnd(2, "0")));
}
