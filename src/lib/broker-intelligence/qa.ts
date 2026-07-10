// ============================================================================
// 🧪 ZONO — BROKER INTELLIGENCE · offline QA. No DB/network.
// Run: npx tsx src/lib/broker-intelligence/qa.ts
// ============================================================================
import { scoreAcquisition, rankAcquisition, type AcquisitionSignals } from "./acquisition";
import { MIN_EVIDENCE } from "./types";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };

const bare: AcquisitionSignals = {
  listingId: "x1", title: null, city: "חיפה", neighborhood: "כרמל",
  daysOnMarket: null, priceReductions: 0, privateOwner: false, duplicate: false,
  vsNeighborhoodPct: null, buyerMatches: 0, competingCount: null, sellerLikelihood: null,
};

// 1) A hot private-owner opportunity ranks high with real evidence.
const hot = scoreAcquisition({ ...bare, privateOwner: true, priceReductions: 3, daysOnMarket: 120, vsNeighborhoodPct: -8, buyerMatches: 3 });
check("hot opp is not insufficient", !hot.insufficientEvidence);
check("hot opp high confidence", hot.confidence >= 60);
check("hot opp urgency high/critical", hot.urgency === "high" || hot.urgency === "critical");
check("hot opp has ≥4 evidence lines", hot.evidence.filter(e => (e.weight ?? 0) > 0).length >= 4);
check("hot opp every evidence names a source", hot.evidence.every(e => !!e.source));
check("hot opp action is acquisition call", hot.suggestedAction.includes("בעלים") || hot.suggestedAction.includes("ייצוג"));
check("hot opp expected impact mentions buyers", hot.expectedImpact.includes("קונים"));
check("hot opp links to listing", hot.href === "/external-listings/x1");

// 2) A bare listing with no real signal → insufficient evidence, honest.
const cold = scoreAcquisition(bare);
check("cold opp is insufficientEvidence", cold.insufficientEvidence);
check("cold opp why says so honestly", cold.why.includes("אין מספיק"));
check("cold opp action is watch-only", cold.suggestedAction.includes("מעקב"));
check("cold opp confidence low", cold.confidence < 40);

// 3) MIN_EVIDENCE boundary: exactly one scored signal → still insufficient.
const one = scoreAcquisition({ ...bare, priceReductions: 1 });
check("one signal < MIN_EVIDENCE is insufficient", one.insufficientEvidence && MIN_EVIDENCE === 2);
const two = scoreAcquisition({ ...bare, priceReductions: 1, buyerMatches: 1 });
check("two scored signals is sufficient", !two.insufficientEvidence);

// 4) Duplicate adds a caution line but no score, and doesn't flip sufficiency alone.
const dup = scoreAcquisition({ ...bare, duplicate: true });
check("duplicate adds caution evidence", dup.evidence.some(e => e.label.includes("כפילות")));
check("duplicate alone stays insufficient", dup.insufficientEvidence);

// 5) Ranking: sufficient beats insufficient; higher confidence first.
const ranked = rankAcquisition([bare, { ...bare, listingId: "x2", privateOwner: true, priceReductions: 2, buyerMatches: 2 }]);
check("ranked puts real opp first", ranked[0].entityId === "x2");
check("ranked sinks insufficient last", ranked[ranked.length - 1].insufficientEvidence);

// 6) Determinism — same input → same output.
const inp: AcquisitionSignals = { ...bare, privateOwner: true, priceReductions: 2, buyerMatches: 2 };
check("deterministic", JSON.stringify(scoreAcquisition(inp)) === JSON.stringify(scoreAcquisition(inp)));

// ── Area 2 · Buyer (Next Best Action) ───────────────────────────────────────
import { scoreBuyer, rankBuyers, type BuyerSignals } from "./buyer";

const bBare: BuyerSignals = {
  buyerId: "b1", name: "דנה", hasPreapproval: false, budgetComplete: true, temperature: null,
  lastContactedDays: null, readinessScore: null, engagementScore: null, conversionProbability: null,
  daysSinceActivity: null, openMatches: 0, topMatchProbability: null, topMatchPropertyId: null,
};

