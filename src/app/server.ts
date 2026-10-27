/**
 * THE DASHBOARD SERVER (Node built-ins only: fewer dependencies means fewer ways to break).
 *
 *   npm run dev          demo mode: simulated PayPal, no credentials, safe for anyone
 *   npm run dev:live     live mode: real PayPal SANDBOX through the MCP gateway
 *
 * Security notes:
 *  - Binds to 127.0.0.1 unless ALLOWANCE_HOST is set. Live mode refuses to bind publicly.
 *  - The AGENT side (/api/agent-call) is untrusted and can never approve anything.
 *  - The OWNER side (approve, deny, kill switch, red team...) needs the owner token in live mode.
 *    Demo mode is open, because nothing in it is real.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { GatewayError } from "../gateway/gateway.js";
import { RateLimiter } from "./limiter.js";
import { AppRuntime } from "./runtime.js";
import type { Mode } from "./runtime.js";

// Load .env if present (Node 20.12+). Keys stay on the server and are never sent to the browser.
try {
  (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env");
} catch {
  /* no .env file is fine */
}

const mode: Mode = process.argv.includes("--live") ? "live" : "demo";
const port = Number(process.env["PORT"] ?? 8787);
const host = process.env["ALLOWANCE_HOST"] ?? "127.0.0.1";
const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1";

if (mode === "live" && !loopback && process.env["ALLOWANCE_ALLOW_REMOTE_LIVE"] !== "1") {
  console.error("Refusing to expose LIVE mode on a public address. Use demo mode for hosting.");
  process.exit(1);
}

const ownerToken = process.env["ALLOWANCE_OWNER_TOKEN"] ?? randomBytes(16).toString("hex");
const ownerOpen = mode === "demo";

const html = readFileSync(new URL("../../web/index.html", import.meta.url), "utf8");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new Error("Request too large");
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

/**
 * DEMO MODE GIVES EVERY VISITOR THEIR OWN PRIVATE COPY of the app (identified by a cookie), so one judge
 * pressing "Reset" or the kill switch never changes what another judge sees. Idle copies expire after an hour.
 * The AI budget is shared across everyone, so a public link cannot drain your credits.
 */
const sessions = new Map<string, { rt: AppRuntime; last: number }>();
const sharedLimiter = new RateLimiter(Number(process.env["ALLOWANCE_MAX_LLM_RUNS_PER_HOUR"] ?? 30), 3_600_000);
let liveApp: AppRuntime | undefined;

function cookieValue(header: string | string[] | undefined, name: string): string | undefined {
  const raw = Array.isArray(header) ? header.join(";") : header ?? "";
  for (const part of raw.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === name && v && /^[0-9a-f]{32}$/.test(v)) return v;
  }
  return undefined;
}

function runtimeFor(req: IncomingMessage, res: ServerResponse): AppRuntime {
  if (liveApp) return liveApp;
  const now = Date.now();
  for (const [id, e] of sessions) if (now - e.last > 3_600_000) sessions.delete(id);
  let sid = cookieValue(req.headers["cookie"], "allowance_sid");
  let entry = sid ? sessions.get(sid) : undefined;
  if (!sid || !entry) {
    if (sessions.size >= 300) {
      const oldest = sessions.keys().next().value;
      if (oldest !== undefined) sessions.delete(oldest);
    }
    sid = randomBytes(16).toString("hex");
    entry = { rt: new AppRuntime("demo", undefined, sharedLimiter), last: now };
    const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
    res.setHeader("set-cookie", `allowance_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${secure}`);
  } else {
    sessions.delete(sid); // re-insert below so the oldest-first eviction is least-recently-used
  }
  entry.last = now;
  sessions.set(sid, entry);
  return entry.rt;
}

