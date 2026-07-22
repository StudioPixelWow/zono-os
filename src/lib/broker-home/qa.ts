// ============================================================================
// 🧪 ZONO OS 2.0 — Batch 6.1 · BROKER WORKSPACE QA (offline).
// Run: npx tsx src/lib/broker-home/qa.ts
//
// Verifies the broker workspace is COMPOSITION ONLY + BROKER-ISOLATED: pure
// compose logic (queue filtered to own entities verbatim, morning brief with no
// generated conclusions, coverage from inherited counts) + source-level guards
// (no duplicate business logic / SQL / projection, canonical sourcing, parallel
// isolated rendering, broker isolation, cross-org isolation, no manager data /
// no owner leakage, coverage / journey counts / broker intelligence unchanged).
// ============================================================================
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DailyOS, DailyAction } from "@/lib/daily-os/types";
import type { ScoredEntity } from "@/lib/broker-workspace/types";
import type { JourneyCenter } from "@/lib/journey-center/types";
import { computeJourneyKpis } from "@/lib/journey-center/kpis";
import { brokerPriorities, ownedEntityIds, recentActivity, brokerCoverage, buildBrokerMorningBrief } from "./compose";
import { BROKER_CARD_SOURCE, type BrokerCardId } from "./types";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean) => { if (ok) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}`); } };
const S = (t: string) => console.log(`\n── ${t} ──`);

const APP = "src/app/(app)/broker-workspace";
const LIB = "src/lib/broker-home";
const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const readStripped = (p: string) => strip(readFileSync(p, "utf8"));
const cardFiles = readdirSync(join(APP, "cards")).filter((f) => f.endsWith(".tsx")).map((f) => join(APP, "cards", f));

// ── Fixtures ────────────────────────────────────────────────────────────────
const ent = (id: string, over: Partial<ScoredEntity> = {}): ScoredEntity =>
  ({ kind: "buyer", id, name: `שם ${id}`, healthScore: 70, healthLabel: "בריא", score: 70, stage: null, reason: null, lastActivityAt: null, riskLabel: null, href: `/buyers/${id}`, ...over });
const act = (id: string, entityId: string, over: Partial<DailyAction> = {}): DailyAction =>
  ({ id, recKey: `k-${id}`, area: "buyer", entityType: "buyer", entityId, title: `פעולה ${id}`, why: "", evidence: [], confidence: 70, priority: 80, urgency: "high", expectedImpact: "", suggestedAction: "בצע", actionClass: "call", mergedCount: 1, contributingSources: [], href: `/x/${entityId}`, startTime: null, endTime: null, durationMin: null, scheduled: true, lifecycle: null, ...over });
const dailyOS = (over: Partial<DailyOS> = {}): DailyOS => ({
  version: "40.0", brokerName: "הסוכן", generatedAt: "t",
  briefing: { greeting: "בוקר טוב", dailyScore: 70, focus: "המשימה", biggestOpportunity: null, biggestRisk: null, aiSummary: "יש לך 3 משימות ו-2 שיחות ממתינות." },
  timeline: [
    { at: "2026-07-22T09:00:00Z", source: "meeting", title: "פגישה עם קונה", detail: "דירה", icon: "📅", href: "/x" },
    { at: "2026-07-22T11:00:00Z", source: "mission", title: "משימה", detail: null, icon: "🎯", href: "/y" },
    { at: "2026-07-22T13:00:00Z", source: "suggested", title: "הצעת סיור", detail: null, icon: "💡", href: "/z" },
  ],
  actionFeed: [act("a1", "B1"), act("a2", "S1"), act("a3", "OTHER")],  // a3 belongs to a NON-owned entity
  operations: [], sinceYouWereAway: [],
  conversation: { whatsappUnread: 0, whatsappWaiting: 0, facebookComments: 0, facebookLeads: 0, waiting: [], drafts: [] },
  territory: { acquisitionStreets: [], buildings: [], opportunities: [{ title: "הזדמנות גיוס", why: "בעלים פרטי", href: "/opp/1" }], marketChanges: [] },
  marketing: { scheduledToday: 0, commentsWaiting: 0, leadApprovals: 0, groupsToPublish: 0, tasks: [] },
  deals: {
    hotBuyers: [ent("B1", { lastActivityAt: "2026-07-20T10:00:00Z" })],
    sellersAtRisk: [ent("S1", { kind: "seller", riskLabel: "churn", lastActivityAt: "2026-07-21T10:00:00Z", href: "/sellers/S1" })],
    criticalListings: [], leadFollowUps: [],
  },
  performance: { daily: 72, weekly: 68, conversionOpportunities: 3, followUpRatePct: 80, weakSpots: [{ title: "מעקב", detail: "שפר מעקב", impact: "medium" }] },
  approvals: [{ id: "ap1", title: "אשר טיוטה", why: "ממתין", source: "AI", href: "/approve/1" }],
  ask: [], notes: [], ...over,
});
const journey = (over: Partial<JourneyCenter["kpis"]> = {}): JourneyCenter => ({
  version: "journey-center@2-canonical", generatedAt: "t", journeys: [],
  kpis: { ...computeJourneyKpis([]), active: 4, waiting: 1, stalled: 1, blocked: 0, canonicalRecords: 6, fallbackRecords: 2, ...over },
  totals: { buyers: 0, sellers: 0, leads: 0, properties: 0 }, hasEntities: true, hasActivity: true, notes: [], diagnostics: [],
});

S("1. Today's Priorities — canonical queue FILTERED to own entities, verbatim");
{
  const os = dailyOS();
  const owned = ownedEntityIds(os);
  check("1.1 owned set = broker's own deal entities only", owned.has("B1") && owned.has("S1") && !owned.has("OTHER"));
  const pri = brokerPriorities(os);
  check("1.2 non-owned queue item ('OTHER') is EXCLUDED (broker isolation)", pri.length === 2 && !pri.some((a) => a.entityId === "OTHER"));
  check("1.3 order + priority preserved verbatim (never reprioritized)",
    pri[0].id === "a1" && pri[1].id === "a2" && pri[0].priority === 80 && pri[0].confidence === 70);
  check("1.4 empty owned set ⇒ empty priorities, never the office-wide feed",
    brokerPriorities(dailyOS({ deals: { hotBuyers: [], sellersAtRisk: [], criticalListings: [], leadFollowUps: [] } })).length === 0);
}

S("2. Morning Brief — compose only, no generated conclusions, partial-failure safe");
{
  const os = dailyOS();
  const b = buildBrokerMorningBrief(os, journey(), brokerPriorities(os));
  check("2.1 composes daily summary + top priority + journey line (3 points)", b.points.length === 3 && !b.empty);
  check("2.2 daily point is the Daily OS aiSummary VERBATIM", b.points[0].source === "daily" && b.points[0].text === os.briefing.aiSummary);
  check("2.3 priority point is the top OWN queue title VERBATIM", b.points[1].source === "priorities" && b.points[1].text === "פעולה a1");
  check("2.4 journey line is inherited COUNTS only (no judgment words)",
    b.points[2].source === "journey" && b.points[2].text.includes("4 מסעות פעילים") && !/כנראה|נראה ש|מומלץ|צריך|חשוב מאוד/.test(b.points[2].text));
  const partial = buildBrokerMorningBrief(os, null, brokerPriorities(os));
  check("2.5 journey provider down → brief still renders (partial failure ok)", partial.points.length === 2 && !partial.empty);
  const allNull = buildBrokerMorningBrief(null, null, []);
  check("2.6 all providers null → empty=true, no fabrication", allNull.empty && allNull.points.length === 0);
}

S("3. Recent Activity + Coverage — inherited, broker-scoped");
{
  const os = dailyOS();
  const ra = recentActivity(os);
  check("3.1 recent activity = OWN entities with activity, newest first", ra.length === 2 && ra[0].id === "S1" && ra[1].id === "B1");
  check("3.2 entities without lastActivityAt are excluded (no fabricated times)",
    recentActivity(dailyOS({ deals: { hotBuyers: [ent("B9")], sellersAtRisk: [], criticalListings: [], leadFollowUps: [] } })).length === 0);
  const cov = brokerCoverage(journey());
  check("3.3 coverage uses INHERITED canonical/fallback counts", cov!.canonicalRecords === 6 && cov!.fallbackRecords === 2 && cov!.total === 8);
  check("3.4 coverage ratio is the standing evidence-coverage definition (75%)", cov!.value === 75);
  check("3.5 no records ⇒ null value (never a fabricated %)", brokerCoverage(journey({ canonicalRecords: 0, fallbackRecords: 0 }))!.value === null);
  check("3.6 no journey ⇒ null coverage (unavailable, not zero-looks-healthy)", brokerCoverage(null) === null);
}

S("4. Composition only — no duplicate business logic / SQL / projection");
{
  const bodies = [...cardFiles, join(LIB, "providers.ts"), join(LIB, "compose.ts"), join(APP, "BrokerWorkspace.tsx"), join(APP, "page.tsx")].map(readStripped);
  check("4.1 no direct SQL / table reads anywhere in the workspace",
    bodies.every((s) => !/\.from\(["'][a-z_]+["']\)|execute_sql|apply_migration/.test(s)));
  check("4.2 cards never construct a DB client", cardFiles.map(readStripped).every((s) => !s.includes("createClient")));
  check("4.3 no duplicated projection / scoring / ranking in the workspace",
    bodies.every((s) => !/buildExecJourneyProjection|computeOrganizationScore|computeJourneyKpis|getBrokerIntelligenceQueue|assembleDailyOS/.test(s)));
  check("4.4 no reprioritization / rescoring math on inherited numbers",
    bodies.every((s) => !/priority\s*[+\-*/]\s*\d|confidence\s*[+\-*/]\s*\d|\.sort\(\s*\(.*(priority|confidence|score)/.test(s)));
}

S("5. Canonical sourcing — each card maps to one broker-scoped provider");
{
  const ids = Object.keys(BROKER_CARD_SOURCE) as BrokerCardId[];
  check("5.1 all 11 cards registered with a canonical source", ids.length === 11);
  check("5.2 every source names an existing broker-scoped provider",
    ids.every((id) => /getDailyOS|getJourneyCenter|compose/.test(BROKER_CARD_SOURCE[id])));
  const providers = readStripped(join(LIB, "providers.ts"));
  check("5.3 provider layer imports ONLY frozen canonical providers (Daily OS + Journey Center)",
    providers.includes("getDailyOS") && providers.includes("getJourneyCenter") && !providers.includes("getBrokerIntelligenceQueue"));
  check("5.4 shared providers are request-memoized (cache) → no duplicate requests",
    providers.includes("cache(") && (providers.match(/cache\(/g) ?? []).length >= 3);
}

S("6. Parallel + isolated rendering");
{
  const grid = readStripped(join(APP, "BrokerWorkspace.tsx"));
  const boundary = readStripped(join(APP, "CardBoundary.tsx"));
  check("6.1 every card wrapped in <CardBoundary> (11 usages)", (grid.match(/<CardBoundary/g) ?? []).length === 11);
  check("6.2 CardBoundary gives Suspense + error boundary", boundary.includes("Suspense") && boundary.includes("IntelligenceErrorBoundary"));
  check("6.3 cards render honest unavailable on null (never throw, never fabricate)",
    cardFiles.map(readStripped).filter((s) => s.includes("await load")).every((s) => s.includes("CardUnavailable")));
  check("6.4 grid does NOT fetch data (cards own their providers)", !grid.includes("await ") && !/load(DailyOS|BrokerJourney)\(/.test(grid));
}

S("7. Broker isolation + no manager / office-wide leakage");
{
  const providers = readStripped(join(LIB, "providers.ts"));
  const compose = readStripped(join(LIB, "compose.ts"));
  const cards = cardFiles.map(readStripped);
  check("7.1 journey provider is OWNER-scoped and fails closed (no org-wide fallback)",
    providers.includes("{ owner: brokerId }") && providers.includes("if (!brokerId) return null"));
  check("7.2 the office-wide 'since you were away' ledger is NEVER surfaced",
    [...cards, compose].every((s) => !s.includes("sinceYouWereAway")));
  check("7.3 Today's Priorities uses the FILTERED broker queue, never the raw office feed",
    readStripped(join(APP, "cards/TodaysPrioritiesCard.tsx")).includes("brokerPriorities") &&
    !readStripped(join(APP, "cards/TodaysPrioritiesCard.tsx")).includes("os.actionFeed"));
  check("7.4 no manager / executive / office-wide provider is imported",
    [...cards, providers, compose].every((s) => !/getExecutiveOS|getChiefOfStaff|getExecutiveDecisions|getExecutiveMemory|OfficeIntelligence/.test(s)));
}

S("8. Cross-org isolation + frozen engines untouched");
{
  const wsFiles = [join(LIB, "providers.ts"), join(LIB, "compose.ts"), ...cardFiles];
  check("8.1 workspace never handles org_id itself — RLS scoping stays in the providers",
    wsFiles.map(readStripped).every((s) => !/org_id|current_org_id\(/.test(s)));
  const frozen = ["src/lib/daily-os/service.ts", "src/lib/daily-os/assemble.ts", "src/lib/journey-center/service.ts", "src/lib/journey-center/kpis.ts", "src/lib/broker-intelligence/aggregate-service.ts", "src/lib/broker-workspace/service.ts"];
  check("8.2 frozen engines have NO dependency on the broker workspace (unchanged)",
    frozen.map(readStripped).every((s) => !s.includes("broker-home")));
  check("8.3 Coverage / Journey counts consumed, never recomputed (no computeJourneyKpis in workspace)",
    wsFiles.map(readStripped).every((s) => !s.includes("computeJourneyKpis")));
  check("8.4 Broker Intelligence consumed via Daily OS (workspace never calls the queue directly)",
    readStripped(join(LIB, "providers.ts")).includes("getDailyOS") && wsFiles.map(readStripped).every((s) => !s.includes("getBrokerIntelligenceQueue")));
}

console.log(`\nBroker Workspace (6.1) QA: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