// strong ready match → "send property" is the ONE action
const bMatch = scoreBuyer({ ...bBare, topMatchProbability: 82, topMatchPropertyId: "p9", conversionProbability: 65 });
check("strong match → not insufficient", !bMatch.insufficientEvidence);
check("strong match → send property action", bMatch.suggestedAction.includes("שלח") && bMatch.href === "/properties/p9");
check("strong match → high confidence", bMatch.confidence >= 40);
check("strong match evidence names matching source", bMatch.evidence.some(e => e.source === "matching" && (e.weight ?? 0) > 0));

// high readiness, no financing → request mortgage
const bReady = scoreBuyer({ ...bBare, readinessScore: 72, conversionProbability: 62, hasPreapproval: false });
check("ready+no-preapproval → mortgage action", bReady.title.includes("משכנתא") || bReady.suggestedAction.includes("אישור עקרוני"));

// slowing hot buyer → call today
const bSlow = scoreBuyer({ ...bBare, temperature: "hot", daysSinceActivity: 40, conversionProbability: 55 });
check("slowing hot → call today", bSlow.title.includes("התקשר") || bSlow.suggestedAction.includes("טלפוני"));
check("slowing evidence cites timeline", bSlow.evidence.some(e => e.source === "timeline"));

// bare buyer, no intel → insufficient + honest
const bCold = scoreBuyer(bBare);
check("bare buyer insufficient", bCold.insufficientEvidence);
check("bare buyer honest why", bCold.why.includes("אין מספיק"));

// incomplete budget → gather info action when insufficient
const bInfo = scoreBuyer({ ...bBare, budgetComplete: false });
check("incomplete budget → gather info", bInfo.suggestedAction.includes("תקציב") || bInfo.title.includes("השלם"));

// ranking: real action beats insufficient; higher confidence first
const rankedB = rankBuyers([bBare, { ...bBare, buyerId: "b2", topMatchProbability: 80, topMatchPropertyId: "p1", conversionProbability: 70 }]);
check("ranked buyer: real first", rankedB[0].entityId === "b2");
check("ranked buyer: insufficient last", rankedB[rankedB.length - 1].insufficientEvidence);

// determinism
const bInp: BuyerSignals = { ...bBare, topMatchProbability: 75, topMatchPropertyId: "p1", conversionProbability: 60 };
check("buyer deterministic", JSON.stringify(scoreBuyer(bInp)) === JSON.stringify(scoreBuyer(bInp)));

// ── Area 3 · Seller ─────────────────────────────────────────────────────────
import { scoreSeller, rankSellers, type SellerSignals } from "./seller";

const sBare: SellerSignals = {
  sellerId: "s1", name: "יוסי", hasSignedAgreement: true, allowsMarketing: true,
  churnRisk: null, trust: null, satisfaction: null, engagement: null, daysSinceContact: null,
  propertyId: null, listingMomentum: null, listingExposure: null, marketPosition: null, marketingScore: null,
};

// high churn + comm gap → retention call today
const sChurn = scoreSeller({ ...sBare, churnRisk: 72, daysSinceContact: 30, trust: 38 });
check("high churn → retention call", sChurn.title.includes("שימור") || sChurn.suggestedAction.includes("שימור"));
check("high churn not insufficient", !sChurn.insufficientEvidence);
check("high churn urgency high/critical", sChurn.urgency === "high" || sChurn.urgency === "critical");
check("churn evidence cites crm", sChurn.evidence.some(e => e.source === "crm" && (e.weight ?? 0) > 0));

// pricing resistance → review pricing
const sPrice = scoreSeller({ ...sBare, marketPosition: 32, listingMomentum: 30 });
check("pricing resistance → review pricing", sPrice.title.includes("תמחור") || sPrice.suggestedAction.includes("מחיר"));

// stagnating listing / marketing fatigue → refresh marketing
const sStag = scoreSeller({ ...sBare, listingMomentum: 28, marketingScore: 30, propertyId: "p1", marketPosition: 70 });
check("stagnating → refresh marketing", sStag.title.includes("שיווק") || sStag.suggestedAction.includes("קמפיין"));
check("stagnating evidence cites marketing", sStag.evidence.some(e => e.source === "marketing"));

