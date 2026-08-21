// ============================================================================
// ZONO — Management Center COCKPIT: deterministic PURE coverage. Verifies the
// executive model keeps ACTUAL vs EXPECTED vs POTENTIAL money distinct, bounds
// decisions + ZONO insights (≤3, hidden without evidence), ranks the team
// deterministically by ACTIVITY (never conversion/targets), consolidates risk,
// exposes real health factors, sums pipeline stages, bounds the calendar, and
// degrades to honest empty/single-member states. Never fabricates a trend series.
// org/role isolation + drawer-without-nav are server/client (HUMAN_E2E / RLS).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/management-cockpit.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildManagementCockpit, moneySplit, pipelineFunnel, teamLeaderboard, riskCenter, healthFactors, execBrief,
  type ManagementInput, type MgmtAgent, type MgmtExecItem, type MgmtDecision,
} from "../../src/lib/management/cockpit.ts";

const NOW = Date.parse("2026-08-21T09:00:00Z");
const agent = (p: Partial<MgmtAgent> & { id: string; name: string }): MgmtAgent => ({ avatarUrl: null, activeProperties: 0, openLeads: 0, activeDeals: 0, todayMeetings: 0, overdueFollowups: 0, attention: 0, ...p });
function input(o: Partial<ManagementInput> = {}): ManagementInput {
  return { managerName: null, hasTeamAccess: true, score: null, revenue: null, pipeline: [], atRisk: [], deals: null, leads: null, agents: [], meetingsToday: [], approvals: 0, automation: null, execItems: [], decisions: [], nowMs: NOW, ...o };
}

// ── 1: money keeps POTENTIAL / EXPECTED / CEILING distinct; closed is a count ─
test("1: money split never blurs potential, expected, ceiling; closed is a count", () => {
  const m = moneySplit({ pipelineValue: 20_000_000, weightedRevenue: 350_000, expectedCommission: 600_000 }, 4, 10);
  assert.equal(m.potential, 20_000_000);
  assert.equal(m.expected, 350_000);
  assert.equal(m.ceiling, 600_000);
  assert.equal(m.closedCount, 4);          // a COUNT, never presented as money
  assert.equal(m.avgDeal, 2_000_000);
  assert.notEqual(m.potential, m.expected); // distinct
});

// ── 2: decisions bounded to ≤3 ────────────────────────────────────────────────
test("2: decisions are bounded to 3", () => {
  const decisions: MgmtDecision[] = Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, headline: `החלטה ${i}`, summary: "", whyNow: "סיבה", action: "פעל", impact: "", confidence: null, href: null }));
  const cc = buildManagementCockpit(input({ decisions }));
  assert.equal(cc.decisions.length, 3);
});

// ── 3/4: ZONO ≤3 and hidden without evidence ──────────────────────────────────
test("3: execBrief caps at 3 insights", () => {
  const decisions: MgmtDecision[] = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, headline: `H${i}`, summary: "", whyNow: "כי", action: "", impact: "", confidence: null, href: null }));
  assert.equal(execBrief([], decisions).length, 3);
});
test("4: no insight is emitted without evidence/reason", () => {
  const items: MgmtExecItem[] = [{ kind: "risk", title: "ריק", why: "", impact: "", evidence: [], confidence: 50, href: null }];
  assert.equal(execBrief(items, []).length, 0);
  const decisionsNoWhy: MgmtDecision[] = [{ id: "x", headline: "H", summary: "", whyNow: "", action: "", impact: "", confidence: null, href: null }];
  assert.equal(execBrief([], decisionsNoWhy).length, 0);
});

// ── 5: health factors are real dimensions, drags first ────────────────────────
test("5: healthFactors surfaces the lowest dimensions and flags the drags", () => {
  const f = healthFactors({ overall: 50, grade: "בינוני", state: "needs_attention", trend: "flat", confidence: 70, dimensions: [
    { key: "growth", label: "צמיחה", score: 30, basis: "מעט לידים" },
    { key: "exec", label: "ביצוע", score: 80, basis: "טוב" },
    { key: "cov", label: "כיסוי", score: 45, basis: "חלקי" },
    { key: "data", label: "נתונים", score: null, basis: "חסר" },
  ] });
  assert.deepEqual(f.map((x) => x.key), ["growth", "cov", "exec"]); // lowest first, nulls excluded
  assert.equal(f[0].dragging, true);   // 30 < 50
  assert.equal(f[2].dragging, false);  // 80 > 50
});

