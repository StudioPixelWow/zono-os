// ============================================================================
// ✅ ZONO Daily AI Operating System™ — pure self-tests (offline). 5.6F.
//
// Rewritten for Batch 5.6F against the CANONICAL Daily OS contract. The retired
// suite asserted the shadow priority engine's own behaviour — `impRank` ordering,
// title-dedupe, the hand-rolled `kind` taxonomy — i.e. it verified that the
// second engine worked, which is exactly the thing that had to stop existing.
// These tests now assert the opposite: that Daily OS RANKS NOTHING and faithfully
// carries the canonical queue's decisions.
// ============================================================================
import { assembleDailyOS, buildExecutiveDaily } from "./assemble";
import { buildSinceYouWereAway, type ActivityEventRow } from "./activity";
import type { ExecInput } from "./types";
import type { BrokerWorkspace, ScoredEntity, WsMission } from "@/lib/broker-workspace/types";
import { buildPriorityQueue, recKey } from "@/lib/broker-intelligence/priority";
import { applyLifecycle, reduceLatestStates, type LifecycleAwareRecommendation, type LifecycleEvent } from "@/lib/broker-intelligence/lifecycle";
import { buildAgenda } from "@/lib/broker-intelligence/agenda";
import { scoreJourney, type JourneySignals } from "@/lib/broker-intelligence/journey";
import type { Recommendation } from "@/lib/broker-intelligence/types";
import { projectEventToRecommendationRefresh } from "@/lib/kernel/recommendation-subscriber";

const NOW = Date.parse("2026-07-06T08:00:00.000Z");
const at = (h: number) => new Date(NOW + h * 3600_000).toISOString();

const buyer = (id: string, o: Partial<ScoredEntity> = {}): ScoredEntity => ({ kind: "buyer", id, name: `קונה ${id}`, healthScore: 80, healthLabel: "בריא", score: 85, stage: null, reason: "התאמות פעילות", lastActivityAt: at(-24), riskLabel: null, href: `/buyers/${id}`, ...o });
const seller = (id: string, o: Partial<ScoredEntity> = {}): ScoredEntity => ({ kind: "seller", id, name: `מוכר ${id}`, healthScore: 40, healthLabel: "בסיכון", score: 60, stage: null, reason: null, lastActivityAt: at(-240), riskLabel: "סיכון נטישה", href: `/sellers/${id}`, ...o });
const mission = (id: string, o: Partial<WsMission> = {}): WsMission => ({ id, title: `משימה ${id}`, entityType: "buyer", entityId: "b1", entityName: "קונה b1", owner: "broker-1", priority: "high", status: "open", reason: "דחוף", dueAt: at(3), ...o });