// bare seller, no intel → insufficient + honest
const sCold = scoreSeller(sBare);
check("bare seller insufficient", sCold.insufficientEvidence);
check("bare seller honest why", sCold.why.includes("אין מספיק"));

// missing agreement is a caution but not a driver alone
const sNoAgr = scoreSeller({ ...sBare, hasSignedAgreement: false });
check("no-agreement caution present", sNoAgr.evidence.some(e => e.label.includes("הסכם")));
check("no-agreement alone insufficient", sNoAgr.insufficientEvidence);

// ranking: sufficient first; higher confidence first
const rankedS = rankSellers([sBare, { ...sBare, sellerId: "s2", churnRisk: 75, daysSinceContact: 40, trust: 30 }]);
check("ranked seller: real first", rankedS[0].entityId === "s2");
check("ranked seller: insufficient last", rankedS[rankedS.length - 1].insufficientEvidence);

// determinism
const sInp: SellerSignals = { ...sBare, churnRisk: 60, daysSinceContact: 20, marketPosition: 35 };
check("seller deterministic", JSON.stringify(scoreSeller(sInp)) === JSON.stringify(scoreSeller(sInp)));

// ── Global priority queue (dedup + merge + ranking) ─────────────────────────
import { buildPriorityQueue, actionClass } from "./priority";
import type { Recommendation } from "./types";

const rec = (over: Partial<Recommendation>): Recommendation => ({
  id: "r", area: "seller", entityType: "seller", entityId: "s1", title: "t", why: "w",
  evidence: [{ label: "e1", source: "crm" }], confidence: 50, urgency: "medium",
  expectedImpact: "i", suggestedAction: "a", href: null, insufficientEvidence: false, ...over,
});

// insufficient-evidence items never enter the actionable queue
check("queue drops insufficient", buildPriorityQueue([rec({ insufficientEvidence: true })]).length === 0);

// higher priority ranks first (critical+high-confidence over low)
const q1 = buildPriorityQueue([
  rec({ id: "low", entityId: "a", urgency: "low", confidence: 30 }),
  rec({ id: "hi", entityId: "b", urgency: "critical", confidence: 90 }),
]);
check("queue ranks by priority", q1[0].id === "hi");
check("priority is 0..100", q1.every(q => q.priority >= 0 && q.priority <= 100));

// dedup: same entity + same action class → ONE item, merged evidence + sources
const dedup = buildPriorityQueue([
  rec({ id: "seller_call", area: "seller", entityId: "s9", title: "התקשר למוכר היום — שימור", suggestedAction: "צור קשר", confidence: 60, evidence: [{ label: "סיכון נטישה", source: "crm" }] }),
  rec({ id: "deal_call", area: "deal", entityType: "seller", entityId: "s9", title: "התקשר למוכר היום", suggestedAction: "צור קשר", confidence: 70, evidence: [{ label: "מו״מ תקוע", source: "deals" }] }),
]);
check("dedup merges same entity+action to one", dedup.length === 1);
check("dedup keeps highest confidence", dedup[0].confidence === 70);
check("dedup merges evidence lines", dedup[0].evidence.length === 2);
check("dedup unions data sources", dedup[0].contributingSources.includes("crm") && dedup[0].contributingSources.includes("deals"));
check("dedup records mergedCount", dedup[0].mergedCount === 2);

// different action classes on same entity do NOT merge
const noMerge = buildPriorityQueue([
  rec({ id: "call", entityId: "s5", title: "התקשר למוכר", suggestedAction: "צור קשר" }),
  rec({ id: "price", entityId: "s5", title: "סקור תמחור", suggestedAction: "עדכן מחיר" }),
]);
check("distinct actions stay separate", noMerge.length === 2);

// actionClass is deterministic + keyword-driven
check("actionClass call", actionClass(rec({ title: "התקשר למוכר היום" })) === "call");
check("actionClass price", actionClass(rec({ title: "סקור תמחור" })) === "price");

