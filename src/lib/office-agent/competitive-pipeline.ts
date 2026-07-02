// ============================================================================
// 🏢 Office Growth Agent — Competitive + Pipeline engines (pure). 29.7.
// Parts 5 + 6. Reuses Competitive Intelligence + the CRM pipeline overviews and
// the Mission Action Center — no re-derivation. Evidence-only; detects bottlenecks.
// ============================================================================
import { clamp } from "./health";
import type { OfficeSignals, CompetitiveFinding, PipelineIntelligence, PipelineStage } from "./types";

const ratio = (a: number, b: number): number => (b > 0 ? a / b : 0);

// ── Part 5 — Competitive Intelligence ───────────────────────────────────────
export function detectCompetitive(sig: OfficeSignals): CompetitiveFinding[] {
  const out: CompetitiveFinding[] = [];
  const c = sig.competitive;

  if (c.inventoryTrendPct < -5) out.push({ type: "lost_market_share", title: "אובדן נתח שוק", why: "מגמת המלאי בערים שנותחו שלילית — הנוכחות מצטמצמת מול השוק.", evidence: [`מגמת מלאי ${c.inventoryTrendPct}%`, `${sig.decliningCities} ערים בירידה`], impact: "high" });

  for (const g of c.growingCompetitors.slice(0, 3)) out.push({ type: "growing_competitor", title: `מתחרה בצמיחה: ${g.name}`, why: "מתחרה מגדיל נוכחות מהר — איום על נתח השוק שלנו.", evidence: [`${g.name} (${g.city}) צמיחה ${g.growthPct}%`], impact: g.growthPct >= 30 ? "high" : "medium" });

  for (const w of c.decliningCompetitors.slice(0, 2)) out.push({ type: "weak_competitor", title: `מתחרה נחלש: ${w.name}`, why: "מתחרה בירידה — חלון לקליטת מלאי/מתווכים והרחבת נתח.", evidence: [`${w.name} (${w.city}) ${w.growthPct}%`], impact: "medium" });

  for (const a of c.emergingAreas.slice(0, 3)) out.push({ type: "expansion_opportunity", title: `אזור מתפתח: ${a.title}`, why: "אזור עם מומנטום — הרחבה מוקדמת תתפוס נתח לפני המתחרים.", evidence: [a.evidence || a.area || a.title], impact: "medium" });

  for (const a of sig.weakAreas.slice(0, 2)) out.push({ type: "territory_opportunity", title: `הזדמנות טריטוריה: ${a}`, why: "כיסוי חסר באזור — פוטנציאל להגדלת מלאי ונוכחות.", evidence: [a], impact: "medium" });

  if (c.marketConcentration >= 2500 && c.topOfficeSharePct < 25) out.push({ type: "competitive_threat", title: "שוק מרוכז בשליטת מתחרים", why: "ריכוזיות שוק גבוהה ונתח שלנו נמוך — נדרשת הגנה/בידול.", evidence: [`ריכוזיות ${c.marketConcentration}`, `נתח מוביל ${c.topOfficeSharePct}%`], impact: "high" });

  return out;
}

// ── Part 6 — Pipeline Intelligence (bottleneck detection) ───────────────────
export function analyzePipelines(sig: OfficeSignals): PipelineIntelligence {
  const stages: PipelineStage[] = [];
  const bottlenecks: string[] = [];

  // Lead → Buyer/Seller → Listing → Mission.
  const lead = sig.leadPipeline;
  const leadHealth = clamp(lead.total === 0 ? 30 : 45 + ratio(lead.convertReady + lead.hot, lead.total) * 45 - ratio(lead.duplicates + lead.humanReview, lead.total) * 20);
  const leadBott = lead.total > 0 && ratio(lead.convertReady, lead.total) < 0.15 ? "מעט לידים מוכנים להמרה" : lead.duplicates > lead.total * 0.2 ? "כפילויות רבות בלידים" : null;
  stages.push({ name: "לידים", health: leadHealth, volume: lead.total, bottleneck: leadBott, note: `${lead.hot} חמים · ${lead.convertReady} להמרה · ${lead.duplicates} כפילויות` });

  const buyer = sig.buyerPipeline;
  const buyerHealth = clamp(buyer.total === 0 ? 30 : 45 + ratio(buyer.hot + buyer.closing + buyer.withMatches, buyer.total) * 45 - ratio(buyer.cold, buyer.total) * 20);
  const buyerBott = buyer.total > 0 && ratio(buyer.withMatches, buyer.total) < 0.2 ? "מעט קונים עם התאמות נכס" : buyer.cold > buyer.total * 0.4 ? "ריבוי קונים קרים" : null;
  stages.push({ name: "קונים", health: buyerHealth, volume: buyer.total, bottleneck: buyerBott, note: `${buyer.hot} חמים · ${buyer.withMatches} עם התאמות · ${buyer.cold} קרים` });

  const seller = sig.sellerPipeline;
  const sellerHealth = clamp(seller.total === 0 ? 30 : 45 + ratio(seller.readyToSign + seller.hot, seller.total) * 45 - ratio(seller.atRisk + seller.priceIssues, seller.total) * 25);
  const sellerBott = seller.priceIssues > seller.total * 0.3 ? "פערי מחיר אצל מוכרים" : seller.atRisk > seller.total * 0.3 ? "מוכרים בסיכון נטישה" : null;
  stages.push({ name: "מוכרים", health: sellerHealth, volume: seller.total, bottleneck: sellerBott, note: `${seller.readyToSign} לחתימה · ${seller.priceIssues} פערי מחיר · ${seller.atRisk} בסיכון` });

  const listing = sig.listingPipeline;
  const listingHealth = clamp(listing.total === 0 ? 30 : 45 + ratio(listing.healthy + listing.highOpportunity, listing.total) * 45 - ratio(listing.critical + listing.stale, listing.total) * 25);
  const listingBott = listing.stale > listing.total * 0.3 ? "נכסים מתיישנים רבים" : listing.critical > listing.total * 0.2 ? "נכסים במצב קריטי" : null;
  stages.push({ name: "מלאי", health: listingHealth, volume: listing.total, bottleneck: listingBott, note: `${listing.healthy} בריאים · ${listing.stale} מתיישנים · ${listing.critical} קריטיים` });

  const m = sig.missions;
  const missionHealth = clamp(m.executionScore * 0.6 + m.completionRatePct * 0.4);
  const missionBott = m.blocked + m.waiting > Math.max(1, m.active) * 0.4 ? "משימות חסומות/ממתינות לאישור" : null;
  stages.push({ name: "משימות", health: missionHealth, volume: m.active, bottleneck: missionBott, note: `${m.active} פעילות · ${m.blocked} חסומות · ${m.waiting} ממתינות` });

  for (const s of stages) if (s.bottleneck) bottlenecks.push(`${s.name}: ${s.bottleneck}`);
  const overallHealth = clamp(stages.reduce((n, s) => n + s.health, 0) / stages.length);
  return { stages, bottlenecks, overallHealth };
}