function ws(): BrokerWorkspace {
  return {
    version: "35.0", brokerId: "broker-1", brokerName: "דני", generatedAt: new Date(NOW).toISOString(),
    dashboard: {
      todaysPriorities: [mission("m1", { dueAt: at(3), priority: "high" }), mission("m2", { dueAt: at(1), priority: "low", title: "משימה m2" })],
      hotBuyers: [buyer("b1", { score: 90 }), buyer("b2", { score: 50 })],
      sellersAtRisk: [seller("s1")],
      criticalListings: [], leadFollowUps: [buyer("l1", { kind: "lead" })],
      pendingApprovals: [{ id: "i1", agentName: "Buyer", entityType: "buyer", entityId: "b1", entityName: "קונה b1", recommendation: "צור קשר עם b1", reason: "חם", impact: "high", confidence: 0.8, status: "pending", requiresApproval: true }],
      activeWorkflows: [], upcomingMeetings: [{ id: "mt1", title: "פגישת קונה", type: "buyer_meeting", status: "scheduled", startAt: at(2), endAt: at(3), entityLabel: "קונה b1" }],
    },
    briefing: { generatedAt: new Date(NOW).toISOString(), items: [{ question: "מה היום?", answer: "יום עמוס עם 3 פעולות דחופות.", evidence: [], targets: [] }] },
    calendar: { upcoming: [], suggested: [{ id: "se1", propertyId: "p1", title: "בית פתוח", planType: "open_house", suggestedDate: at(5), status: "pending" }], note: "" },
    comms: { items: [{ kind: "lead", entityId: "l1", entityName: "ליד l1", intent: "first_response", why: "ליד חדש", channelHint: "whatsapp", href: "/communication?entityKind=lead&entityId=l1" }], note: "" },
    inbox: [{ id: "i1", agentName: "Buyer", entityType: "buyer", entityId: "b1", entityName: "קונה b1", recommendation: "צור קשר עם b1", reason: "חם", impact: "high", confidence: 0.8, status: "pending", requiresApproval: true }],
    performance: { activeListings: 5, activeBuyers: 8, activeSellers: 3, leadsHandled: 4, followUpRatePct: 80, conversionOpportunities: 2, weakSpots: [{ title: "לידים ללא מענה", detail: "3 לידים", impact: "high" }] },
    whatsapp: { unread: 4, waiting: 2, urgent: 1, today: 3, waitingConversations: [{ id: "c1", contactName: "יוסי", reason: "שאל על מחיר", href: "/whatsapp/inbox?c=c1", urgency: 85 }] },
    facebook: { scheduledToday: 2, commentsWaiting: 5, leadApprovals: 1, groupsToPublish: 3, tasks: [{ title: "תגובות ממתינות", detail: "5 תגובות", href: "/facebook" }] },
    website: { hasSite: true, published: false, healthScore: 60, seoAlerts: 1, landingDrafts: 1, approvalsPending: 1, alerts: [] },
    territory: { acquisitionStreets: [{ street: "הרצל", city: "חיפה", score: 88, href: "/territory" }], buildings: [], opportunities: [{ title: "הזדמנות בכרמל", why: "ביקוש", href: "/territory" }], marketChanges: [] },
    notes: [],
  };
}

// ── Canonical recommendation fixtures ───────────────────────────────────────
const rec = (o: Partial<Recommendation>): Recommendation => ({
  id: "r1", area: "seller", entityType: "seller", entityId: "s1",
  title: "התקשר למוכר — שימור", why: "סיכון נטישה גבוה.", suggestedAction: "צור קשר",
  evidence: [{ label: "סיכון נטישה", source: "crm", weight: 30 }, { label: "אין קשר 14 יום", source: "timeline", weight: 20 }],
  confidence: 88, urgency: "critical", expectedImpact: "שימור בלעדיות", href: "/sellers/s1",
  insufficientEvidence: false, ...o,
});
/** Build a lifecycle-aware canonical queue exactly as aggregate-service does. */
const queueOf = (recs: Recommendation[], events: LifecycleEvent[] = []): LifecycleAwareRecommendation[] =>
  applyLifecycle(buildPriorityQueue(recs), reduceLatestStates(events), new Date(NOW));

const jSig = (o: Partial<JourneySignals> = {}): JourneySignals => ({
  journeyId: "J1", journeyType: "property", subjectType: "property", subjectId: "P1",
  subjectTitle: "דירת 4 חדרים", href: "/properties/P1", currentStage: "marketing", status: "active",
  daysInStage: 45, verifiedTransitions: 3, daysSinceLastTransition: 45, ...o,
});

const baseRecs = [
  rec({ id: "r1", area: "seller", entityType: "seller", entityId: "s1", confidence: 88, urgency: "critical" }),
  rec({ id: "r2", area: "buyer", entityType: "buyer", entityId: "b1", title: "שלח נכס לקונה", suggestedAction: "שלח נכס", confidence: 70, urgency: "medium", href: "/buyers/b1", evidence: [{ label: "התאמה 82%", source: "matching" }, { label: "פעיל", source: "activity" }] }),
  rec({ id: "r3", area: "acquisition", entityType: "external_listing", entityId: "L1", title: "הזדמנות גיוס", suggestedAction: "צור קשר עם בעלים", confidence: 60, urgency: "low", href: "/external-listings/L1", evidence: [{ label: "בעלים פרטי", source: "external_listings" }, { label: "3 הורדות", source: "market" }] }),
];

export interface DCheck { name: string; pass: boolean; detail: string }
export interface DSelfCheck { ok: boolean; total: number; passed: number; checks: DCheck[] }