// deterministic queue
check("queue deterministic", JSON.stringify(buildPriorityQueue([rec({ id: "x" })])) === JSON.stringify(buildPriorityQueue([rec({ id: "x" })])));

// ── Area 4 · Deal ───────────────────────────────────────────────────────────
import { scoreDeal, rankDeals, type DealSignals } from "./deal";

const dHealthy: DealSignals = {
  dealId: "d1", title: "עסקה · הרצל 5", stage: "negotiation", status: "open",
  dealRisk: 20, dealHealth: 80, dealVelocity: 70, dealProbability: 75, daysToExpectedClose: 10, openObjections: 0,
};

// healthy deal → no escalation (insufficient / nothing to nag)
const dOk = scoreDeal(dHealthy);
check("healthy deal not escalated", dOk.insufficientEvidence);
check("healthy deal honest why", dOk.why.includes("אין צורך") || dOk.why.includes("אין סיכון"));

// stalled + overdue → escalated with high urgency
const dRisk = scoreDeal({ ...dHealthy, dealRisk: 72, dealVelocity: 25, dealHealth: 35, daysToExpectedClose: -20, dealProbability: 30 });
check("risky deal escalated", !dRisk.insufficientEvidence);
check("risky deal high/critical", dRisk.urgency === "high" || dRisk.urgency === "critical");
check("risky deal evidence cites deals source", dRisk.evidence.some(e => e.source === "deals" && (e.weight ?? 0) > 0));
check("risky deal overdue action", dRisk.title.includes("מועד") || dRisk.suggestedAction.includes("סגירה"));

// open objections → objection-handling action
const dObj = scoreDeal({ ...dHealthy, dealRisk: 60, openObjections: 2 });
check("objections → handle objections", dObj.title.includes("התנגדויות") || dObj.suggestedAction.includes("התנגדויות"));

// single weak signal → below escalation floor, insufficient
const dWeak = scoreDeal({ ...dHealthy, dealProbability: 34 });
check("single weak signal not escalated", dWeak.insufficientEvidence);

// ranking + determinism
const rankedD = rankDeals([dHealthy, { ...dHealthy, dealId: "d2", dealRisk: 75, dealVelocity: 20, dealHealth: 30 }]);
check("ranked deal: real risk first", rankedD[0].entityId === "d2");
check("ranked deal: insufficient last", rankedD[rankedD.length - 1].insufficientEvidence);
const dInp: DealSignals = { ...dHealthy, dealRisk: 65, dealVelocity: 30 };
check("deal deterministic", JSON.stringify(scoreDeal(dInp)) === JSON.stringify(scoreDeal(dInp)));

// ── Area 6 · Office (manager summary over the shared queue) ─────────────────
import { summarizeOffice } from "./office";
import { buildPriorityQueue as bpq } from "./priority";

const officeQueue = bpq([
  rec({ id: "acq", area: "acquisition", entityType: "external_listing", entityId: "x1", title: "גיוס", urgency: "high", confidence: 85 }),
  rec({ id: "sell", area: "seller", entityType: "seller", entityId: "s1", title: "שימור מוכר", urgency: "critical", confidence: 90 }),
  rec({ id: "deal", area: "deal", entityType: "deal", entityId: "d1", title: "עסקה בסיכון", urgency: "high", confidence: 70 }),
  rec({ id: "buy", area: "buyer", entityType: "buyer", entityId: "b1", title: "שלח נכס", urgency: "high", confidence: 80 }),
]);
const office = summarizeOffice(officeQueue);
check("office picks top opportunity (acq/buyer)", office.topOpportunity?.area === "acquisition" || office.topOpportunity?.area === "buyer");
check("office picks top risk (deal/seller)", office.topRisk?.area === "seller" || office.topRisk?.area === "deal");
check("office picks biggest revenue (buyer/deal)", office.biggestRevenue?.area === "buyer" || office.biggestRevenue?.area === "deal");
check("office picks retention (seller)", office.biggestRetention?.area === "seller");
check("office totals count", office.totalActionable === 4);
// honest nulls on empty queue
const emptyOffice = summarizeOffice([]);
check("office empty → nulls", emptyOffice.topOpportunity === null && emptyOffice.topRisk === null && emptyOffice.totalActionable === 0);
check("office deterministic", JSON.stringify(summarizeOffice(officeQueue)) === JSON.stringify(summarizeOffice(officeQueue)));

