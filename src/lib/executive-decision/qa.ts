// ============================================================================
// 🧪 ZONO OS 2.0 — Batch 5.8 · EXECUTIVE DECISION ENGINE QA (offline).
// Run: npx tsx src/lib/executive-decision/qa.ts
// ============================================================================
import { readFileSync } from "node:fs";
import { fromCanonicalJourney, type CanonicalJourneyRow, type CanonicalTransition, type EntityFacts } from "@/lib/journey-center/canonical";
import { buildExecJourneyProjection, type ExecJourneyAction } from "@/lib/executive-os/journey-projection";
import { buildCoachOverview } from "@/lib/journey-coach/engine";
import { computeOrganizationScore } from "@/lib/chief-of-staff/score";
import { buildExecutiveDecisions } from "./engine";
import type { DecisionQueueItem } from "./types";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean) => { if (ok) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}`); } };
const S = (t: string) => console.log(`\n── ${t} ──`);

const NOW = Date.parse("2026-07-11T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const efacts = (o: Partial<EntityFacts> = {}): EntityFacts =>
  ({ title: "דירה בקריית ביאליק", href: "/properties/P1", ownerName: null, openTasks: 0, upcomingMeetingAt: null, linked: [], ...o });
const row = (o: Partial<CanonicalJourneyRow> = {}): CanonicalJourneyRow => ({
  id: "J1", orgId: "ORG1", journeyType: "property", entityType: "property", entityId: "P1",
  currentStage: "active", status: "active", ownerUserId: "U1",
  stageEnteredAt: daysAgo(1), lastActivityAt: daysAgo(1), startedAt: daysAgo(30),
  source: "legacy_backfill", metadata: null, ...o,
});
const verified = (jid: string, at: number): CanonicalTransition =>
  ({ journeyId: jid, fromStage: null, toStage: "active", occurredAt: daysAgo(at), reason: null, actorUserId: null, sourceEventId: `evt-${jid}` });

const qi = (o: Partial<DecisionQueueItem> = {}): DecisionQueueItem => ({
  id: "seller:S1:retention", area: "seller", entityType: "seller", entityId: "S1",
  title: "מוכר בסיכון נטישה: נועם", why: "סיכון נטישה גבוה (72) על בסיס CRM.",
  suggestedAction: "צור קשר יזום היום", expectedImpact: "מניעת אובדן הבלעדיות",
  confidence: 74, priority: 90, urgency: "critical", href: "/sellers/S1",
  evidence: [{ label: "סיכון נטישה 72", source: "CRM" }], insufficientEvidence: false, ...o,
});

// Coach fixtures: one stalled+queue-covered journey, one healthy, one unverified.
const stalledJ = fromCanonicalJourney(row({ id: "J2", entityId: "P2" }), verified("J2", 40), efacts({ href: "/properties/P2" }), NOW);
const healthy = fromCanonicalJourney(row(), verified("J1", 3), efacts(), NOW);
const unverified = fromCanonicalJourney(row({ id: "J3", entityId: "P3" }), { ...verified("J3", 40), sourceEventId: null }, efacts({ href: "/properties/P3" }), NOW);
const journeyRec: ExecJourneyAction = {
  recommendationId: "journey:J2:stall", recKey: "property:P2:journey", subjectType: "property", subjectId: "P2",
  title: "מסע תקוע: דירה", why: "40 ימים ללא מעבר מאומת.", confidence: 75, priority: 83, urgency: "critical",
  href: "/properties/P2", evidence: [{ label: "40 ימים ללא מעבר מאומת", source: "journeys" }], mergedCount: 1, contributingSources: ["journeys"],
};
const proj = buildExecJourneyProjection({
  kpis: { active: 3, atRisk: 1, waiting: 0, advancing: 0, noActivity: 0, upcomingMeetings: 0, stalled: 1, blocked: 1, canonicalRecords: 3, fallbackRecords: 4, byStage: { "property:active": 3 }, avgDaysInStage: 21.5, ownerWorkload: {} },
  actions: [journeyRec], isManager: false,
});
const coach = buildCoachOverview([healthy, stalledJ, unverified], [journeyRec], proj, "member");

const QUEUE: DecisionQueueItem[] = [
  qi(),
  qi({ id: "journey:J2:stall", area: "journey", entityType: "property", entityId: "P2", title: "מסע תקוע: דירה", why: "40 ימים ללא מעבר מאומת.", confidence: 75, priority: 83, href: "/properties/P2", suggestedAction: "פתח את כרטיס הנכס וקדם שלב" }),
  qi({ id: "deal:D1:close", area: "deal", entityType: "deal", entityId: "D1", title: "עסקה בשלה לסגירה", why: "כל התנאים הושלמו.", confidence: 80, priority: 70, urgency: "high", href: "/deals?deal=D1", suggestedAction: "קבע חתימה" }),
  qi({ id: "buyer:B1:match", area: "buyer", entityType: "buyer", entityId: "B1", title: "התאמות לקונה חם", why: "1 התאמות פתוחות.", confidence: 60, priority: 55, urgency: "medium", href: "/buyers/B1", suggestedAction: "שלח התאמות" }),
  qi({ id: "seller:S9:thin", area: "seller", entityType: "seller", entityId: "S9", title: "אות דל", why: "ראיות דלות.", confidence: 10, priority: 95, insufficientEvidence: true }),
];

const FORBIDDEN_PHRASES = [/נראה ש/, /כנראה/, /סביר להניח/, /I think/i, /probably/i, /it seems/i];
const allText = (d: ReturnType<typeof buildExecutiveDecisions>["decisions"][number]) =>
  [d.headline, d.summary, d.whyNow, d.recommendedAction, d.expectedImpact].join(" ");

S("1. Top-3 cap + prioritization inherited, never computed");
{
  const out = buildExecutiveDecisions({ queueItems: QUEUE, coach, audience: "manager" });
  check("1.1 never more than three decisions", out.decisions.length === 3 && !out.noActionRequired);
  check("1.2 ordering = upstream priority desc (90 → 83 → 70), no new arithmetic",
    out.decisions[0].upstreamPriority === 90 && out.decisions[1].upstreamPriority === 83 && out.decisions[2].upstreamPriority === 70);
  check("1.3 ordinal priority is 1..3", out.decisions.map((d) => d.priority).join(",") === "1,2,3");
  check("1.4 insufficient-evidence items are NEVER decisions (priority 95 ignored)",
    out.decisions.every((d) => !d.id.includes("S9:thin")));
  const again = buildExecutiveDecisions({ queueItems: [...QUEUE].reverse(), coach, audience: "manager" });
  check("1.5 priority stable for identical inputs (order-independent, deterministic)",
    JSON.stringify(out.decisions.map((d) => d.id)) === JSON.stringify(again.decisions.map((d) => d.id)));
}

S("2. No invented facts, recommendations or urgency");
{
  const out = buildExecutiveDecisions({ queueItems: QUEUE, coach, audience: "manager" });
  check("2.1 no speculation phrases anywhere", out.decisions.every((d) => FORBIDDEN_PHRASES.every((p) => !p.test(allText(d)))));
  check("2.2 every summary/why-now is evidence-framed", out.decisions.every((d) => /בהתבסס על|הראיה הקנונית/.test(d.summary + d.whyNow)));
  check("2.3 recommendedAction is the EXISTING upstream action, verbatim",
    out.decisions[0].recommendedAction === "צור קשר יזום היום" && out.decisions[1].recommendedAction === "פתח את כרטיס הנכס וקדם שלב");
  check("2.4 the queue's why is quoted, not paraphrased", out.decisions[0].summary.includes("סיכון נטישה גבוה (72) על בסיס CRM."));
  check("2.5 categories map existing areas only (never a new domain)",
    out.decisions.map((d) => d.category).join(",") === "Pipeline,Journey,Pipeline");
}

S("3. Evidence references always exist");
{
  const out = buildExecutiveDecisions({ queueItems: QUEUE, coach, audience: "manager" });
  check("3.1 every decision carries ≥1 evidence reference with label+source",
    out.decisions.every((d) => d.evidence.length >= 1 && d.evidence.every((e) => !!e.label && !!e.source)));
  check("3.2 queue-backed decisions carry the recommendation identity",
    out.decisions.every((d) => !d.id.startsWith("decision:queue:") || d.evidence.some((e) => !!e.recommendationId)));
  check("3.3 affected entities carried from upstream, with real links",
    out.decisions.every((d) => d.affectedEntities.length >= 1 && d.links.length >= 1));
}

S("4. Confidence inherited only");
{
  const out = buildExecutiveDecisions({ queueItems: QUEUE, coach, audience: "manager" });
  check("4.1 queue-backed confidence = the recommendation's own number",
    out.decisions[0].confidence === 74 && out.decisions[1].confidence === 75 && out.decisions[2].confidence === 80);
  const coverageOnly = buildExecutiveDecisions({ queueItems: [], coach: buildCoachOverview([healthy, unverified], [], proj, "member"), audience: "manager" });
  check("4.2 no upstream confidence ⇒ null (coverage decision)",
    coverageOnly.decisions.every((d) => d.id !== "decision:coverage:journey-records" || d.confidence === null));
}

S("5. Honest no-action state");
{
  const emptyProj = buildExecJourneyProjection({
    kpis: { active: 2, atRisk: 0, waiting: 0, advancing: 0, noActivity: 0, upcomingMeetings: 0, stalled: 0, blocked: 0, canonicalRecords: 2, fallbackRecords: 0, byStage: {}, avgDaysInStage: null, ownerWorkload: {} },
    actions: [], isManager: false,
  });
  const calmCoach = buildCoachOverview([healthy, unverified], [], emptyProj, "member");
  const out = buildExecutiveDecisions({ queueItems: [], coach: calmCoach, audience: "manager" });
  check("5.1 nothing deserving attention ⇒ EXACTLY ONE honest decision",
    out.decisions.length === 1 && out.noActionRequired && out.decisions[0].headline === "אין פעולה ניהולית נדרשת כרגע");
  check("5.2 the no-action decision fabricates no urgency and no confidence",
    out.decisions[0].confidence === null && out.decisions[0].whyNow.includes("אפס כנה"));
  check("5.3 unverified journeys never become decisions (insufficient ≠ urgent)",
    out.decisions.every((d) => !d.id.includes("J3")));
}

S("6. Audience visibility (no owner leakage)");
{
  const out = buildExecutiveDecisions({ queueItems: [], coach, audience: "manager" });
  const member = buildExecutiveDecisions({ queueItems: [], coach, audience: "member" });
  check("6.1 coverage/data-quality decisions are manager-only",
    out.decisions.some((d) => d.category === "Data Quality") && member.decisions.every((d) => d.category !== "Data Quality"));
  check("6.2 shared decisions carry IDENTICAL facts for both audiences",
    JSON.stringify(out.decisions.filter((d) => d.category === "Journey")) === JSON.stringify(member.decisions.filter((d) => d.category === "Journey").map((d, i) => ({ ...d, priority: out.decisions.filter((x) => x.category === "Journey")[i].priority }))));
  check("6.3 no owner id appears in any decision", [...out.decisions, ...member.decisions].every((d) => !allText(d).includes("U1")));
}

S("7. Frozen surfaces untouched (source + behavior)");
{
  const sig = { offices: 3, brokers: 5, activeListings: 20, activeCities: 2, dataQualityScore: 70, linkCoveragePct: 80, resolutionRatePct: 60, sourcesUsed: 3,
    missions: { completed: 10, cancelled: 2, blocked: 1, waiting: 2, executionScore: 70, completionRatePct: 80 },
    market: { avgBusinessScore: 65, citiesAnalyzed: 2, decliningCities: 0, avgConfidence: 70 } };
  const before = JSON.stringify(computeOrganizationScore(sig as never));
  void buildExecutiveDecisions({ queueItems: QUEUE, coach, audience: "manager" });
  const after = JSON.stringify(computeOrganizationScore(sig as never));
  check("7.1 organizationScore byte-identical with the Decision Engine present", before === after);
  const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const eng = strip(readFileSync("src/lib/executive-decision/engine.ts", "utf8"));
  const svc = strip(readFileSync("src/lib/executive-decision/service.ts", "utf8"));
  check("7.2 the engine is PURE — no writes, no cache, no tables, no SQL",
    [eng, svc].every((s) => !s.includes(".insert(") && !s.includes(".update(") && !s.includes("setCache") && !s.includes('from("journeys")') && !s.includes("journey_events")));
  check("7.3 no forbidden input is referenced",
    [eng, svc].every((s) => !/stage_entered_at|created_at|updated_at|velocity_state|health_score|conversion_score|risk_score|engagement_score|journey_predictions|journey-intelligence/.test(s)));
  check("7.4 the service consumes ONLY approved canonical providers",
    svc.includes("getJourneyCoach") && svc.includes("getBrokerIntelligenceQueue") && !svc.includes("createServiceRoleClient"));
  check("7.5 manager flag fails closed; provider failure ⇒ null, never fake no-action",
    svc.includes("return false") && svc.includes("return null"));
  const az = strip(readFileSync("src/lib/ask-zono/service.ts", "utf8"));
  check("7.6 Copilot consumes the Decision Engine — no duplicate prioritization in the answer path",
    az.includes("getExecutiveDecisions(") && !az.match(/\.sort\([^)]*priority[^)]*\)[\s\S]{0,200}executive_decision/));
}

console.log(`\nExecutive Decision Engine (5.8) QA: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
