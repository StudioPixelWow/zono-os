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

console.log(`\nBroker Intelligence · Areas1-3 + Global Queue QA — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
