import type { Decision } from "../policy/types.js";
import type { ToolResult } from "./types.js";

export type ApprovalStatus = "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "EXECUTED" | "FAILED";

export interface ApprovalRequest {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  toolName: string;
  /** A private COPY of the agent's arguments. What the human approves is exactly what runs. */
  args: Record<string, unknown>;
  decision: Decision;
  ledgerId?: string;
  status: ApprovalStatus;
  result?: ToolResult;
  resolvedBy?: string;
  resolvedAt?: Date;
}

export class ApprovalStore {
  private readonly items = new Map<string, ApprovalRequest>();

  add(req: ApprovalRequest): void {
    this.items.set(req.id, req);
  }
  get(id: string): ApprovalRequest | undefined {
    return this.items.get(id);
  }
  list(): ApprovalRequest[] {
    return [...this.items.values()];
  }
  pending(): ApprovalRequest[] {
    return this.list().filter((a) => a.status === "PENDING");
  }
}
