// ============================================================================
// 🧪 ZONO OS 2.0 — Batch 5.7 · JOURNEY AI COACH QA (offline).
// Run: npx tsx src/lib/journey-coach/qa.ts
// Proves the evidence contract: no hallucination, traceable references,
// queue-identity fidelity, insufficient-evidence honesty, role visibility,
// and byte-identical facts across explanation modes.
// ============================================================================
import { readFileSync } from "node:fs";
import { fromCanonicalJourney, type CanonicalJourneyRow, type CanonicalTransition, type EntityFacts } from "@/lib/journey-center/canonical";
import type { ExecJourneyAction } from "@/lib/executive-os/journey-projection";
import { buildExecJourneyProjection } from "@/lib/executive-os/journey-projection";
import { buildCoachBriefing, buildCoachOverview, type CoachMode } from "./engine";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean) => { if (ok) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}`); } };
const S = (t: string) => console.log(`\n── ${t} ──`);

const NOW = Date.parse("2026-07-11T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const facts = (o: Partial<EntityFacts> = {}): EntityFacts =>
  ({ title: "דירה בקריית ביאליק", href: "/properties/P1", ownerName: null, openTasks: 0, upcomingMeetingAt: null, linked: [], ...o });
const row = (o: Partial<CanonicalJourneyRow> = {}): CanonicalJourneyRow => ({
  id: "J1", orgId: "ORG1", journeyType: "property", entityType: "property", entityId: "P1",
  currentStage: "active", status: "active", ownerUserId: "U1",
  stageEnteredAt: daysAgo(1), lastActivityAt: daysAgo(1), startedAt: daysAgo(30),
  source: "legacy_backfill", metadata: null, ...o,
});
const verified = (jid: string, toStage: string, at: number): CanonicalTransition =>
  ({ journeyId: jid, fromStage: null, toStage, occurredAt: daysAgo(at), reason: null, actorUserId: null, sourceEventId: `evt-${jid}` });
const rec = (o: Partial<ExecJourneyAction> = {}): ExecJourneyAction => ({
  recommendationId: "journey:J2:stall", recKey: "property:P2:journey", subjectType: "property", subjectId: "P2",
  title: "מסע תקוע: דירה בקריית ביאליק", why: "המסע ממתין בשלב 40 ימים ללא מעבר מאומת.", confidence: 75, priority: 83,
  urgency: "critical", href: "/properties/P2",
  evidence: [{ label: "40 ימים ללא מעבר מאומת", source: "journeys" }, { label: "שלב 5 מתוך 9", source: "journeys" }],
  mergedCount: 1, contributingSources: ["journeys"], ...o,
});

// Fixtures: verified-healthy, verified-stalled+rec, unverified (insufficient).
const healthy = fromCanonicalJourney(row(), verified("J1", "active", 3), facts(), NOW);
const stalledJ = fromCanonicalJourney(row({ id: "J2", entityId: "P2", stageEnteredAt: daysAgo(40) }), verified("J2", "active", 40), facts({ href: "/properties/P2" }), NOW);
const unverified = fromCanonicalJourney(row({ id: "J3", entityId: "P3", stageEnteredAt: daysAgo(40) }),
  { ...verified("J3", "active", 40), sourceEventId: null }, facts({ href: "/properties/P3" }), NOW);

const MODES: CoachMode[] = ["SHORT", "NORMAL", "DETAILED"];
const FORBIDDEN_PHRASES = [/נראה ש/, /כנראה/, /סביר להניח/, /אני חושב/, /I think/i, /it seems/i, /probably/i, /it looks like/i];
const allText = (b: ReturnType<typeof buildCoachBriefing>) =>
  [b.situation, b.evidenceSummary, b.whyThisMatters, b.recommendedNextStep, b.expectedOutcome, b.confidence.label, b.text].join(" ");

S("1. No hallucinated explanation");
{
  const briefings = [
    buildCoachBriefing(healthy, null), buildCoachBriefing(stalledJ, rec()), buildCoachBriefing(unverified, null),
  ];
  check("1.1 no forbidden speculation phrase in any briefing",
    briefings.every((b) => FORBIDDEN_PHRASES.every((p) => !p.test(allText(b)))));
  check("1.2 every claim is evidence-framed ('בהתבסס על' / 'האירוע המאומת' / 'אין ראיה')",
    briefings.every((b) => /בהתבסס על|האירוע המאומת|אין ראיה/.test(b.situation) && /בהתבסס על|אין ראיה|אין המלצת|אין פעולה/.test(b.recommendedNextStep)));
  check("1.3 the engine computes no state — stalled/blocked come from canonical predicates",
    briefings[0].facts.stalled === false && briefings[1].facts.stalled === true && briefings[2].facts.stalled === false);
}

S("2. Evidence references always exist and are traceable");
{
  const bs = [buildCoachBriefing(healthy, null), buildCoachBriefing(stalledJ, rec()), buildCoachBriefing(unverified, null)];
  check("2.1 every briefing carries ≥1 canonical evidence reference", bs.every((b) => b.facts.evidenceRefs.length >= 1));
  check("2.2 every reference names journey, label and source",
    bs.every((b) => b.facts.evidenceRefs.every((r) => !!r.journeyId && !!r.label && !!r.source)));
  check("2.3 verified dwell carries the verified transition ref — day count only, never the unverified row timestamp",
    (() => { const b = buildCoachBriefing(healthy, null);
      return b.facts.evidenceRefs.some((r) => r.kind === "verified_transition" && r.label.includes("3 ימים") && r.occurredAt === null)
        && !JSON.stringify(b.facts).includes(daysAgo(1)); })());
  check("2.4 references never point at a foreign journey",
    bs.every((b) => b.facts.evidenceRefs.every((r) => r.journeyId === b.facts.journeyId)));
}

S("3. Recommendation explanations match queue identity");
{
  const b = buildCoachBriefing(stalledJ, rec());
  check("3.1 recommendation id is carried verbatim", b.facts.recommendation?.id === "journey:J2:stall" && b.recommendedNextStep.includes("journey:J2:stall"));
  check("3.2 confidence is the RECOMMENDATION's own number, not invented", b.confidence.value === 75 && b.confidence.basis === "queue_recommendation");
  check("3.3 queue evidence lines are carried verbatim into the refs",
    b.facts.evidenceRefs.some((r) => r.kind === "recommendation_evidence" && r.label === "40 ימים ללא מעבר מאומת" && r.recommendationId === "journey:J2:stall"));
  check("3.4 why-this-matters quotes the queue's why", b.whyThisMatters.includes(rec().why));
}

S("4. Insufficient evidence never becomes advice");
{
  const b = buildCoachBriefing(unverified, null);
  check("4.1 dwell is null and stated as unmeasurable, never 0", b.facts.stageAgeDays === null && b.situation.includes("אין ראיה מאומתת"));
  check("4.2 next step is the insufficient-evidence statement, not advice", b.recommendedNextStep.includes("אין ראיה מספקת") && !b.recommendedNextStep.includes("התקשר"));
  check("4.3 no numeric confidence without a recommendation", b.confidence.value === null && b.confidence.basis === "insufficient_evidence");
  check("4.4 needsAttention is false — insufficient evidence is not an alarm", b.needsAttention === false);
  check("4.5 no expected outcome is fabricated", b.expectedOutcome.includes("לא נטענת תוצאה צפויה"));
  const h = buildCoachBriefing(healthy, null);
  check("4.6 verified-healthy also gets NO invented advice and NO invented number",
    h.recommendedNextStep.includes("אין פעולה נדרשת") && h.confidence.value === null && h.confidence.basis === "verified_evidence");
}

S("5. Byte-identical facts across explanation modes");
{
  for (const [name, j, r] of [["healthy", healthy, null], ["stalled+rec", stalledJ, rec()], ["unverified", unverified, null]] as const) {
    const [s, n, d] = MODES.map((m) => buildCoachBriefing(j, r, m));
    check(`5.${name} facts byte-identical across SHORT/NORMAL/DETAILED`,
      JSON.stringify(s.facts) === JSON.stringify(n.facts) && JSON.stringify(n.facts) === JSON.stringify(d.facts));
    check(`5.${name} conclusions identical (situation/next-step/confidence)`,
      s.situation === n.situation && n.situation === d.situation
      && s.recommendedNextStep === n.recommendedNextStep && n.recommendedNextStep === d.recommendedNextStep
      && JSON.stringify(s.confidence) === JSON.stringify(n.confidence) && JSON.stringify(n.confidence) === JSON.stringify(d.confidence));
    check(`5.${name} DETAILED adds evidence refs to the TEXT only`,
      d.text.includes("הפניות ראיה:") && !s.text.includes("הפניות ראיה:"));
  }
}

S("6. Manager / member visibility");
{
  const journeys = [healthy, stalledJ, unverified];
  const actions = [rec()];
  const proj = buildExecJourneyProjection({
    kpis: { active: 3, atRisk: 1, waiting: 0, advancing: 0, noActivity: 0, upcomingMeetings: 0, stalled: 1, blocked: 1, canonicalRecords: 3, fallbackRecords: 0, byStage: { "property:active": 3 }, avgDaysInStage: 21.5, ownerWorkload: { U1: 3 } },
    actions, isManager: false,
  });
  const mgr = buildCoachOverview(journeys, actions, proj, "manager");
  const member = buildCoachOverview(journeys, actions, proj, "member");
  check("6.1 manager gets the org overview headline", mgr.headline !== null && mgr.headline.includes("סקירת ארגון"));
  check("6.2 member gets NO org overview headline", member.headline === null);
  check("6.3 per-journey FACTS are identical for both audiences",
    JSON.stringify(mgr.briefings.map((b) => b.facts)) === JSON.stringify(member.briefings.map((b) => b.facts)));
  check("6.4 no owner id / workload leaks into any briefing text",
    [...mgr.briefings, ...member.briefings].every((b) => !allText(b).includes("U1") && !allText(b).includes("עומס")));
  check("6.5 attention ordering: queue-backed first, deterministic id tie-break",
    mgr.briefings[0].facts.journeyId === "J2" && mgr.attentionCount === 1);
  check("6.6 fallback (non-canonical) records are never coached",
    buildCoachOverview([{ ...healthy, canonical: false }], [], proj, "member").briefings.length === 0);
}

S("7. Runtime boundary (source-level)");
{
  const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const eng = strip(readFileSync("src/lib/journey-coach/engine.ts", "utf8"));
  const svc = strip(readFileSync("src/lib/journey-coach/service.ts", "utf8"));
  check("7.1 the Coach reads NO tables of its own (no from(...) queries outside has_min_role)",
    !eng.includes(".from(") && !svc.includes(".from(\"journeys\"") && !svc.includes(".from(\"journey_events\""));
  check("7.2 no forbidden field/legacy model is referenced",
    [eng, svc].every((s) => !/stage_entered_at|velocity_state|health_score|conversion_score|risk_score|engagement_score|next_best_action|journey_predictions|journey-intelligence/.test(s)));
  check("7.3 the Coach consumes only approved canonical entry points",
    svc.includes("getJourneyCenter") && svc.includes("getBrokerIntelligenceQueue") && svc.includes("buildExecJourneyProjection") && svc.includes("mapJourneyQueueItems"));
  check("7.4 the manager flag fails closed", svc.includes("return false"));
  check("7.5 provider failure ⇒ null (unavailable), never an empty coach", svc.includes("if (jc === undefined) return null"));
  const az = strip(readFileSync("src/lib/ask-zono/service.ts", "utf8"));
  check("7.6 the Copilot consumes the Coach — no duplicate journey reasoning path",
    az.includes("getJourneyCoach(") && !az.includes("getCanonicalJourneyCommand("));
}

console.log(`\nJourney AI Coach (5.7) QA: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
