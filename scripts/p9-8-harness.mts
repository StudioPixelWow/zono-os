// ============================================================================
// P9.8 — Facebook Distribution Intelligence: pure-logic regression tests.
// group-network reconciliation planner + property marketing-health formula.
// Run: npx tsx scripts/p9-8-harness.mts
// ============================================================================
import { planReconcile, type GroupStateRow } from "../src/lib/distribution/group-network-core.ts";
import { computeMarketingHealth } from "../src/lib/distribution/property-marketing-health.ts";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`FAIL: ${name}`); } };

// ── Reconciliation planner (§A / §B6) ────────────────────────────────────────
const rows: GroupStateRow[] = [
  { id: "g1", externalGroupId: "111", status: "discovered", source: "scan" }, // still seen → unchanged
  { id: "g2", externalGroupId: "222", status: "discovered", source: "scan" }, // vanished → unavailable
  { id: "g3", externalGroupId: "333", status: "active", source: "scan" },     // vanished but ACTIVE → preserve
  { id: "g4", externalGroupId: "444", status: "ignored", source: "scan" },    // vanished but IGNORED → preserve
  { id: "g5", externalGroupId: "555", status: "unavailable", source: "scan" },// seen again → restore
  { id: "g6", externalGroupId: null, status: "active", source: "manual" },    // manual → never touched
];
const plan = planReconcile(rows, ["111", "555"]);
ok("vanished discovered → unavailable", plan.toUnavailable.includes("g2"));
ok("vanished ACTIVE preserved (not unavailable)", !plan.toUnavailable.includes("g3"));
ok("vanished IGNORED preserved (not unavailable)", !plan.toUnavailable.includes("g4"));
ok("manual never marked unavailable", !plan.toUnavailable.includes("g6"));
ok("reappeared unavailable → restore", plan.toRestore.includes("g5"));
ok("still-seen discovered stays (not unavailable/restore)", !plan.toUnavailable.includes("g1") && !plan.toRestore.includes("g1"));
ok("only one group marked unavailable", plan.toUnavailable.length === 1);
// Idempotency: re-running with the same batch produces no NEW unavailable (g2 now unavailable).
const rows2 = rows.map((r) => (r.id === "g2" ? { ...r, status: "unavailable" } : r));
const plan2 = planReconcile(rows2, ["111", "555"]);
ok("idempotent: no re-mark of already-unavailable", plan2.toUnavailable.length === 0);
const emptyScan = planReconcile(rows, []);
ok("empty scan preserves active/ignored/manual", !emptyScan.toUnavailable.includes("g3") && !emptyScan.toUnavailable.includes("g4") && !emptyScan.toUnavailable.includes("g6"));
ok("empty scan marks all neutral discovered unavailable", emptyScan.toUnavailable.includes("g1") && emptyScan.toUnavailable.includes("g2"));

// ── Marketing health (§Q) — deterministic formula ────────────────────────────
const full = computeMarketingHealth({ hasApprovedCreative: true, activeGroups: 12, futureScheduledPosts: 7, daysSinceLastPublication: 2, facebookLeads: 6 });
ok("full signals → 100", full.score === 100);
const empty = computeMarketingHealth({ hasApprovedCreative: false, activeGroups: 0, futureScheduledPosts: 0, daysSinceLastPublication: null, facebookLeads: 0 });
ok("no signals → 0", empty.score === 0);
ok("no creative → creative factor earns 0", empty.factors[0].earned === 0);
ok("creative present → 25", computeMarketingHealth({ hasApprovedCreative: true, activeGroups: 0, futureScheduledPosts: 0, daysSinceLastPublication: null, facebookLeads: 0 }).score === 25);
ok("recency 10d → half recency (10)", computeMarketingHealth({ hasApprovedCreative: false, activeGroups: 0, futureScheduledPosts: 0, daysSinceLastPublication: 10, facebookLeads: 0 }).score === 10);
ok("recency 20d → 0 recency", computeMarketingHealth({ hasApprovedCreative: false, activeGroups: 0, futureScheduledPosts: 0, daysSinceLastPublication: 20, facebookLeads: 0 }).score === 0);
ok("5 active groups → half group weight (10)", computeMarketingHealth({ hasApprovedCreative: false, activeGroups: 5, futureScheduledPosts: 0, daysSinceLastPublication: null, facebookLeads: 0 }).score === 10);
ok("score never exceeds 100", computeMarketingHealth({ hasApprovedCreative: true, activeGroups: 999, futureScheduledPosts: 99, daysSinceLastPublication: 0, facebookLeads: 999 }).score === 100);
ok("every factor has a reason label", full.factors.every((f) => f.label.length > 0));

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