async function main() {
  if (mode === "live") liveApp = await AppRuntime.create("live");

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;
      const method = req.method ?? "GET";

      if (method === "GET" && path === "/api/health") {
        // Render calls this to decide whether the service is healthy. The extra fields show where it runs.
        return send(res, 200, {
          ok: true,
          platform: process.env["RENDER"] ? "render" : "local",
          service: process.env["RENDER_SERVICE_NAME"] ?? null,
          commit: (process.env["RENDER_GIT_COMMIT"] ?? "").slice(0, 7) || null,
          uptimeSec: Math.round(process.uptime()),
        });
      }
      const app = runtimeFor(req, res);

      if (method === "GET" && path === "/") {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy":
            "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
        });
        return void res.end(html);
      }

      if (!path.startsWith("/api/")) return send(res, 404, { error: "Not found" });

      // Block cross-site browser requests outright.
      if (method !== "GET" && req.headers["sec-fetch-site"] === "cross-site") return send(res, 403, { error: "Cross-site request refused" });

      const isAgentCall = method === "POST" && path === "/api/agent-call";
      const isRead = method === "GET" && path === "/api/state";
      if (!isAgentCall && !(isRead && ownerOpen)) {
        const given = String(req.headers["x-owner-token"] ?? "");
        if (!ownerOpen && !safeEqual(given, ownerToken)) return send(res, 401, { error: "Owner token required. Open the link printed in the terminal." });
      }

      if (isRead) return send(res, 200, app.state());

      if (isAgentCall) {
        const body = (await readJson(req)) as { tool?: unknown; args?: unknown };
        if (typeof body.tool !== "string") return send(res, 400, { error: "tool must be a string" });
        const r = await app.gateway.handleToolCall(body.tool, body.args);
        return send(res, 200, {
          kind: r.kind,
          agentSees: r.agent,
          reasons: "decision" in r ? r.decision.reasons : [],
          approvalId: r.kind === "PENDING_APPROVAL" ? r.approvalId : undefined,
        });
      }

      const approval = /^\/api\/approvals\/([0-9a-f-]{36})\/(approve|deny)$/.exec(path);
      if (method === "POST" && approval) {
        const [, id, action] = approval;
        const done = await app.gateway.resolveApproval(id as string, action === "approve", "owner");
        return send(res, 200, { status: done.status, result: done.result });
      }
      if (method === "POST" && path === "/api/approvals/deny-all") return send(res, 200, { denied: await app.denyAllPending("owner") });
      if (method === "POST" && path === "/api/kill-switch") {
        const body = (await readJson(req)) as { on?: unknown };
        app.setKillSwitch(body.on === true, "owner");
        return send(res, 200, { killSwitch: body.on === true });
      }
      if (method === "POST" && path === "/api/policy/propose") {
        const body = (await readJson(req)) as { text?: unknown; preset?: unknown };
        try {
          const input = typeof body.preset === "string" ? { preset: body.preset } : { text: typeof body.text === "string" ? body.text : "" };
          return send(res, 200, await app.proposePolicy(input));
        } catch (err) {
          return send(res, 400, { error: err instanceof Error ? err.message : "Could not draft that policy." });
        }
      }
      if (method === "POST" && path === "/api/policy/apply") {
        const body = (await readJson(req)) as { proposalId?: unknown };
        try {
          return send(res, 200, app.applyPolicy(typeof body.proposalId === "string" ? body.proposalId : "", "owner"));
        } catch (err) {
          return send(res, 400, { error: err instanceof Error ? err.message : "Could not apply that policy." });
        }
      }
      if (method === "POST" && path === "/api/redteam/run") return send(res, 200, await app.redTeam());
      if (method === "POST" && path === "/api/agent/run") {
        const body = (await readJson(req)) as { engine?: unknown };
        const engine = body.engine === "llm" || body.engine === "obedient" ? body.engine : "auto";
        try {
          return send(res, 200, await app.runAgent(engine));
        } catch (err) {
          return send(res, 400, { error: err instanceof Error ? err.message : "Agent run failed" });
        }
      }
      if (method === "POST" && path === "/api/demo/reset") {
        app.reset();
        return send(res, 200, { ok: true });
      }
      if (method === "POST" && path === "/api/demo/tamper") {
        app.tamper();
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: "Not found" });
    } catch (err) {
      if (err instanceof GatewayError) return send(res, 409, { error: err.message });
      if (err instanceof Error && err.message === "Request too large") return send(res, 413, { error: "Request too large" });
      if (err instanceof SyntaxError) return send(res, 400, { error: "Body must be valid JSON" });
      console.error("Request error:", err instanceof Error ? err.message : err);
      return send(res, 500, { error: err instanceof Error ? err.message : "Server error" });
    }
  });

  server.listen(port, host, () => {
    const shown = host === "0.0.0.0" ? "localhost" : host;
    console.log(`\nAllowance dashboard (${mode.toUpperCase()} mode)`);
    console.log(mode === "demo" ? `Open: http://${shown}:${port}/   (simulated PayPal, nothing is real)` : `Open: http://${shown}:${port}/?token=${ownerToken}`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
