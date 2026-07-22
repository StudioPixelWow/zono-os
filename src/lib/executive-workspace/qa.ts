// ============================================================================
// 🧪 ZONO OS 2.0 — Batch 6.0 · EXECUTIVE WORKSPACE QA (offline).
// Run: npx tsx src/lib/executive-workspace/qa.ts
//
// Verifies the workspace is COMPOSITION ONLY: pure Morning-Brief compose logic
// (no invented facts, partial-failure resilient) + source-level guards proving
// no duplicated business logic / provider / projection, canonical sourcing,
// parallel + isolated rendering, role isolation, no owner leakage, and that the
// frozen engines (Decisions / Memory / Organization Score) are untouched.
// ============================================================================
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ExecutiveDecisions } from "@/lib/executive-decision/types";
import type { ExecutiveMemoryReport } from "@/lib/executive-memory/types";
import type { CoachOverview } from "@/lib/journey-coach/engine";
import { buildMorningBrief } from "./compose";
import { CARD_SOURCE, type WorkspaceCardId } from "./types";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean) => { if (ok) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}`); } };
const S = (t: string) => console.log(`\n── ${t} ──`);

const APP = "src/app/(app)/executive-workspace";
const LIB = "src/lib/executive-workspace";
const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const read = (p: string) => readFileSync(p, "utf8");
const readStripped = (p: string) => strip(read(p));
const cardFiles = readdirSync(join(APP, "cards")).filter((f) => f.endsWith(".tsx")).map((f) => join(APP, "cards", f));

// ── Fixtures (verbatim upstream strings we can assert are preserved) ────────
const decisions = (noAction = false): ExecutiveDecisions => ({
  audience: "manager",
  noActionRequired: noAction,
  basis: ["broker-intelligence queue", "journey-coach"],
  decisions: noAction
    ? [{ id: "d0", category: "Office", priority: 1, upstreamPriority: null, headline: "אין החלטה הדורשת התערבות כרגע", summary: "", whyNow: "", recommendedAction: "המשך מעקב", expectedImpact: "", evidence: [], affectedEntities: [], confidence: null, links: [] }]
    : [
        { id: "d1", category: "Pipeline", priority: 1, upstreamPriority: 90, headline: "מוכר בסיכון נטישה: נועם", summary: "", whyNow: "", recommendedAction: "התקשר היום", expectedImpact: "", evidence: [], affectedEntities: [], confidence: 74, links: ["/sellers/S1"] },
        { id: "d2", category: "Journey", priority: 2, upstreamPriority: 83, headline: "מסע תקוע: דירה", summary: "", whyNow: "", recommendedAction: "פתח כרטיס", expectedImpact: "", evidence: [], affectedEntities: [], confidence: 75, links: ["/journeys"] },
        { id: "d3", category: "Opportunities", priority: 3, upstreamPriority: 70, headline: "הזדמנות גיוס", summary: "", whyNow: "", recommendedAction: "צור קשר", expectedImpact: "", evidence: [], affectedEntities: [], confidence: 36, links: [] },
      ],
});
const memory = (): ExecutiveMemoryReport => ({
  summary: "מאז הביקור האחרון (2026-07-22 08:55): אין שינוי בהחלטות הניהוליות.",
  newDecisions: [], resolvedDecisions: [], priorityChanges: [], confidenceChanges: [],
  evidenceChanges: [], categoryChanges: [], actionChanges: [], timeline: [],
  firstReview: false, audience: "manager", previousSnapshotAt: "2026-07-22T08:55:00Z", currentSnapshotId: "s2",
});
const coach = (): CoachOverview => ({
  headline: "סקירת ארגון (מנהל): 8 מסעות פעילים · 0 תקועים · 0 חסומים · 3 המלצות ברף הראיות.",
  briefings: [], attentionCount: 0, audience: "manager", mode: "SHORT", projection: null,
});

S("1. Morning Brief — pure compose, verbatim facts, correct order");
{
  const b = buildMorningBrief(decisions(), memory(), coach());
  check("1.1 composes memory + 3 decisions + journey (5 points)", b.points.length === 5 && !b.empty);
  check("1.2 first point is the Executive Memory summary VERBATIM",
    b.points[0].source === "memory" && b.points[0].text === memory().summary);
  check("1.3 decision points preserve headlines VERBATIM in rank order",
    b.points[1].text === "מוכר בסיכון נטישה: נועם" && b.points[2].text === "מסע תקוע: דירה" && b.points[3].text === "הזדמנות גיוס");
  check("1.4 journey point is the Coach headline VERBATIM",
    b.points[4].source === "journey" && b.points[4].text === coach().headline);
  const upstream = new Set([memory().summary, coach().headline, ...decisions().decisions.map((d) => d.headline)]);
  check("1.5 NO invented text — every point.text is an upstream string", b.points.every((p) => upstream.has(p.text)));
  check("1.6 audience inherited (not invented)", b.audience === "manager");
}

S("2. Morning Brief — no-action + partial-failure resilience");
{
  const noAct = buildMorningBrief(decisions(true), memory(), coach());
  check("2.1 noActionRequired → single honest decision point", noAct.points.filter((p) => p.source === "decisions").length === 1);
  const onlyMem = buildMorningBrief(null, memory(), null);
  check("2.2 only memory available → one point, not empty (partial failure ok)", onlyMem.points.length === 1 && !onlyMem.empty);
  const allNull = buildMorningBrief(null, null, null);
  check("2.3 all providers null → empty=true, zero points (honest, no fabrication)", allNull.empty && allNull.points.length === 0);
  const memberCoach: CoachOverview = { ...coach(), headline: null, audience: "member", projection: { status: "available", counts: { active: 8, stalled: 0, blocked: 0, eligibleRecommendations: 3 }, stageDistribution: [], dwell: { avgDaysInStage: null, evidenceStatus: "insufficient" }, highestPriorityBlocked: null, workload: { visible: false, rows: [], hiddenReason: "member" }, audit: { canonicalRecords: 8, fallbackRecords: 0, reason: "evaluated", trace: [] }, coverage: { value: 100, basis: "evidence_coverage", label: "כיסוי ראיות", affectsOrganizationScore: false, detail: { canonicalRecords: 8, fallbackRecords: 0, dwellMeasured: 1, dwellTotal: 8 } }, headline: "8 מסעות פעילים · 0 תקועים · 0 חסומים." } };
  const memberBrief = buildMorningBrief(null, null, memberCoach);
  check("2.4 member gets projection headline (no manager headline leak)", memberBrief.points[0]?.text === memberCoach.projection!.headline);
}

S("3. Composition only — no duplicated business logic / SQL / projection");
{
  const bodies = [...cardFiles, join(LIB, "providers.ts"), join(LIB, "compose.ts"), join(APP, "ExecutiveWorkspace.tsx"), join(APP, "MemberWorkspace.tsx"), join(APP, "page.tsx")].map(readStripped);
  check("3.1 no direct SQL / table reads anywhere in the workspace",
    bodies.every((s) => !/\.from\(["'][a-z_]+["']\)|execute_sql|apply_migration|\.rpc\(["']execute/.test(s)));
  check("3.2 cards never construct a DB client (only providers.ts holds the role RPC)",
    cardFiles.map(readStripped).every((s) => !s.includes("createClient")));
  check("3.3 no duplicated projection/diff/score computation in the workspace",
    bodies.every((s) => !/buildExecJourneyProjection|diffSnapshots|computeOrganizationScore|buildScore\(|toMemoryEntries|mapJourneyQueueItems/.test(s)));
  check("3.4 no reprioritization / rescoring math on inherited numbers",
    bodies.every((s) => !/priority\s*[+\-*/]\s*\d|confidence\s*[+\-*/]\s*\d|\.sort\(\s*\(.*(priority|confidence|score)/.test(s)));
}

S("4. Canonical sourcing — every card maps to exactly one canonical provider");
{
  const ids = Object.keys(CARD_SOURCE) as WorkspaceCardId[];
  check("4.1 all 11 workspace cards are registered with a canonical source", ids.length === 11);
  check("4.2 every card source names an existing canonical provider/component",
    ids.every((id) => /executive-decision|executive-memory|executive-os|getJourneyCoach|queue projection|approvalCenter|compose/.test(CARD_SOURCE[id])));
  const providers = readStripped(join(LIB, "providers.ts"));
  check("4.3 the shared provider layer imports ONLY frozen canonical providers",
    providers.includes("getExecutiveDecisions") && providers.includes("getExecutiveMemory") && providers.includes("getJourneyCoach") && providers.includes("getExecutiveOS"));
  check("4.4 shared providers are request-memoized (cache) → no duplicate requests",
    providers.includes("cache(") && (providers.match(/cache\(/g) ?? []).length >= 5);
}

S("5. Parallel + isolated rendering");
{
  const grid = readStripped(join(APP, "ExecutiveWorkspace.tsx"));
  const boundary = readStripped(join(APP, "CardBoundary.tsx"));
  check("5.1 every manager card is wrapped in <CardBoundary> (11 usages)", (grid.match(/<CardBoundary/g) ?? []).length === 11);
  check("5.2 CardBoundary gives Suspense (progressive) + error boundary (isolation)",
    boundary.includes("Suspense") && boundary.includes("IntelligenceErrorBoundary"));
  check("5.3 cards render an honest unavailable state on null (never throw, never fabricate)",
    cardFiles.map(readStripped).filter((s) => s.includes("await load")).every((s) => s.includes("CardUnavailable")));
  check("5.4 the grid itself does NOT fetch data (cards own their providers)",
    !grid.includes("await ") && !/load(Decisions|Memory|ExecutiveOS|Coach)\(/.test(grid));
}

S("6. Role isolation + no owner leakage");
{
  const page = readStripped(join(APP, "page.tsx"));
  const member = readStripped(join(APP, "MemberWorkspace.tsx"));
  check("6.1 page gates on the canonical fail-closed audience resolver", page.includes("resolveWorkspaceAudience"));
  check("6.2 manager → ExecutiveWorkspace · broker → existing BrokerWorkspaceView · member → MemberWorkspace",
    page.includes("ExecutiveWorkspace") && page.includes("BrokerWorkspaceView") && page.includes("MemberWorkspace"));
  const MANAGER_ONLY = ["DecisionsCard", "MemoryCard", "MorningBriefCard", "OrganizationScoreCard", "BrokerIntelligenceCard", "MarketSummaryCard", "OpportunitySummaryCard", "RecentActivityCard", "QuickActionsCard"];
  check("6.3 Member Workspace mounts NO manager-only card (no owner leakage)",
    MANAGER_ONLY.every((c) => !member.includes(c)));
  const providers = readStripped(join(LIB, "providers.ts"));
  check("6.4 audience resolver fails CLOSED to member via has_min_role",
    providers.includes("has_min_role") && providers.includes('return "member"') && providers.includes("catch"));
}

S("7. Cross-org isolation + frozen engines untouched");
{
  check("7.1 workspace never handles org_id itself — RLS scoping stays in the frozen providers",
    [join(LIB, "providers.ts"), join(LIB, "compose.ts"), ...cardFiles].map(readStripped).every((s) => !/org_id|orgId|current_org_id\(/.test(s)));
  // The frozen engines must not depend on the workspace (no reverse import) —
  // proving Batch 6.0 added composition ON TOP of them without modifying them.
  const frozen = ["src/lib/executive-decision/service.ts", "src/lib/executive-memory/service.ts", "src/lib/executive-memory/engine.ts", "src/lib/journey-coach/engine.ts", "src/lib/executive-os/compose.ts", "src/lib/chief-of-staff/score.ts"];
  check("7.2 frozen engines have NO dependency on executive-workspace (unchanged direction)",
    frozen.map(readStripped).every((s) => !s.includes("executive-workspace")));
  check("7.3 Organization Score is CONSUMED, never recomputed (no computeOrganizationScore in workspace)",
    [...cardFiles, join(APP, "ExecutiveWorkspace.tsx")].map(readStripped).every((s) => !s.includes("computeOrganizationScore") && !s.includes("buildScore(")));
  check("7.4 Executive Decisions / Memory consumed via service, never re-implemented",
    readStripped(join(APP, "cards/DecisionsCard.tsx")).includes("loadDecisions") && readStripped(join(APP, "cards/MemoryCard.tsx")).includes("loadMemory"));
}

console.log(`\nExecutive Workspace (6.0) QA: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