// ── Phase 2 · Today Agenda (chronological workday from the shared queue) ─────
import { buildAgenda } from "./agenda";

const agendaQueue = bpq([
  rec({ id: "a1", area: "seller", entityType: "seller", entityId: "s1", title: "התקשר למוכר היום — שימור", suggestedAction: "צור קשר", urgency: "critical", confidence: 92 }),
  rec({ id: "a2", area: "buyer", entityType: "buyer", entityId: "b1", title: "שלח נכס מתאים לקונה", suggestedAction: "שלח נכס", urgency: "high", confidence: 80 }),
  rec({ id: "a3", area: "deal", entityType: "deal", entityId: "d1", title: "סקור תמחור נכס", suggestedAction: "עדכן מחיר", urgency: "medium", confidence: 60 }),
]);
const agenda = buildAgenda(agendaQueue, { now: new Date(0) });
check("agenda schedules every actionable item", agenda.slots.length === 3);
check("agenda starts at 09:00", agenda.firstActionTime === "09:00");
check("agenda highest priority is first slot", agenda.slots[0].rec.id === "a1");
check("agenda slots are chronological", agenda.slots.every((s, i) => i === 0 || s.startTime >= agenda.slots[i - 1].endTime));
check("agenda assigns kind per action class", agenda.slots[0].kind === "call" && agenda.slots[1].kind === "send" && agenda.slots[2].kind === "price");
check("agenda durations by class", agenda.slots[0].durationMin === 20 && agenda.slots[1].durationMin === 15 && agenda.slots[2].durationMin === 30);
check("agenda sums planned minutes", agenda.plannedMinutes === 65);
// empty queue → honest empty day
const emptyAgenda = buildAgenda([]);
check("agenda empty → no slots", emptyAgenda.slots.length === 0 && emptyAgenda.firstActionTime === null);
// maxSlots overflow is honest, not crammed
const many = bpq(Array.from({ length: 12 }, (_, i) => rec({ id: `m${i}`, entityId: `e${i}`, title: "התקשר ללקוח", suggestedAction: "צור קשר", confidence: 90 - i })));
const capped = buildAgenda(many, { maxSlots: 8 });
check("agenda caps the visible day", capped.slots.length === 8 && capped.overflow === 4);
// lunch is kept clear
const lunchTest = buildAgenda(bpq(Array.from({ length: 8 }, (_, i) => rec({ id: `l${i}`, entityId: `le${i}`, title: "פגישה עם לקוח", suggestedAction: "קבע פגישה", confidence: 90 - i }))), { lunchHour: 13, maxSlots: 8 });
check("agenda keeps lunch clear", lunchTest.slots.every((s) => !(s.startTime < "14:00" && s.endTime > "13:00")));
// deterministic
check("agenda deterministic", JSON.stringify(buildAgenda(agendaQueue, { now: new Date(0) })) === JSON.stringify(buildAgenda(agendaQueue, { now: new Date(0) })));

// ── Phase 3 · Recommendation lifecycle (dismiss/snooze/complete/…) ──────────
import { reduceLatestStates, applyLifecycle, isHidden, type LifecycleEvent } from "./lifecycle";
import { recKey } from "./priority";

const lcQueue = bpq([
  rec({ id: "q1", area: "seller", entityType: "seller", entityId: "s1", title: "התקשר למוכר היום", suggestedAction: "צור קשר", urgency: "critical", confidence: 90 }),
  rec({ id: "q2", area: "buyer", entityType: "buyer", entityId: "b1", title: "שלח נכס מתאים", suggestedAction: "שלח נכס", urgency: "high", confidence: 80 }),
  rec({ id: "q3", area: "deal", entityType: "deal", entityId: "d1", title: "סקור תמחור", suggestedAction: "עדכן מחיר", urgency: "medium", confidence: 60 }),
]);
const kSeller = recKey(lcQueue[0]);
const kBuyer = recKey(lcQueue[1]);
const kDeal = recKey(lcQueue[2]);

