// ============================================================================
// 🏠 Listing Agent — Strategy Engine (pure). 29.3.3.
// Upgrades the agent from diagnosing problems to building a complete LISTING
// STRATEGY: what should happen, when, why and in which order. Combines valuation,
// market performance, buyer demand, competition, property health, truth and
// SELLER ALIGNMENT. Reuses the recommendation engine for the ordered playbook —
// no duplicated logic. Evidence-only; nothing auto-executes.
// ============================================================================
import { clamp } from "./health";
import type {
  ListingSignals, PropertyHealth, MarketPerformance, ListingRecommendation,
  StrategyType, ListingStrategy, SellerAlignment, PlaybookAction, Impact, StrategyChange,
} from "./types";

const AGGRESSIVE: StrategyType[] = ["reduce_price", "aggressive_selling", "increase_price"];
const LUXURY = 4_000_000;

function sellerAlignment(sig: ListingSignals): SellerAlignment {
  const rd = sig.seller?.readiness ?? null, tr = sig.seller?.trust ?? null, pf = sig.seller?.priceFlexibility ?? null;
  const notes: string[] = [];
  const aggressiveOk = pf == null ? true : pf >= 35;
  if (pf != null && pf < 35) notes.push("המוכר מתנגד להורדת מחיר — נדרשת פגישת יישור ציפיות תחילה");
  if (tr != null && tr < 40) notes.push("אמון מוכר נמוך — חזק קשר לפני מהלכים אגרסיביים");
  if (sig.seller?.mainObjection) notes.push(`התנגדות מרכזית: ${sig.seller.mainObjection}`);
  return { readiness: rd, trust: tr, priceFlexibility: pf, aggressiveOk, notes };
}

function inferCurrent(sig: ListingSignals): StrategyType {
  if (sig.campaignActive === true) return "launch_campaign";
  if (sig.hasExclusivity) return "premium_exposure";
  if ((sig.timeOnMarketDays ?? 0) <= 14) return "slow_burn";
  return "hold";
}

interface Cand { s: StrategyType; score: number; why: string[] }

const LEAD: Record<string, { action: string; missionType: string; durationDays: number }> = {
  reduce_price: { action: "התכנס עם המוכר להורדת מחיר לכיוון טווח ההערכה", missionType: "PRICE_REVIEW", durationDays: 5 },
  increase_price: { action: "בחן העלאת מחיר מול הביקוש וההערכה", missionType: "PRICE_REVIEW", durationDays: 5 },
  seller_meeting: { action: "קבע פגישת יישור ציפיות עם המוכר", missionType: "SELLER_FOLLOWUP", durationDays: 3 },
  refresh_marketing: { action: "רענן את המודעה", missionType: "MARKETING_REFRESH", durationDays: 5 },
  launch_campaign: { action: "השק קמפיין ממומן", missionType: "CAMPAIGN_LAUNCH", durationDays: 7 },
  luxury_campaign: { action: "השק קמפיין יוקרה ממוקד", missionType: "CAMPAIGN_LAUNCH", durationDays: 10 },
  premium_exposure: { action: "מקם חשיפה פרימיום", missionType: "CAMPAIGN_LAUNCH", durationDays: 7 },
  photography_refresh: { action: "החלף/שדרג תמונות", missionType: "PHOTOGRAPHY", durationDays: 10 },
  open_house: { action: "ארגן בית פתוח", missionType: "OPEN_HOUSE", durationDays: 7 },
  buyer_reactivation: { action: "חזור למתעניינים קודמים", missionType: "BUYER_FOLLOWUP", durationDays: 5 },
  valuation_update: { action: "קבע עדכון הערכת שווי / CMA", missionType: "VALUATION_REVIEW", durationDays: 14 },
  aggressive_selling: { action: "הפעל מהלך מכירה אגרסיבי (בית פתוח + קמפיין + חזרה למתעניינים)", missionType: "CAMPAIGN_LAUNCH", durationDays: 10 },
  hold: { action: "המשך ניטור והחזק פוזיציה", missionType: "MARKETING_REFRESH", durationDays: 14 },
  slow_burn: { action: "ניהול שקט עם ניטור ביצועים", missionType: "MARKETING_REFRESH", durationDays: 21 },
};
const OUTCOME: Record<string, string> = {
  reduce_price: "האצת פניות וקיצור זמן מכירה", increase_price: "מקסום ערך תוך שמירת קצב", seller_meeting: "יישור ציפיות והסרת חסמים",
  refresh_marketing: "החזרת המודעה לראש התוצאות", launch_campaign: "הגדלת חשיפה ולידים", luxury_campaign: "פנייה לקהל יוקרה מתאים",
  premium_exposure: "בידול והגדלת תשומת-לב", photography_refresh: "העלאת שיעור הקלקה וצפייה", open_house: "ריכוז מתעניינים והאצת סגירה",
  buyer_reactivation: "המרת ביקוש קיים לעסקה", valuation_update: "בסיס ראייתי מדויק לתמחור",
  aggressive_selling: "סגירה מהירה במחיר תחרותי", hold: "מיצוי ערך ללא ויתור מיותר", slow_burn: "שמירת ערך לאורך זמן",
};
const APPROVALS: Record<string, string[]> = {
  reduce_price: ["מוכר"], increase_price: ["מוכר"], seller_meeting: ["מוכר"],
  launch_campaign: ["תקציב שיווק"], luxury_campaign: ["תקציב שיווק"], premium_exposure: ["תקציב שיווק"], aggressive_selling: ["מוכר", "תקציב שיווק"],
};
const RISKS: Record<string, string[]> = {
  reduce_price: ["פגיעה ברווח המוכר", "סיגנל שוק שלילי"], increase_price: ["האטת ביקוש"], hold: ["התארכות זמן מכירה"],
  aggressive_selling: ["לחץ על המחיר"], slow_burn: ["החמצת חלון שוק"], seller_meeting: ["התנגדות מוכר"],
};

