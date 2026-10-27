/**
 * CONTINUOUS RED TEAM: runs the full attack suite against the app and exits with an error if ANY attack
 * gets through or any legitimate action is wrongly blocked.
 *
 * Used by:  GitHub Actions on every push (.github/workflows/ci.yml)
 *           an optional hourly Render cron job (see render.yaml)
 * Run it yourself:  npx tsx src/jobs/redteam-ci.ts
 */
import { AppRuntime } from "../app/runtime.js";

const app = new AppRuntime("demo");
const report = await app.redTeam();

console.log(`Attacks stopped:      ${report.attacksStopped}/${report.attacksTotal}`);
console.log(`Legitimate allowed:   ${report.controlsAllowed}/${report.controlsTotal}`);
console.log(`Money out (simulated): $${(report.moneyOutCents / 100).toFixed(2)}  (budget intact: ${report.budgetIntact})`);
for (const r of report.results) if (!r.passed) console.log(`FAILED ${r.id} ${r.name}: ${r.outcome} ${r.codes.join(", ")}`);

const ok = report.attacksStopped === report.attacksTotal && report.controlsAllowed === report.controlsTotal && report.budgetIntact;
console.log(ok ? "\nRED TEAM PASSED" : "\nRED TEAM FAILED");
process.exit(ok ? 0 : 1);