// recKey is the stable identity (three colon-separated parts)
check("recKey format", kSeller.split(":").length === 3 && kSeller.startsWith("seller:s1:"));

// latest event wins per key
const states = reduceLatestStates([
  { recKey: kSeller, action: "accepted", at: "2026-07-10T08:00:00Z" },
  { recKey: kSeller, action: "dismissed", at: "2026-07-10T09:00:00Z" },
] as LifecycleEvent[]);
check("reduce keeps latest", states.get(kSeller)?.action === "dismissed");

// dismissed + completed + rejected + done_elsewhere are all hidden
const now = new Date("2026-07-10T10:00:00Z");
for (const a of ["dismissed", "completed", "rejected", "done_elsewhere"] as const) {
  check(`${a} hides`, isHidden({ recKey: "x", action: a, at: "" }, now));
}
// accepted stays visible (in-progress)
check("accepted stays visible", !isHidden({ recKey: "x", action: "accepted", at: "" }, now));
// snoozed hides only until snoozeUntil
check("snooze future hides", isHidden({ recKey: "x", action: "snoozed", at: "", snoozeUntil: "2026-07-10T12:00:00Z" }, now));
check("snooze expired resurfaces", !isHidden({ recKey: "x", action: "snoozed", at: "", snoozeUntil: "2026-07-10T09:00:00Z" }, now));

// applyLifecycle removes hidden, annotates the rest, preserves order
const applied = applyLifecycle(lcQueue, reduceLatestStates([
  { recKey: kSeller, action: "dismissed", at: "2026-07-10T09:00:00Z" },
  { recKey: kBuyer, action: "accepted", at: "2026-07-10T09:00:00Z" },
] as LifecycleEvent[]), now);
check("dismissed drops from queue", !applied.some((r) => r.entityId === "s1"));
check("accepted stays, annotated", applied.find((r) => r.entityId === "b1")?.lifecycle?.action === "accepted");
check("untouched has null lifecycle", applied.find((r) => r.entityId === "d1")?.lifecycle === null);
check("applyLifecycle preserves order", applied[0].entityId === "b1" && applied[1].entityId === "d1");
void kDeal;
// deterministic
check("lifecycle deterministic", JSON.stringify(applyLifecycle(lcQueue, states, now)) === JSON.stringify(applyLifecycle(lcQueue, states, now)));

// ── Phase 4 · Learning loop (re-rank from real historical outcomes) ─────────
import { summarizeOutcomes, applyLearning, MIN_SAMPLES, MAX_ADJUSTMENT, type OutcomeSample } from "./learning";

// below MIN_SAMPLES → no adjustment (honest, won't learn from noise)
const thin = summarizeOutcomes([{ area: "seller", actionClass: "call", action: "completed" }]);
check("thin history → zero area adj", thin.byArea["seller"].adjustment === 0);

// consistent positive on an area → positive, bounded adjustment
const posSamples: OutcomeSample[] = Array.from({ length: 6 }, () => ({ area: "buyer", actionClass: "send", action: "completed" as const }));
const posModel = summarizeOutcomes(posSamples);
check("consistent positive → positive adj", posModel.byArea["buyer"].adjustment > 0);
check("adjustment bounded", posModel.byArea["buyer"].adjustment <= MAX_ADJUSTMENT && MIN_SAMPLES === 3);

// consistent dismiss on an area → negative adjustment
const negModel = summarizeOutcomes(Array.from({ length: 5 }, () => ({ area: "acquisition", actionClass: "call", action: "dismissed" as const })));
check("consistent dismiss → negative adj", negModel.byArea["acquisition"].adjustment < 0);