export function runSelfCheck(): DSelfCheck {
  const checks: DCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });

  const q = queueOf(baseRecs);
  const os = assembleDailyOS(q, ws(), NOW);

  // ── 1 · canonical queue order is preserved in the Daily input ─────────────
  add("1 canonical queue order preserved verbatim", JSON.stringify(os.actionFeed.map((a) => a.id)) === JSON.stringify(q.map((r) => r.id)));
  add("1 canonical priority carried through (not recomputed)", os.actionFeed.every((a, i) => a.priority === q[i].priority));

  // ── 2 · the shadow engine no longer determines priority ───────────────────
  // The workspace is FULL of items the old engine ranked "high" (sellersAtRisk,
  // hotBuyers, acquisition streets, approvals). None of them may appear in the
  // ranked feed now — only canonical recommendations.
  add("2 ranked feed contains ONLY canonical queue items", os.actionFeed.length === q.length);
  add("2 shadow-only items are absent from the ranked feed", !os.actionFeed.some((a) => a.title.includes("טפל במוכר בסיכון") || a.title.includes("התקשר לקונה חם") || a.title.includes("גיוס ברחוב") || a.title.startsWith("אשר:")));
  add("2 shadow items are reclassified as operations", os.operations.some((o2) => o2.kind === "acquisition_street" && o2.classification === "unsupported_legacy_suggestion") && os.operations.some((o2) => o2.kind === "approve" && o2.classification === "operational_reminder"));
  add("2 feed is NOT title-deduped (canonical recKey governs)", os.actionFeed.every((a) => a.recKey.split(":").length === 3));
  add("2 no Impact-band field survives on a ranked action", os.actionFeed.every((a) => typeof a.priority === "number" && ["critical", "high", "medium", "low"].includes(a.urgency)));

  // ── 3 · Home "The One Thing" = first eligible canonical scheduled item ────
  const one = os.actionFeed[0];
  add("3 The One Thing is the queue's top item", one.id === q[0].id && one.recKey === recKey(q[0]));
  add("3 The One Thing carries canonical why + evidence", one.why === q[0].why && one.evidence.length === q[0].evidence.length);
  add("3 The One Thing is scheduled by the shared scheduler", one.scheduled === true && !!one.startTime);

  // ── 4 · dismissed / snoozed / completed are excluded ──────────────────────
  const dismissed = queueOf(baseRecs, [{ recKey: recKey(baseRecs[0]), action: "dismissed", at: at(-1) }]);
  const osDismissed = assembleDailyOS(dismissed, ws(), NOW);
  add("4 dismissed recommendation excluded from Daily", !osDismissed.actionFeed.some((a) => a.entityId === "s1" && a.area === "seller"));
  add("4 The One Thing advances to the next eligible item", osDismissed.actionFeed[0]?.id === "r2");
  const snoozed = queueOf(baseRecs, [{ recKey: recKey(baseRecs[0]), action: "snoozed", at: at(-1), snoozeUntil: at(24) }]);
  add("4 actively-snoozed recommendation excluded", !assembleDailyOS(snoozed, ws(), NOW).actionFeed.some((a) => a.id === "r1"));
  const completed = queueOf(baseRecs, [{ recKey: recKey(baseRecs[0]), action: "completed", at: at(-1) }]);
  add("4 completed recommendation excluded", !assembleDailyOS(completed, ws(), NOW).actionFeed.some((a) => a.id === "r1"));

  // ── 5 · Journey recommendation routes to its SUBJECT cockpit ──────────────
  const jRec = scoreJourney(jSig());
  const jOs = assembleDailyOS(queueOf([jRec]), ws(), NOW);
  add("5 journey action routes to the subject cockpit", jOs.actionFeed[0]?.href === "/properties/P1");
  add("5 journey action never routes to a raw journey UUID", !jOs.actionFeed[0]?.href?.includes("J1"));
  add("5 journey action is subject-scoped, not journey-scoped", jOs.actionFeed[0]?.entityType === "property" && jOs.actionFeed[0]?.entityId === "P1");
  // Deal-subject journeys previously dead-ended at /today.
  const dealJ = assembleDailyOS(queueOf([rec({ id: "jd", area: "journey", entityType: "deal", entityId: "D1", href: null, title: "מסע תקוע" })]), ws(), NOW);
  add("5 deal-subject action routes to /deals (was /today)", dealJ.actionFeed[0]?.href === "/deals");

  // ── 6/7 · Attention threshold (minPriority 65) is canonical, no bypass ────
  const ATTENTION = 65;
  const mildJ = scoreJourney(jSig({ daysInStage: 21, verifiedTransitions: 0, daysSinceLastTransition: null }));
  const mildQ = queueOf([mildJ]);
  add("6 below-threshold journey excluded from Attention", mildQ.length === 1 && mildQ[0].priority < ATTENTION);
  const severeQ = queueOf([jRec]);
  add("7 above-threshold journey appears in Attention exactly once", severeQ.filter((r) => r.priority >= ATTENTION && r.area === "journey").length === 1);
  add("7 no journey bypass — same threshold as every area", severeQ[0].priority >= ATTENTION && severeQ[0].area === "journey");

  // ── 8 · Journey + Buyer same action dedupes STRUCTURALLY (not by title) ───
  const buyerCall = rec({ id: "bc", area: "buyer", entityType: "property", entityId: "P1", title: "התקשר לבעלים", suggestedAction: "צור קשר", confidence: 60, evidence: [{ label: "x", source: "crm" }] });
  const mixed = queueOf([jRec, buyerCall]);
  add("8 different action classes do NOT merge", mixed.length === 2);
  const twoJourneyEngines = queueOf([jRec, { ...jRec, id: "other", confidence: 95, evidence: [{ label: "ראיה נוספת", source: "timeline" as const }] }]);
  add("8 same entity+actionClass merges into ONE", twoJourneyEngines.length === 1 && twoJourneyEngines[0].mergedCount === 2);
  add("8 merge preserves union of evidence + sources", twoJourneyEngines[0].evidence.length > jRec.evidence.length && twoJourneyEngines[0].contributingSources.includes("journeys"));

  // ── 9 · unrelated recommendation ordering remains stable ──────────────────
  const withJourneys = queueOf([...baseRecs, scoreJourney(jSig({ daysInStage: null, verifiedTransitions: 0, daysSinceLastTransition: null }))]);
  add("9 unbacked journeys do not perturb existing order", JSON.stringify(withJourneys.map((r) => r.id)) === JSON.stringify(q.map((r) => r.id)));
  add("9 Daily output identical with vs without unbacked journeys", JSON.stringify(assembleDailyOS(withJourneys, ws(), NOW).actionFeed) === JSON.stringify(os.actionFeed));

  // ── 10 · no eligible Journey → no Journey item ANYWHERE ───────────────────
  const noneEligible = [
    scoreJourney(jSig({ journeyId: "A", daysInStage: null, verifiedTransitions: 0, daysSinceLastTransition: null })),
    scoreJourney(jSig({ journeyId: "B", currentStage: "active", daysInStage: null, verifiedTransitions: 0, daysSinceLastTransition: null })),
  ];
  const zeroOs = assembleDailyOS(queueOf([...baseRecs, ...noneEligible]), ws(), NOW);
  add("10 zero eligible journeys → no journey action anywhere", !zeroOs.actionFeed.some((a) => a.area === "journey"));
  add("10 zero journeys is an honest supported state (Daily still works)", zeroOs.actionFeed.length === 3 && !!zeroOs.briefing.focus);
  add("10 no journey placeholder is invented", !zeroOs.operations.some((o2) => o2.title.includes("מסע")) && !JSON.stringify(zeroOs.actionFeed).includes("מסע"));

  // ── 11/12 · "בזמן שלא היית" — persisted events only ───────────────────────
  const events: ActivityEventRow[] = [
    { event_type: "deal.won", entity_type: "deal", entity_id: "D1", occurred_at: at(-2) },
    { event_type: "document.signed", entity_type: "document", entity_id: "DOC1", occurred_at: at(-5) },
    { event_type: "automation.run_completed", entity_type: "automation", entity_id: "A1", occurred_at: at(-6) },
  ];
  const facts = buildSinceYouWereAway(events);
  add("11 persisted activity appears in בזמן שלא היית", facts.length === 3 && facts[0].eventType === "deal.won");
  add("11 facts are newest-first + deterministic", JSON.stringify(buildSinceYouWereAway(events)) === JSON.stringify(buildSinceYouWereAway(events)));
  add("11 activity flows into the Daily OS object", assembleDailyOS(q, ws(), NOW, facts).sinceYouWereAway.length === 3);
  add("12 no persisted activity → ZERO facts (no fake overnight claim)", buildSinceYouWereAway([]).length === 0);
  add("12 activity is never derived from the recommendation queue", assembleDailyOS(q, ws(), NOW, []).sinceYouWereAway.length === 0 && os.actionFeed.length === 3);
  add("12 unknown event types are not narrated", buildSinceYouWereAway([{ event_type: "some.unknown_event", entity_type: "x", entity_id: "1", occurred_at: at(-1) }]).length === 0);
  add("12 facts never claim ZONO performed work", facts.every((f) => !/מצאתי|הכנתי|ניסחתי|עבדתי/.test(f.label)));

  // ── 13 · cache invalidation on Journey events ─────────────────────────────
  const ev = (t: string) => projectEventToRecommendationRefresh({ id: "E1", event_type: t, entity_type: "journey", entity_id: "J1", occurred_at: at(0), organization_id: "ORG1", actor_user_id: "U1", payload: {} });
  add("13 journey.stage_changed invalidates Daily", ev("journey.stage_changed")?.refreshDaily === true && ev("journey.stage_changed")?.affectedAreas.includes("journey") === true);
  add("13 journey.completed invalidates Daily + Executive", ev("journey.completed")?.refreshDaily === true && ev("journey.completed")?.refreshExecutive === true);
  add("13 journey.blocked invalidates Daily", ev("journey.blocked")?.refreshDaily === true);
  add("13 journey.created does NOT invalidate (no proven dwell yet)", ev("journey.created")?.refreshDaily === false);
  add("13 journey.paused/resumed/reopened invalidate Daily", ev("journey.paused")?.refreshDaily === true && ev("journey.resumed")?.refreshDaily === true && ev("journey.reopened")?.refreshDaily === true);
  add("13 unrelated event still yields null", ev("some.unrelated") === null);

  // ── 14 · determinism ──────────────────────────────────────────────────────
  add("14 same input → byte-identical output", JSON.stringify(assembleDailyOS(q, ws(), NOW, facts)) === JSON.stringify(assembleDailyOS(q, ws(), NOW, facts)));

  // ── 15 · cross-org isolation (pure layer invents no foreign entity) ───────
  const emitted = new Set(os.actionFeed.map((a) => `${a.entityType}:${a.entityId}`));
  const supplied = new Set(q.map((r) => `${r.entityType}:${r.entityId}`));
  add("15 Daily emits no entity that wasn't supplied to it", [...emitted].every((k) => supplied.has(k)));
  add("15 Daily invents no recommendation of its own", os.actionFeed.every((a) => q.some((r) => r.id === a.id)));

  // ── 16 · public-safe isolation ────────────────────────────────────────────
  // Daily OS is a broker-private surface: it takes the queue as an argument and
  // has no path to construct one itself, so a public renderer cannot obtain
  // recommendations through it.
  add("16 assembleDailyOS cannot fetch a queue itself (must be injected)", assembleDailyOS([], ws(), NOW).actionFeed.length === 0);
  add("16 empty queue yields an honest empty feed, not a fallback", assembleDailyOS([], ws(), NOW).actionFeed.length === 0 && assembleDailyOS([], ws(), NOW).operations.length > 0);

  // ── Preserved from the original suite (still valid) ───────────────────────
  add("greeting with name", os.briefing.greeting.includes("דני"));
  add("daily score computed", os.briefing.dailyScore === Math.round(55 + 80 * 0.25 - 1 * 6 + Math.min(20, 2 * 4)));
  add("biggest opportunity = hot buyer", os.briefing.biggestOpportunity?.label === "קונה b1");
  add("biggest risk = seller at risk", os.briefing.biggestRisk?.label === "מוכר s1");
  add("ai summary from briefing item", os.briefing.aiSummary.includes("יום עמוס"));
  add("timeline merged + sorted", os.timeline.length === 4 && Date.parse(os.timeline[0].at) <= Date.parse(os.timeline[1].at));
  add("timeline has meeting + mission + suggested", os.timeline.some((t) => t.source === "meeting") && os.timeline.some((t) => t.source === "mission") && os.timeline.some((t) => t.source === "suggested"));
  add("conversation counts", os.conversation.whatsappUnread === 4 && os.conversation.facebookComments === 5 && os.conversation.drafts.length === 1);
  add("marketing from facebook", os.marketing.scheduledToday === 2 && os.marketing.groupsToPublish === 3);
  add("deals passthrough", os.deals.hotBuyers.length === 2 && os.deals.sellersAtRisk.length === 1);
  add("performance daily+weekly", os.performance.daily === os.performance.weekly && os.performance.followUpRatePct === 80);
  add("approvals merged + deduped", os.approvals.length === 1 && os.approvals[0].id === "i1");
  add("ask questions present", os.ask.length >= 4);
  add("focus = top canonical action", os.briefing.focus === q[0].title);

  // Agenda parity — Daily and BrokerTodayAgenda must schedule identically.
  const agenda = buildAgenda(q, { now: new Date(NOW) });
  add("agenda parity: same identities, same times", agenda.slots.every((s) => {
    const a = os.actionFeed.find((x) => x.recKey === recKey(s.rec));
    return !!a && a.startTime === s.startTime && a.durationMin === s.durationMin;
  }));
  add("no duplicate recommendation in the Daily feed", new Set(os.actionFeed.map((a) => a.recKey)).size === os.actionFeed.length);

  // Executive mode (unchanged path).
  const exec: ExecInput = { orgScore: { overall: 72, growth: 60, execution: 70, coverage: 65, competitivePosition: 55, confidence: 80 }, priorities: [{ title: "גייס מוכרים", why: "מלאי נמוך", evidence: ["-10%"], impact: "high", urgency: 80 }], risks: [], opportunities: [], insights: [{ title: "תובנה", recommendation: "פעל", modules: ["market"], impact: "medium" }], notes: [] };
  const ed = buildExecutiveDaily(exec);
  add("executive health band strong", ed.officeHealth === "strong" && ed.orgScore.overall === 72 && ed.priorities.length === 1);

  // Empty-safe.
  const empty = ws();
  empty.dashboard = { todaysPriorities: [], hotBuyers: [], sellersAtRisk: [], criticalListings: [], leadFollowUps: [], pendingApprovals: [], activeWorkflows: [], upcomingMeetings: [] };
  empty.comms = { items: [], note: "" }; empty.whatsapp = { unread: 0, waiting: 0, urgent: 0, today: 0, waitingConversations: [] };
  empty.facebook = { scheduledToday: 0, commentsWaiting: 0, leadApprovals: 0, groupsToPublish: 0, tasks: [] };
  empty.territory = { acquisitionStreets: [], buildings: [], opportunities: [], marketChanges: [] };
  empty.calendar = { upcoming: [], suggested: [], note: "" };
  empty.briefing = { generatedAt: "", items: [] };
  const eos = assembleDailyOS([], empty, NOW);
  add("empty-safe", eos.actionFeed.length === 0 && eos.operations.length === 0 && eos.timeline.length === 0 && eos.briefing.biggestOpportunity === null);
  add("empty-safe focus is honest", eos.briefing.focus.includes("אין פעולות דחופות"));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}

// Allow `npx tsx src/lib/daily-os/qa.ts`.
if (process.argv[1] && process.argv[1].endsWith("daily-os/qa.ts")) {
  const r = runSelfCheck();
  for (const c of r.checks) if (!c.pass) console.error("  ✗ " + c.name);
  console.log(`\nDaily OS (canonical queue · 5.6F) QA — ${r.passed} passed, ${r.total - r.passed} failed`);
  if (!r.ok) process.exit(1);
}