// ── 6: team ranking is deterministic by activity, bounded to 5 ────────────────
test("6: team leaderboard ranks by activity deterministically, top 5", () => {
  const agents = [
    agent({ id: "a", name: "אbg", activeDeals: 1 }),
    agent({ id: "b", name: "ב", activeDeals: 3, todayMeetings: 1 }),
    agent({ id: "c", name: "ג", openLeads: 2 }),
    ...Array.from({ length: 5 }, (_, i) => agent({ id: `z${i}`, name: `z${i}` })),
  ];
  const rows = teamLeaderboard(agents, "performance");
  assert.equal(rows.length, 5);
  assert.equal(rows[0].id, "b"); // 3*3 + 1*2 = 11, highest
  // deterministic: same input → same order
  assert.deepEqual(teamLeaderboard(agents).map((r) => r.id), rows.map((r) => r.id));
});
test("6b: attention mode ranks by needs-attention", () => {
  const rows = teamLeaderboard([agent({ id: "a", name: "a", attention: 1 }), agent({ id: "b", name: "b", attention: 5 })], "attention");
  assert.equal(rows[0].id, "b");
});

// ── 7: risk center consolidates real counts into ≤3, positive only ────────────
test("7: risk center yields ≤3 categories from real counts (positive only)", () => {
  const cc = buildManagementCockpit(input({
    atRisk: [{ id: "d1", title: "עסקה", value: 3_000_000, risk: 80, href: "/deals/d1" }],
    leads: { unassigned: 4, hot: 2, overdue: 6, newToday: 1 },
    deals: { active: 10, stuck: 3, lateStage: 2, wonPeriod: 1 },
  }));
  assert.ok(cc.risks.length <= 3);
  assert.equal(cc.risks[0].key, "at_risk");
  assert.equal(cc.risks[0].tone, "danger");
  assert.ok(cc.risks.every((r) => r.count > 0));
});
test("7b: no risk category when everything is clean", () => {
  assert.equal(buildManagementCockpit(input({ leads: { unassigned: 0, hot: 0, overdue: 0, newToday: 0 }, deals: { active: 5, stuck: 0, lateStage: 1, wonPeriod: 2 } })).risks.length, 0);
});

// ── 8: no fabricated trend series (health carries a state enum, not a timeline) ─
test("8: the cockpit exposes no health time-series (trend is a state, not history)", () => {
  const cc = buildManagementCockpit(input({ score: { overall: 42, grade: "דורש שיפור", state: "needs_attention", trend: "down", confidence: 60, dimensions: [] } }));
  assert.equal(cc.score?.trend, "down");
  assert.ok(!("history" in (cc.score ?? {})) && !("series" in (cc.score ?? {})));
});

// ── 9: pipeline funnel totals equal the sum of stages ─────────────────────────
test("9: funnel sums stage counts and values", () => {
  const f = pipelineFunnel([{ stage: "new", label: "חדש", count: 5, value: 10 }, { stage: "neg", label: "מו״מ", count: 3, value: 20 }]);
  assert.equal(f.totalCount, 8);
  assert.equal(f.totalValue, 30);
  assert.equal(f.stages[0].pct, 100); // 5 is the max
});

// ── 12: calendar bounded ──────────────────────────────────────────────────────
test("12: today's meetings are bounded to 5", () => {
  const meetingsToday = Array.from({ length: 9 }, (_, i) => ({ id: `m${i}`, title: `פגישה ${i}`, time: "10:00", agentName: null, kind: "meeting" }));
  assert.equal(buildManagementCockpit(input({ meetingsToday })).meetings.length, 5);
});

// ── 13: automation healthy state ──────────────────────────────────────────────
test("13: automation is healthy only with zero failures", () => {
  assert.equal(buildManagementCockpit(input({ automation: { active: 4, failed: 0, successPct: 100 } })).automation?.healthy, true);
  assert.equal(buildManagementCockpit(input({ automation: { active: 4, failed: 2, successPct: 60 } })).automation?.healthy, false);
});

// ── 14: role gating — no team access ⇒ empty leaderboard ──────────────────────
test("14: without team access the leaderboard is empty (gated)", () => {
  const cc = buildManagementCockpit(input({ hasTeamAccess: false, agents: [agent({ id: "a", name: "a", activeDeals: 3 })] }));
  assert.equal(cc.team.rows.length, 0);
  assert.equal(cc.team.total, 1);
});

// ── 15: empty office state ────────────────────────────────────────────────────
test("15: empty office yields hasData=false and safe empties", () => {
  const cc = buildManagementCockpit(input({}));
  assert.equal(cc.hasData, false);
  assert.equal(cc.money, null);
  assert.equal(cc.insights.length, 0);
  assert.equal(cc.risks.length, 0);
  assert.equal(cc.funnel.totalCount, 0);
});

// ── 16: single-member office state ────────────────────────────────────────────
test("16: single-member office ranks exactly one agent", () => {
  const cc = buildManagementCockpit(input({ agents: [agent({ id: "solo", name: "לבד", activeDeals: 2 })] }));
  assert.equal(cc.team.rows.length, 1);
  assert.equal(cc.team.rows[0].id, "solo");
  assert.equal(cc.hasData, true);
});
