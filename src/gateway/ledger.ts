import type { LedgerEntry } from "../policy/types.js";

type Row = LedgerEntry & { id: string };

/**
 * The in-memory record of every money/customer-facing action we allowed or parked.
 * The policy engine reads a snapshot of it to enforce budgets and velocity.
 * (Persistence is not needed for the demo; the audit log is the durable record.)
 */
export class Ledger {
  private rows: Row[] = [];
  private counter = 0;

  add(entry: LedgerEntry): string {
    const id = `L${++this.counter}`;
    this.rows.push({ ...entry, id });
    return id;
  }

  setStatus(id: string, status: LedgerEntry["status"]): void {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.status = status;
  }

  getStatus(id: string): LedgerEntry["status"] | undefined {
    return this.rows.find((r) => r.id === id)?.status;
  }

  /** A defensive copy, so the engine can never mutate our records. */
  snapshot(): LedgerEntry[] {
    return this.rows.map((r) => ({
      at: r.at,
      toolName: r.toolName,
      targetId: r.targetId,
      amountCents: r.amountCents,
      status: r.status,
    }));
  }
}
