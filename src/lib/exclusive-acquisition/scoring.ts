// ============================================================================
// ZONO — Seller opportunity + exclusive-probability scoring (pure, deterministic).
// No AI, no randomness — every point is explained. Built to run over 100k+
// sellers cheaply (O(1) per seller). A future AI Copilot may enrich the reasons;
// these numeric outputs remain the source of truth.
// ============================================================================
import type {
  ExclusiveBand,
  ExclusiveProbabilityResult,
  ScoreReason,
  SellerScoreInput,
  SellerScoreResult,
} from "./types";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * 0–100 seller opportunity score — how attractive this owner is as an exclusive
 * acquisition target, from real listing signals. Higher = pursue sooner.
 */
export function calculateSellerOpportunityScore(input: SellerScoreInput): SellerScoreResult {
  const reasons: ScoreReason[] = [];
  const add = (code: string, label: string, points: number) => { if (points !== 0) reasons.push({ code, label, points }); };

  // Private listing — the core exclusive target (owner without a broker).
  if (input.isPrivateListing) add("private", "נכס פרטי — בעלים ללא בלעדיות", 25);

  // Price drops → motivation to sell.
  const dropPts = clamp(input.priceDropCount * 6, 0, 18);
  if (dropPts) add("price_drops", `${input.priceDropCount} ירידות מחיר — מוטיבציה למכירה`, dropPts);

  // Time on market → fatigue.
  if (input.daysOnMarket != null) {
    if (input.daysOnMarket >= 60) add("very_stale", "מעל 60 יום בשוק", 12);
    else if (input.daysOnMarket >= 30) add("stale", "מעל 30 יום בשוק", 6);
  }

  // Returned / republished → struggling to sell alone.
  if (input.returnedToMarket) add("returned", "חזר לשוק", 8);
  if (input.removedAndRepublished) add("republished", "הוסר ופורסם מחדש", 6);

  // We can deliver buyers.
  const buyerPts = clamp(input.matchingBuyerCount * 4, 0, 16);
  if (buyerPts) add("buyers", `${input.matchingBuyerCount} קונים מתאימים`, buyerPts);

  const demandPts = clamp(Math.round(input.buyerDemandIndex * 10), 0, 10);
  if (demandPts) add("demand", "ביקוש גבוה באזור", demandPts);

  // Falling market → seller more motivated to lock a deal.
  if (input.marketTrendDelta < -0.02) add("trend_down", "מגמת מחירים יורדת", 8);

  if (input.recentActivity) add("recent", "פעילות אחרונה במודעה", 4);

  // Prior contact: a prior response is positive; repeated unanswered contact fatigues.
  if (input.previousContactCount > 0) {
    if (input.respondedBefore) add("responded", "הגיב בעבר", 6);
    else add("fatigue", "כבר נוצר קשר ללא מענה", -4);
  }

  const score = clamp(Math.round(reasons.reduce((a, r) => a + r.points, 0)), 0, 100);
  return { score, reasons: reasons.sort((a, b) => b.points - a.points) };
}

const BAND_LABEL: Record<ExclusiveBand, string> = {
  very_high: "סבירות גבוהה מאוד",
  high: "סבירות גבוהה",
  medium: "סבירות בינונית",
  low: "סבירות נמוכה",
};

export function bandFor(probability: number): ExclusiveBand {
  if (probability >= 90) return "very_high";
  if (probability >= 70) return "high";
  if (probability >= 50) return "medium";
  return "low";
}

/**
 * 0–100 probability that the owner signs an EXCLUSIVE listing, with a band +
 * explanations. Emphasizes the signals that actually convert: private owner,
 * deliverable buyers, motivation (drops / stale), and prior engagement.
 */
export function calculateExclusiveProbability(
  input: SellerScoreInput,
  sellerScore: number,
): ExclusiveProbabilityResult {
  const reasons: ScoreReason[] = [];
  const add = (code: string, label: string, points: number) => { if (points !== 0) reasons.push({ code, label, points }); };

  let p = 18; // base willingness floor
  add("base", "בסיס", 18);

  if (input.isPrivateListing) { p += 30; add("private", "נכס פרטי — מתאים לבלעדיות", 30); }
  else { add("broker", "מתפרסם דרך מתווך", 0); }

  const buyerBoost = clamp(Math.min(input.matchingBuyerCount, 5) * 6, 0, 30);
  if (buyerBoost) { p += buyerBoost; add("buyers", `אפשר להביא ${input.matchingBuyerCount} קונים`, buyerBoost); }

  const dropBoost = clamp(Math.min(input.priceDropCount, 3) * 5, 0, 15);
  if (dropBoost) { p += dropBoost; add("price_drops", "ירידות מחיר מצביעות על מוטיבציה", dropBoost); }

  if (input.daysOnMarket != null && input.daysOnMarket >= 45) { p += 10; add("stale", "תקופה ארוכה בשוק", 10); }
  if (input.marketTrendDelta < -0.02) { p += 8; add("trend_down", "שוק יורד", 8); }
  if (input.respondedBefore) { p += 7; add("responded", "כבר הגיב בעבר", 7); }
  if (input.removedAndRepublished || input.returnedToMarket) { p += 5; add("republished", "חזר/פורסם מחדש", 5); }

  // Light coupling to the opportunity score so the two move together.
  const lift = Math.round((sellerScore - 50) * 0.1);
  if (lift !== 0) { p += lift; add("score_lift", "התאמה לציון ההזדמנות", lift); }

  const probability = clamp(Math.round(p), 0, 100);
  const band = bandFor(probability);
  return { probability, band, bandLabel: BAND_LABEL[band], reasons: reasons.sort((a, b) => b.points - a.points) };
}
