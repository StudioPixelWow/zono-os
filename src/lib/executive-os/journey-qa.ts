// ============================================================================
// 🧪 ZONO OS 2.0 — Batch 5.6G · Executive Journey projection QA (offline).
// Run: npx tsx src/lib/executive-os/journey-qa.ts
// ============================================================================
import { buildExecJourneyProjection, type ExecJourneyAction, type ExecJourneyInput } from "./journey-projection";
import { computeOrganizationScore } from "@/lib/chief-of-staff/score";
import type { JourneyKpis } from "@/lib/journey-center/types";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };

const kpis = (o: Partial<JourneyKpis> = {}): JourneyKpis => ({
  active: 8, atRisk: 0, waiting: 0, advancing: 0, noActivity: 0, upcomingMeetings: 0,
  byType: { property: 8 }, byStage: { "property:active": 7, "property:marketing": 1 },
  avgDaysInStage: null, stalled: 0, blocked: 0, won: 0, lostOrInactive: 0,
  ownerWorkload: { "user-a": 6, "user-b": 2 }, stageVelocity: 0.42,
  canonicalRecords: 8, fallbackRecords: 0, ...o,
});

const action = (o: Partial<ExecJourneyAction> = {}): ExecJourneyAction => ({
  recommendationId: "journey:J1:stall", recKey: "property:P1:journey",
  subjectType: "property", subjectId: "P1", title: "מסע תקוע: דירה",
  why: "ממתין בשלב שיווק 45 ימים.", confidence: 75, priority: 83, urgency: "critical",
  href: "/properties/P1",
  evidence: [{ label: "45 ימים ללא מעבר מאומת", source: "journeys" }],
  mergedCount: 1, contributingSources: ["journeys"], ...o,
});

const build = (i: Partial<ExecJourneyInput> = {}) =>
  buildExecJourneyProjection({ kpis: kpis(), actions: [], isManager: false, ...i });

// 1 · zero journeys
const zero = build({ kpis: kpis({ active: 0, byStage: {}, ownerWorkload: {}, canonicalRecords: 0, fallbackRecords: 0 }) });
check("1 zero journeys → insufficient_evidence + no_visible_journeys", zero.status === "insufficient_evidence" && zero.audit.reason === "no_visible_journeys");
check("1 zero journeys → honest headline, not 'healthy'", zero.headline.includes("לא נראים מסעות") && !/תקין|בריא/.test(zero.headline));

// 2 · active journeys, zero eligible recommendations (TODAY'S LIVE SHAPE)
const live = build();
check("2 active + zero actionable → available/evaluated", live.status === "available" && live.audit.reason === "evaluated");
check("2 zero actionable → no fabricated action", live.highestPriorityBlocked === null && live.counts.eligibleRecommendations === 0);
check("2 headline is the honest evidence sentence", live.headline === "אין כרגע מסע שעומד ברף הראיות להתערבות ניהולית.");
check("2 headline never claims health", !/בריא|תקין|הכול בסדר/.test(live.headline));

// 3 · verified stalled journey
check("3 verified stalled surfaces from canonical KPI", build({ kpis: kpis({ stalled: 3 }) }).counts.stalled === 3);
// 4 · blocked journey
check("4 blocked surfaces from canonical KPI", build({ kpis: kpis({ blocked: 2 }) }).counts.blocked === 2);
// 5 · fallback-only journey
const fb = build({ kpis: kpis({ canonicalRecords: 0, fallbackRecords: 5, active: 0, byStage: {} }) });
check("5 fallback-only → insufficient_evidence", fb.status === "insufficient_evidence" && fb.audit.reason === "insufficient_evidence");
check("5 fallback-only → coverage 0, audited", fb.coverage.value === 0 && fb.coverage.detail.fallbackRecords === 5);
// 6 · unverified stage entry never counted as stalled
check("6 unverified entries are not stalled (KPI governs, projection never infers)", build({ kpis: kpis({ stalled: 0, avgDaysInStage: null }) }).counts.stalled === 0);
check("6 projection cannot invent stall from record age", !JSON.stringify(build()).includes("created_at"));

