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

console.log(`\nBroker Intelligence · Acquisition+Buyer QA — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