export function computeListingStrategy(sig: ListingSignals, h: PropertyHealth, mp: MarketPerformance, recs: ListingRecommendation[]): ListingStrategy {
  const al = sellerAlignment(sig);
  const v = sig.valuation;
  const marketWeak = mp.domVsMarket.band === "slow" || mp.domVsMarket.band === "very_slow" || mp.buyerDemand.demandScore < 40;
  const marketStrong = mp.domVsMarket.band === "fast" || (mp.buyerDemand.demandScore >= 60 && mp.domVsMarket.band !== "very_slow");
  const valAbove = v.available && v.rangePosition === "above" && v.strongEnoughForPricing;
  const valBelow = v.available && v.rangePosition === "below" && v.strongEnoughForPricing;
  const tom = sig.timeOnMarketDays ?? 0;
  const luxury = (sig.price ?? 0) >= LUXURY;
  const stale = tom > 60 && h.freshness <= 45;
  const weakExposure = sig.matchCount <= 1 && tom > 21;

  const cand: Cand[] = [];
  // Pricing (seller-aligned).
  if (valAbove && marketWeak) {
    if (al.aggressiveOk) cand.push({ s: "reduce_price", score: 92, why: ["הערכה מעל טווח + ביצוע שוק חלש", `ביצוע שוק ${mp.score}`] });
    else cand.push({ s: "seller_meeting", score: 90, why: ["נדרש להוריד מחיר אך המוכר מתנגד — יישור ציפיות תחילה"] });
  }
  if (valAbove && marketStrong) cand.push({ s: "hold", score: 74, why: ["מחיר מעל הערכה אך הביצוע חזק — אין קונצנזוס לחתוך"] });
  if (valBelow && mp.buyerDemand.demandScore >= 55 && al.aggressiveOk) cand.push({ s: "increase_price", score: 76, why: ["הערכה מתחת לטווח + ביקוש חזק"] });
  // Demand-driven.
  if (mp.buyerDemand.demandScore >= 65 && marketStrong) cand.push({ s: "aggressive_selling", score: 82, why: ["ביקוש גבוה + קצב שוק מהיר"] });
  else if (mp.buyerDemand.demandScore >= 60) cand.push({ s: "open_house", score: 66, why: ["ביקוש גבוה — רכז מתעניינים"] });
  if (sig.matchCount > 0 && sig.recentBuyerActivity === 0) cand.push({ s: "buyer_reactivation", score: 64, why: ["מתעניינים קיימים ללא פעילות אחרונה"] });
  // Marketing/exposure.
  if (weakExposure) cand.push({ s: "launch_campaign", score: 72, why: ["חשיפה חלשה"] });
  if (luxury && (weakExposure || mp.buyerDemand.demandScore < 50)) cand.push({ s: "luxury_campaign", score: 78, why: ["נכס יוקרה עם חשיפה/ביקוש נמוכים"] });
  if (stale) { cand.push({ s: "refresh_marketing", score: 68, why: ["מודעה מתיישנת"] }); cand.push({ s: "photography_refresh", score: 55, why: ["רענון ויזואלי"] }); }
  if (sig.hasExclusivity && tom <= 21 && sig.matchCount <= 2) cand.push({ s: "premium_exposure", score: 60, why: ["בלעדיות בתחילת הדרך"] });
  // Seller / valuation.
  if (al.trust != null && al.trust < 40) cand.push({ s: "seller_meeting", score: 70, why: ["אמון מוכר נמוך"] });
  if (!v.available || !v.fresh) cand.push({ s: "valuation_update", score: 58, why: [v.available ? "הערכה מיושנת" : "אין הערכת שווי"] });
  // Baselines.
  if (mp.score >= 68 && !valAbove) cand.push({ s: "hold", score: 66, why: ["הנכס מבצע היטב"] });
  if (tom <= 14) cand.push({ s: "slow_burn", score: 42, why: ["מודעה חדשה — ניטור"] });
  if (!cand.length) cand.push({ s: mp.score >= 55 ? "hold" : "refresh_marketing", score: 40, why: ["ברירת מחדל לפי ביצוע"] });

  cand.sort((a, b) => b.score - a.score);
  const top = cand[0];
  const recommendedStrategy = top.s;
  const alternatives = [...new Set(cand.slice(1).map((c) => c.s))].filter((s) => s !== recommendedStrategy).slice(0, 3);
  const currentStrategy = inferCurrent(sig);

  // Playbook — strategy lead action + relevant recommendations (reused, ordered).
  const lead = LEAD[recommendedStrategy];
  const playbook: PlaybookAction[] = [];
  const seen = new Set<string>();
  const push = (action: string, missionType: string, durationDays: number | null, why: string) => { if (seen.has(action)) return; seen.add(action); playbook.push({ order: playbook.length + 1, action, missionType, durationDays, why }); };
  if (lead) push(lead.action, lead.missionType, lead.durationDays, top.why[0] ?? "");
  for (const r of recs.slice(0, 4)) push(r.action, r.missionType, r.deadlineDays, r.reason);
  const expectedDurationDays = playbook.reduce((m, a) => Math.max(m, a.durationDays ?? 0), 0) || null;

  const confidence = clamp(0.4 * h.confidence + 0.3 * mp.score + 0.2 * top.score + 0.1 * (v.available ? (v.strongEnoughForPricing ? 90 : 50) : 30));
  const businessImpact: Impact = top.score >= 80 || AGGRESSIVE.includes(recommendedStrategy) ? "high" : top.score >= 60 ? "medium" : "low";

  // Strategy change detection.
  let signal: StrategyChange; let reason: string;
  if (mp.score >= 80 && mp.domVsMarket.band === "fast") { signal = "succeeded"; reason = "ביצוע שוק גבוה וקצב מכירה מהיר"; }
  else if (recommendedStrategy !== currentStrategy) { signal = "switch"; reason = `האסטרטגיה הנוכחית (${currentStrategy}) אינה מיטבית — עבור ל-${recommendedStrategy}`; }
  else if (mp.score < 45) { signal = AGGRESSIVE.includes(currentStrategy) ? "failed" : "review"; reason = "ביצוע חלש תחת האסטרטגיה הנוכחית"; }
  else { signal = "working"; reason = "האסטרטגיה הנוכחית עובדת"; }

  return {
    currentStrategy, recommendedStrategy, confidence, businessImpact,
    why: top.why, expectedOutcome: OUTCOME[recommendedStrategy] ?? "שיפור ביצועי המכירה",
    estimatedRoi: businessImpact === "high" ? "השפעה גבוהה על זמן/מחיר המכירה" : businessImpact === "medium" ? "שיפור מדיד בקצב/לידים" : "שיפור מתון",
    playbook, expectedDurationDays,
    requiredApprovals: APPROVALS[recommendedStrategy] ?? [],
    risks: RISKS[recommendedStrategy] ?? ["סיכון נמוך"],
    alternatives, change: { signal, reason }, sellerAlignment: al,
  };
}