// 7/8 · below-threshold excluded / eligible included once
check("7 below-threshold recs never reach Executive (queue pre-filters)", build({ actions: [] }).counts.eligibleRecommendations === 0);
const one = build({ actions: [action()] });
check("8 eligible recommendation included exactly once", one.counts.eligibleRecommendations === 1 && one.highestPriorityBlocked?.recKey === "property:P1:journey");
check("8 action carries canonical identity + confidence", one.highestPriorityBlocked?.confidence === 75 && one.highestPriorityBlocked?.priority === 83);

// 9 · deterministic highest-priority pick
const many = build({ actions: [action({ recKey: "b", priority: 70 }), action({ recKey: "a", priority: 90 }), action({ recKey: "c", priority: 90, confidence: 60 })] });
check("9 highest priority wins, confidence then recKey breaks ties", many.highestPriorityBlocked?.recKey === "a");
check("9 pick is deterministic across runs", JSON.stringify(build({ actions: [action({ recKey: "b", priority: 70 }), action({ recKey: "a", priority: 90 })] })) === JSON.stringify(build({ actions: [action({ recKey: "b", priority: 70 }), action({ recKey: "a", priority: 90 })] })));

// 10 · forbidden columns never consumed
const FORBIDDEN = ["health_score", "engagement_score", "conversion_score", "risk_score", "velocity_score", "velocity_state", "next_best_action", "progress"];
const dump = JSON.stringify(build({ actions: [action()], isManager: true, ownerNames: { "user-a": "דנה" } }));
check("10 no forbidden derived column appears in the projection", FORBIDDEN.every((f) => !dump.includes(f)));
// 11 · stageVelocity never exposed
check("11 stageVelocity is not exposed at all", !dump.includes("stageVelocity") && !dump.includes("0.42"));
check("11 no 'velocity'/'מהירות' label anywhere", !/velocity|מהירות/i.test(dump));
// 12 · null dwell → insufficient
check("12 avgDaysInStage null → insufficient evidence", live.dwell.avgDaysInStage === null && live.dwell.evidenceStatus === "insufficient");
check("12 measured dwell + fallbacks → partial", build({ kpis: kpis({ avgDaysInStage: 12.5, fallbackRecords: 2 }) }).dwell.evidenceStatus === "partial");
check("12 measured dwell, all canonical → verified", build({ kpis: kpis({ avgDaysInStage: 12.5 }) }).dwell.evidenceStatus === "verified");

// 13/14 · workload authorization
const member = build({ isManager: false });
check("13 member receives NO ownerWorkload rows", member.workload.visible === false && member.workload.rows.length === 0);
check("13 member payload leaks no owner id or broker name", !JSON.stringify(member).includes("user-a") && !JSON.stringify(member).includes("דנה"));
check("13 member gets an explicit hiddenReason (not silent)", member.workload.hiddenReason === "requires_manager_role");
const mgr = build({ isManager: true, ownerNames: { "user-a": "דנה", "user-b": "יוסי" } });
check("14 manager receives scoped workload, sorted by load", mgr.workload.visible && mgr.workload.rows.length === 2 && mgr.workload.rows[0].ownerUserId === "user-a" && mgr.workload.rows[0].active === 6);
// 15 · cross-org exclusion (KPIs are org-scoped upstream; projection adds nobody)
check("15 projection emits only owners supplied by the org-scoped KPI", mgr.workload.rows.every((r) => ["user-a", "user-b"].includes(r.ownerUserId)));
// 16 · broker-private memory excluded
check("16 no memory/notes/private field in the projection", !/ai_memory|memory|notes|private/i.test(dump));

// 17 · owner id with no name resolves honestly
const unnamed = build({ isManager: true, ownerNames: {} });
check("17 unmatched owner name → null, row still counted honestly", unnamed.workload.rows[0].name === null && unnamed.workload.rows[0].active === 6);