// applyLearning re-ranks: a learned-preferred item can overtake a slightly higher base
const lqueue = bpq([
  rec({ id: "base_hi", area: "acquisition", entityType: "external_listing", entityId: "x1", title: "גיוס", suggestedAction: "צור קשר", urgency: "high", confidence: 70 }),
  rec({ id: "learn_up", area: "buyer", entityType: "buyer", entityId: "b1", title: "שלח נכס", suggestedAction: "שלח נכס", urgency: "high", confidence: 66 }),
]);
const beforeTop = lqueue[0].id;
// buyer/send is loved, acquisition/call is disliked → order should flip
const mixModel = summarizeOutcomes([
  ...Array.from({ length: 6 }, () => ({ area: "buyer", actionClass: "send", action: "completed" as const })),
  ...Array.from({ length: 6 }, () => ({ area: "acquisition", actionClass: "call", action: "dismissed" as const })),
]);
const relearned = applyLearning(lqueue, mixModel);
check("learning re-ranks by real behavior", beforeTop === "base_hi" && relearned[0].id === "learn_up");
check("learning records adjustment", relearned.every((r) => typeof r.learningAdjustment === "number"));
check("learning keeps priority 0..100", relearned.every((r) => r.priority >= 0 && r.priority <= 100));

// neutral model → identity (no reordering, zero adjustments)
const neutral = summarizeOutcomes([]);
const unchanged = applyLearning(lqueue, neutral);
check("neutral model doesn't reorder", unchanged[0].id === lqueue[0].id && unchanged.every((r) => r.learningAdjustment === 0));
check("learning deterministic", JSON.stringify(applyLearning(lqueue, mixModel)) === JSON.stringify(applyLearning(lqueue, mixModel)));

// ── Phase 5 · Recommendation explanation (why now / why this / why first) ───
import { explainRecommendation } from "./explain";

const exQueue = bpq([
  rec({
    id: "ex1", area: "seller", entityType: "seller", entityId: "s1",
    title: "התקשר למוכר היום — שימור", suggestedAction: "צור קשר", why: "המוכר לא עודכן שבועיים.",
    urgency: "critical", confidence: 88, expectedImpact: "שימור בלעדיות + מניעת נטישה",
    evidence: [
      { label: "סיכון נטישה גבוה", source: "crm", weight: 34 },
      { label: "אין קשר 14 יום", source: "timeline", weight: 20 },
    ],
  }),
  rec({ id: "ex2", area: "buyer", entityType: "buyer", entityId: "b1", title: "שלח נכס", suggestedAction: "שלח נכס", confidence: 70 }),
]);
const ex = explainRecommendation(exQueue[0], { rank: 1, total: 2 });
check("explain answers why now (urgency)", ex.whyNow.includes("מיידי"));
check("explain why-now folds timing evidence", ex.whyNow.includes("14 יום"));
check("explain why-this cites strongest evidence", ex.whyThis.includes("סיכון נטישה"));
check("explain why-before-others cites rank", ex.whyBeforeOthers.includes("#1 מתוך 2"));
check("explain if-ignored is area-specific (seller)", ex.ifIgnored.includes("בלעדיות") || ex.ifIgnored.includes("מוכר"));
check("explain expected value passes through", ex.expectedValue.includes("שימור"));
check("explain carries evidence + confidence", ex.evidence.length === 2 && ex.confidence === 88);
// corroboration + learning surfaced when present
const merged = bpq([
  rec({ id: "m1", entityType: "seller", entityId: "s9", title: "התקשר למוכר", suggestedAction: "צור קשר", confidence: 60, evidence: [{ label: "a", source: "crm" }] }),
  rec({ id: "m2", area: "deal", entityType: "seller", entityId: "s9", title: "התקשר למוכר", suggestedAction: "צור קשר", confidence: 70, evidence: [{ label: "b", source: "deals" }] }),
]);
const exMerged = explainRecommendation({ ...merged[0], learningAdjustment: 6 }, { rank: 1, total: 1 });
check("explain notes corroboration", exMerged.whyBeforeOthers.includes("מנועי מודיעין"));
check("explain notes positive learning", exMerged.whyBeforeOthers.includes("נוטה לפעול"));
// deterministic
check("explain deterministic", JSON.stringify(explainRecommendation(exQueue[0], { rank: 1, total: 2 })) === JSON.stringify(explainRecommendation(exQueue[0], { rank: 1, total: 2 })));

console.log(`\nBroker Intelligence · Areas1-6 + Queue + Agenda + Lifecycle + Learning + Explain QA — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
