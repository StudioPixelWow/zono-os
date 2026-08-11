/*
 * P5.10 — Owner Intelligence QA (LOCAL, no DB, no network).
 * Proves the management classifiers are deterministic + explainable: activity
 * state rules, health categories with reasons + declared missing signals, risk
 * flags (NOT predictive churn), and that missing data yields UNKNOWN — never a
 * fabricated metric or opaque score. Run: npx tsx scripts/platform-intel-qa.ts
 */
import {
  resolveActivity, resolveHealth, riskFlags, freshnessLabel, daysAgo,
  type ActivityState,
} from "../src/lib/platform-admin/intel/model";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

function main(): void {
  console.log("P5.10 owner-intelligence QA\n");

  // ── 1. Activity rules (deterministic). ──
  assert(resolveActivity(ago(3), ago(50), NOW) === "NEW", "created ≤14d → NEW (even if last activity is old)");
  assert(resolveActivity(ago(60), ago(2), NOW) === "ACTIVE", "activity ≤7d → ACTIVE");
  assert(resolveActivity(ago(60), ago(20), NOW) === "LOW_ACTIVITY", "activity ≤30d → LOW_ACTIVITY");
  assert(resolveActivity(ago(60), ago(45), NOW) === "INACTIVE", "activity >30d → INACTIVE");
  assert(resolveActivity(ago(60), null, NOW) === "UNKNOWN", "no activity signal → UNKNOWN (not fabricated)");

  // ── 2. Health CRITICAL. ──
  const crit = resolveHealth({ activity: "ACTIVE", billingState: "PAYMENT_FAILED", opsCritical: false, opsFailedJobs: 0, integrationDisconnected: 0, openUrgentTickets: 0, productPresence: true });
  assert(crit.state === "CRITICAL" && crit.reasons.includes("כשל תשלום"), "payment failed → CRITICAL with reason");
  assert(resolveHealth({ activity: "ACTIVE", billingState: null, opsCritical: true, opsFailedJobs: 30, integrationDisconnected: 0, openUrgentTickets: 0, productPresence: true }).state === "CRITICAL", "ops critical → CRITICAL");
  assert(resolveHealth({ activity: "ACTIVE", billingState: null, opsCritical: false, opsFailedJobs: 0, integrationDisconnected: 0, openUrgentTickets: 2, productPresence: true }).state === "CRITICAL", "open urgent ticket → CRITICAL");

  // ── 3. Health AT_RISK / WATCH / HEALTHY / UNKNOWN. ──
  assert(resolveHealth({ activity: "INACTIVE", billingState: null, opsCritical: false, opsFailedJobs: 0, integrationDisconnected: 0, openUrgentTickets: 0, productPresence: true }).state === "AT_RISK", "inactive → AT_RISK");
  assert(resolveHealth({ activity: "ACTIVE", billingState: "GRACE", opsCritical: false, opsFailedJobs: 0, integrationDisconnected: 0, openUrgentTickets: 0, productPresence: true }).state === "AT_RISK", "grace → AT_RISK");
  assert(resolveHealth({ activity: "LOW_ACTIVITY", billingState: null, opsCritical: false, opsFailedJobs: 0, integrationDisconnected: 0, openUrgentTickets: 0, productPresence: true }).state === "WATCH", "low activity → WATCH");
  assert(resolveHealth({ activity: "ACTIVE", billingState: null, opsCritical: false, opsFailedJobs: 0, integrationDisconnected: 0, openUrgentTickets: 0, productPresence: true }).state === "HEALTHY", "active + no negatives → HEALTHY");
  const unknown = resolveHealth({ activity: "UNKNOWN", billingState: null, opsCritical: null, opsFailedJobs: null, integrationDisconnected: null, openUrgentTickets: null, productPresence: null });
  assert(unknown.state === "UNKNOWN", "no signals → UNKNOWN");
  assert(unknown.missing.length >= 3, "UNKNOWN declares which signals are missing");

  // ── 4. Explainability: every result carries reasons. ──
  assert(crit.reasons.length > 0, "CRITICAL has ≥1 reason");
  assert(resolveHealth({ activity: "ACTIVE", billingState: null, opsCritical: false, opsFailedJobs: 0, integrationDisconnected: 0, openUrgentTickets: 0, productPresence: true }).reasons.length > 0, "HEALTHY has an explanation too");

  // ── 5. Risk flags are deterministic indicators (NOT predictive churn). ──
  const flags = riskFlags({ activity: "INACTIVE", billingState: "PAYMENT_FAILED", integrationDisconnected: 1, openUrgentTickets: 1, opsCritical: true, productPresence: false });
  const keys = flags.map((f) => f.key);
  assert(keys.includes("no_activity") && keys.includes("payment_failed") && keys.includes("integration_down") && keys.includes("urgent_ticket") && keys.includes("low_adoption"), "all risk indicators fire deterministically");
  assert(riskFlags({ activity: "ACTIVE", billingState: null, integrationDisconnected: 0, openUrgentTickets: 0, opsCritical: false, productPresence: true }).length === 0, "healthy org → no risk flags");

  // ── 6. Freshness (honest, never implies real-time). ──
  assert(freshnessLabel(null, NOW) === "אין נתונים", "no data → honest label");
  assert(freshnessLabel(ago(1), NOW) === "אתמול", "1 day → אתמול");
  assert(freshnessLabel(ago(5), NOW) === "לפני 5 ימים", "5 days → לפני 5 ימים");
  assert(daysAgo(ago(10), NOW) === 10, "daysAgo computes correctly");

  // ── 7. No opaque score: health returns a category string, never a number. ──
  assert(typeof crit.state === "string" && ["HEALTHY", "WATCH", "AT_RISK", "CRITICAL", "UNKNOWN"].includes(crit.state), "health is a category, not a 0-100 score");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
void ({} as ActivityState);
main();