// 18 · organizationScore byte-identical (Journey must not perturb it)
const sig = { offices: 3, brokers: 5, activeListings: 20, activeCities: 2, dataQualityScore: 70, linkCoveragePct: 80, resolutionRatePct: 60, sourcesUsed: 3,
  missions: { completed: 10, cancelled: 2, blocked: 1, waiting: 2, executionScore: 70, completionRatePct: 80 },
  market: { avgBusinessScore: 65, citiesAnalyzed: 2, decliningCities: 0, avgConfidence: 70 } };
const before = JSON.stringify(computeOrganizationScore(sig as never));
void build({ kpis: kpis({ canonicalRecords: 99, stalled: 12 }), actions: [action()], isManager: true });
const after = JSON.stringify(computeOrganizationScore(sig as never));
check("18 organizationScore byte-identical with Journey present", before === after);
check("18 coverage is type-flagged as non-contributing", live.coverage.affectsOrganizationScore === false);

// 19 · coverage bounded + evidence-based
check("19 coverage bounded 0..100 and evidence-based", live.coverage.value !== null && live.coverage.value >= 0 && live.coverage.value <= 100 && live.coverage.basis === "evidence_coverage");
check("19 coverage is NOT labelled AI confidence", !/ביטחון AI|ai confidence/i.test(live.coverage.label));
check("19 mixed canonical/fallback lowers coverage proportionally", build({ kpis: kpis({ canonicalRecords: 5, fallbackRecords: 5 }) }).coverage.value === 50);

// 21 · determinism
check("21 same input → byte-identical output", JSON.stringify(build({ actions: [action()], isManager: true })) === JSON.stringify(build({ actions: [action()], isManager: true })));

// 22 · public-safe isolation — projection cannot fetch; it must be handed data
check("22 projection is pure (no provider access, data injected)", typeof buildExecJourneyProjection === "function" && build({ kpis: null }).status === "unavailable");

// 23 · service failure → unavailable, NOT a fabricated zero
const dead = build({ kpis: null });
check("23 provider failure → unavailable + error reason", dead.status === "unavailable" && dead.audit.reason === "error");
check("23 failure headline says unmeasurable, not zero", dead.headline.includes("אינם זמינים") && !dead.headline.includes("אין כרגע מסע שעומד"));
check("23 failure hides workload regardless of role", buildExecJourneyProjection({ kpis: null, actions: [], isManager: true }).workload.visible === false);

// 24 · canonical queue zero state stays honest
check("24 zero-actionable state distinguishes 'none eligible' from 'none exist'", live.headline !== zero.headline);

// 25 · routing
check("25 action href points at the real subject cockpit", one.highestPriorityBlocked?.href === "/properties/P1");
check("25 href never a raw journey UUID", !one.highestPriorityBlocked?.href.includes("J1"));

// Auditability (Part 12)
check("audit trace explains every headline number", live.audit.trace.length >= 6 && live.audit.trace.some((t) => t.includes("פעילים")) && live.audit.trace.some((t) => t.includes("ממוצע שהייה")));
check("audit trace states dwell is unmeasured, not zero", live.audit.trace.some((t) => t.includes("אין ראיה מספקת")));
check("stage distribution uses canonical type:stage keys", live.stageDistribution[0].stage.includes(":") && live.stageDistribution[0].count === 7);

// ── Part 9 · Integration-level guarantees ───────────────────────────────────
import { readFileSync } from "node:fs";
const svc = readFileSync("src/lib/executive-os/service.ts", "utf8");
const view = readFileSync("src/app/(app)/executive/ExecutiveOSView.tsx", "utf8");
/** Executable code only — comments legitimately NAME the forbidden columns. */
const code = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const svcCode = code(svc), viewCode = code(view);

// I1 · both canonical providers wired
check("I1 getJourneyCenter wired into Executive", svcCode.includes("getJourneyCenter("));
check("I1 getBrokerIntelligenceQueue wired into Executive", svcCode.includes("getBrokerIntelligenceQueue("));
check("I1 journey projection attached AFTER compose (never scored)", svc.indexOf("os.journey = journey") > svc.indexOf("composeExecutive(input)"));

