import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * HASH-CHAINED AUDIT LOG ("proof" feature)
 * Every record stores the hash of the record before it. Change, delete or reorder
 * any past record and every later hash stops matching, so tampering is detectable
 * by anyone who re-runs verify(). It is a blockchain-style chain without a blockchain.
 */
export interface AuditRecord {
  seq: number;
  at: string;
  kind: string;
  data: unknown;
  prevHash: string;
  hash: string;
}

export type VerifyResult = { ok: true } | { ok: false; brokenAt: number };

const GENESIS = "0".repeat(64);

/** Stable JSON: keys sorted, so the same data always hashes the same. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

function hashOf(prevHash: string, seq: number, at: string, kind: string, data: unknown): string {
  return createHash("sha256").update(prevHash + canonical({ seq, at, kind, data })).digest("hex");
}

/** Recompute the whole chain. Used by the dashboard's "Verify" button and by tests. */
export function verifyRecords(records: readonly AuditRecord[]): VerifyResult {
  let prev = GENESIS;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r) return { ok: false, brokenAt: i };
    if (r.seq !== i + 1 || r.prevHash !== prev || r.hash !== hashOf(prev, r.seq, r.at, r.kind, r.data)) {
      return { ok: false, brokenAt: r.seq };
    }
    prev = r.hash;
  }
  return { ok: true };
}

export class AuditLog {
  private recs: AuditRecord[];
  private readonly now: () => Date;
  private readonly onAppend: ((rec: AuditRecord) => void) | undefined;

  constructor(now: () => Date, existing: AuditRecord[] = [], onAppend?: (rec: AuditRecord) => void) {
    const check = verifyRecords(existing);
    if (!check.ok) throw new Error(`Audit log is corrupt at record ${check.brokenAt}. Refusing to continue.`);
    this.recs = [...existing];
    this.now = now;
    this.onAppend = onAppend;
  }

  append(kind: string, data: unknown): AuditRecord {
    // Force JSON-clean data (dates become strings, undefined disappears) so a
    // record hashes identically before and after being written to disk.
    const clean: unknown = JSON.parse(JSON.stringify(data ?? null));
    const last = this.recs[this.recs.length - 1];
    const seq = this.recs.length + 1;
    const at = this.now().toISOString();
    const prevHash = last ? last.hash : GENESIS;
    const rec: AuditRecord = { seq, at, kind, data: clean, prevHash, hash: hashOf(prevHash, seq, at, kind, clean) };
    this.recs.push(rec);
    this.onAppend?.(rec);
    return rec;
  }

  records(): readonly AuditRecord[] {
    return this.recs;
  }

  verify(): VerifyResult {
    return verifyRecords(this.recs);
  }
}

/** A log that survives restarts: one JSON record per line (data/audit.jsonl). */
export function createFileAuditLog(path: string, now: () => Date): AuditLog {
  mkdirSync(dirname(path), { recursive: true });
  const existing: AuditRecord[] = existsSync(path)
    ? readFileSync(path, "utf8")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as AuditRecord)
    : [];
  return new AuditLog(now, existing, (rec) => appendFileSync(path, JSON.stringify(rec) + "\n"));
}
