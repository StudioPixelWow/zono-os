// ============================================================================
// 🏠 Listing Agent — Risk + Opportunity engines (pure). 29.3. Parts 6 + 7.
// Evidence-only: only real signals produce a risk/opportunity.
// ============================================================================
import type { ListingSignals, PropertyHealth, PropertyRisk, PropertyOpportunity } from "./types";

export function detectRisks(sig: ListingSignals, h: PropertyHealth): PropertyRisk[] {
  const out: PropertyRisk[] = [];
  const tom = sig.timeOnMarketDays ?? 0;
  if (tom > 90 && h.freshness <= 20) out.push({ type: "stale", severity: "high", title: "מודעה מתיישנת", evidence: [`${tom} ימים בשוק`, `טריות ${h.freshness}`] });
  else if (tom > 60 && h.freshness <= 45) out.push({ type: "stale", severity: "medium", title: "מודעה מתחילה להתיישן", evidence: [`${tom} ימים בשוק`] });
  const v = sig.valuation;
  // Overpriced — valuation-backed (asking above range) OR market-inferred.
  if (v.available && v.rangePosition === "above") out.push({ type: "overpriced", severity: v.strongEnoughForPricing ? "high" : "medium", title: "מחיר מבוקש מעל טווח ההערכה", evidence: [`מבוקש ${(sig.price ?? 0).toLocaleString("he-IL")} מול הערכה ${(v.estimatedValue ?? 0).toLocaleString("he-IL")} (+${v.priceGapPct}%)`, `ביטחון הערכה ${v.confidenceLabel}${v.fresh ? "" : " · מיושנת"}`] });
  else if (tom > 60 && h.demand < 40) out.push({ type: "overpriced", severity: "medium", title: "חשד לתמחור גבוה (תגובת שוק חלשה)", evidence: [`${tom} ימים · ביקוש ${h.demand}`, "אין הערכת שווי תומכת — נדרש CMA"] });
  // Underpriced — valuation-backed (below range) OR strong market response.
  if (v.available && v.rangePosition === "below") out.push({ type: "underpriced", severity: "medium", title: "מחיר מבוקש מתחת לטווח ההערכה", evidence: [`מבוקש מתחת להערכה (${v.priceGapPct}%)`, `ביטחון הערכה ${v.confidenceLabel}`] });
  else if (h.demand >= 75 && tom <= 21) out.push({ type: "underpriced", severity: "low", title: "אינדיקציית שוק לתמחור נמוך", evidence: [`ביקוש גבוה ${h.demand} תוך ${tom} ימים`] });
  if (sig.matchCount <= 1 && tom > 21) out.push({ type: "weak_exposure", severity: "high", title: "חשיפה חלשה", evidence: [`${sig.matchCount} התאמות בלבד`] });
  if (sig.sellerLinked && tom > 75 && h.freshness <= 20) out.push({ type: "seller_frustration", severity: "high", title: "סיכון לתסכול מוכר", evidence: [`${tom} ימים ללא התקדמות`] });
  if (h.competitionPressure >= 60) out.push({ type: "competition_pressure", severity: "medium", title: "לחץ תחרותי גבוה", evidence: [`לחץ תחרות ${h.competitionPressure}`, sig.market?.concentrationLevel ? `ריכוזיות ${sig.market.concentrationLevel}` : ""].filter(Boolean) });
  if (sig.campaignActive === false) out.push({ type: "missing_marketing", severity: "medium", title: "אין קמפיין שיווק פעיל", evidence: ["ללא קמפיין פעיל"] });
  if (h.freshness <= 10 && sig.recentBuyerActivity === 0) out.push({ type: "no_activity", severity: "medium", title: "אין פעילות אחרונה", evidence: [`טריות ${h.freshness}`] });
  if (!v.available) out.push({ type: "missing_valuation", severity: "low", title: "אין הערכת שווי זמינה", evidence: [v.unavailableReason ?? "לא נמצאה הערכה למכירה זו"] });
  else if (!v.fresh) out.push({ type: "missing_valuation", severity: "medium", title: "הערכת שווי מיושנת", evidence: [`גיל הערכה ${v.ageDays} ימים`] });
  return out;
}

export function detectOpportunities(sig: ListingSignals, h: PropertyHealth): PropertyOpportunity[] {
  const out: PropertyOpportunity[] = [];
  if (h.demand >= 65) out.push({ type: "high_demand", title: "ביקוש גבוה", evidence: [`ביקוש ${h.demand}`, `${sig.matchCount} התאמות`], impact: "high" });
  if (sig.recentBuyerActivity >= 3) out.push({ type: "new_buyers", title: "מתעניינים חדשים", evidence: [`${sig.recentBuyerActivity} פעילויות ב-30 יום`], impact: "medium" });
  if (h.demand >= 75 && (sig.timeOnMarketDays ?? 0) <= 21) out.push({ type: "price_opportunity", title: "הזדמנות תמחור (ביקוש גבוה)", evidence: ["תגובת שוק חזקה — שקול מחיר גבוה יותר"], impact: "medium" });
  if (sig.market?.inventoryTrendPct != null && sig.market.inventoryTrendPct > 5) out.push({ type: "market_shift", title: "שוק מתחזק", evidence: [`מגמת מלאי +${sig.market.inventoryTrendPct}%`], impact: "medium" });
  if (sig.market?.concentrationLevel === "fragmented") out.push({ type: "competitive_weakness", title: "שוק מפוצל — חלון להתבלטות", evidence: ["ריכוזיות נמוכה"], impact: "low" });
  if ((sig.zonoScore ?? 0) >= 75 && h.demand >= 50) out.push({ type: "territory_opportunity", title: "נכס איכותי בביקוש", evidence: [`ZONO score ${sig.zonoScore}`], impact: "medium" });
  return out;
}