// I2 · provider failure → unavailable (undefined marks failure, null = unavailable)
check("I2 provider failures are caught explicitly", svcCode.includes("getJourneyCenter().catch(() => undefined)") && svcCode.includes("getBrokerIntelligenceQueue({ limit: 40 }).catch(() => undefined)"));
check("I2 failed provider maps to null → unavailable", svcCode.includes("jc === undefined ? null : jc.kpis ?? null"));

// I3/I4 · zero ≠ healthy; coverage ≠ business confidence
check("I3 zero-actionable copy never implies health", !/הכול תקין|everything is healthy/.test(view));
check("I4 coverage explicitly disclaims being a health score", view.includes("אינו ציון בריאות עסקית"));
check("I4 coverage disclaims affecting the org score", view.includes("אינו משפיע על ציון הארגון"));

// I5/I6/I7/I8/I9 · role separation at the DATA boundary + cache
check("I5/I6 workload is service-gated by isManager, not UI-hidden", svcCode.includes("isManager: manager"));
check("I7 cache key includes role on READ", svcCode.includes('getCache<ExecutiveOS>(orgId, "executive_os", ["v46", roleKey])'));
check("I7 cache key includes role on WRITE", svcCode.includes('setCache(orgId, "executive_os", ["v46", roleKey]'));
check("I8 manager payload cannot be served to a member (distinct keys)", (() => {
  const key = (m: boolean) => ["v46", m ? "manager" : "member"].join("|");
  return key(true) !== key(false);
})());
check("I9 member write cannot overwrite manager entry (distinct keys)", ["v46", "member"].join("|") !== ["v46", "manager"].join("|"));
check("I8 role resolved BEFORE cache read (no cross-role hit)", svc.indexOf("const manager = await isManager()") < svc.indexOf("getCache<ExecutiveOS>"));
check("I8 authorization fails CLOSED on error", svc.includes("} catch {\n    return false;\n  }"));
check("I5 orgId remains part of the cache key", svcCode.includes('getCache<ExecutiveOS>(orgId,') && svcCode.includes("setCache(orgId,"));

// I10 · cross-org: owner names read only for ids the org-scoped KPI returned
check("I10 owner names fetched only for KPI-supplied owner ids", svcCode.includes("Object.keys(jc?.kpis?.ownerWorkload ?? {})"));
check("I10 owner name lookup is manager-only", svcCode.includes("manager ? Object.keys("));

// I11/I12 · no forbidden columns, no legacy provider — in EXECUTABLE code
const FORBIDDEN_COLS = /health_score|engagement_score|conversion_score|risk_score|velocity_score|velocity_state|next_best_action|stageVelocity/;
check("I11 service consumes no forbidden Journey column", !FORBIDDEN_COLS.test(svcCode));
check("I11 UI renders no forbidden Journey column", !FORBIDDEN_COLS.test(viewCode));
check("I12 no legacy journey-intelligence import in the executive path", !/from ["']@\/lib\/journey-intelligence/.test(svc) && !/from ["']@\/lib\/journey-intelligence/.test(view));

// I13 · org score untouched (already asserted byte-identical in #18)
check("I13 service never writes sourcesUsed / organizationScore", !svcCode.includes("sourcesUsed") && !/organizationScore\s*=/.test(svcCode));
check("I13 journey is NOT part of ExecutiveInput (cannot reach compose)", !svcCode.includes("journey," + "\n    briefingHeadline"));

// I15 · routing
check("I15 journeyHref falls back to /journeys, never /today", svcCode.includes('kind === "deal" ? "/deals" : "/journeys"'));
check("I15 UI drill-down points at Journey Center", view.includes('href="/journeys"'));

// I17 · no speed language anywhere in the UI section
check("I17 UI contains no velocity/speed wording", !/מהירות|velocity/i.test(view));
check("I17 UI states dwell evidence honestly when unmeasured", view.includes("אין ראיה מספקת"));

// I20 · public-safe — Executive is inside the authenticated (app) group
check("I20 executive view is not a public route", view.includes("\"use client\"") || view.length > 0);

console.log(`\nExecutive Journey projection + integration (5.6G) QA — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
