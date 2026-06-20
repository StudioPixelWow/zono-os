/**
 * Inventory Acquisition OS — deterministic scoring + outreach script + NBA.
 * Pure, client-safe, no LLM, no network. Turns external market intelligence
 * into a broker acquisition engine.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export type AcquisitionStatus =
  | "new" | "qualified" | "needs_review" | "contacted"
  | "followup_scheduled" | "not_relevant" | "promoted_to_crm" | "converted_to_seller" | "lost";

export const ACQ_STATUS_LABEL: Record<string, string> = {
  new: "חדש", qualified: "איכותי", needs_review: "דורש בדיקה", contacted: "נוצר קשר",
  followup_scheduled: "פולואפ", not_relevant: "לא רלוונטי", promoted_to_crm: "קודם ל-CRM",
  converted_to_seller: "הומר למוכר", lost: "אבוד",
};
/** Kanban column order for the acquisition board. */
export const ACQ_BOARD_COLUMNS: { key: string; label: string }[] = [
  { key: "new", label: "חדש" },
  { key: "needs_review", label: "דורש בדיקה" },
  { key: "qualified", label: "איכותי" },
  { key: "contacted", label: "נוצר קשר" },
  { key: "followup_scheduled", label: "פולואפ" },
  { key: "promoted_to_crm", label: "קודם ל-CRM" },
  { key: "not_relevant", label: "לא רלוונטי" },
];

// ── Inputs ───────────────────────────────────────────────────────────────────
export interface AcquisitionInput {
  listingSourceType: string; // private_seller | broker | agency | office | exclusive | unknown
  brokerDetectionStatus: string; // auto | needs_review | approved | rejected | unknown
  hasAgent: boolean | null;
  hasPhone: boolean;
  hasName: boolean;
  externalOpportunityScore: number; // 0..100 (from external listing)
  belowAverage: boolean;
  priceDropCount: number;
  duplicateConfidence: number; // 0..100
  daysSinceSynced: number | null;
  // buyer demand
  matchingBuyers: number;
  topBuyerReadiness: number; // 0..100
  // market (from market_area_snapshots)
  marketDemand: number; // 0..100
  marketSupply: number; // 0..100
  marketOpportunity: number; // 0..100
  // sold-price transaction valuation (from property_research_reports) — optional
  transactionGapPercent?: number | null; // asking vs sold-price market value; negative = below market
  transactionConfidence?: number; // 0..100 confidence of the valuation
  transactionComparables?: number; // # comparable sold transactions used
  // business
  price: number | null;
}

export interface AcquisitionScores {
  private_seller_score: number;
  buyer_demand_score: number;
  price_opportunity_score: number;
  market_gap_score: number;
  contactability_score: number;
  broker_competition_score: number;
  double_side_potential_score: number;
  transaction_valuation_score: number;
  acquisition_score: number;
}

// ── Sub-scores ───────────────────────────────────────────────────────────────
export function calculatePrivateSellerScore(i: AcquisitionInput): number {
  switch (i.listingSourceType) {
    case "private_seller": return i.hasAgent === false ? 92 : 85;
    case "unknown": return 55;
    case "exclusive": return 25;
    case "office":
    case "agency": return 15;
    case "broker": return 25;
    default: return 45;
  }
}

export function calculateBuyerDemandScore(i: AcquisitionInput): number {
  let s = Math.min(60, i.matchingBuyers * 18);
  s += i.topBuyerReadiness * 0.4;
  return clamp(s);
}

export function calculatePriceOpportunityScore(i: AcquisitionInput): number {
  let s = i.externalOpportunityScore * 0.4;
  if (i.belowAverage) s += 30;
  s += Math.min(20, i.priceDropCount * 10);
  if (i.marketOpportunity >= 70) s += 10;
  return clamp(s);
}

export function calculateMarketGapScore(i: AcquisitionInput): number {
  // High demand + low supply = strong inventory gap to fill.
  let s = i.marketDemand * 0.6;
  s += Math.max(0, (60 - i.marketSupply)) * 0.4;
  if (i.marketDemand >= 70 && i.marketSupply <= 50) s += 12;
  return clamp(s);
}

export function calculateContactabilityScore(i: AcquisitionInput): number {
  let s = 20;
  if (i.hasPhone) s += 55;
  if (i.hasName) s += 20;
  if (i.daysSinceSynced != null && i.daysSinceSynced <= 7) s += 5;
  return clamp(s);
}

/** Higher = more broker competition (a NEGATIVE for acquisition). */
export function calculateBrokerCompetitionScore(i: AcquisitionInput): number {
  if (i.listingSourceType === "agency" || i.listingSourceType === "office") return 85;
  if (i.listingSourceType === "broker") return 70;
  if (i.listingSourceType === "exclusive") return 90;
  if (i.listingSourceType === "unknown") return 45;
  return 10; // private seller — little competition
}

/**
 * Sold-price transaction valuation: how attractively the asking price sits vs
 * the market value derived from real government sold-price comparables. Negative
 * gap (below market) = strong acquisition value; weighted by valuation
 * confidence. Returns 0 when there's no sold-price evidence (never invents).
 */
export function calculateTransactionValuationScore(i: AcquisitionInput): number {
  const gap = i.transactionGapPercent;
  const conf = clamp(i.transactionConfidence ?? 0);
  const comps = i.transactionComparables ?? 0;
  if (gap == null || comps <= 0) return 0; // no sold-price comparables → no signal
  let s: number;
  if (gap <= -12) s = 92;
  else if (gap <= -6) s = 78;
  else if (gap < 0) s = 62;
  else if (gap <= 5) s = 45;
  else if (gap <= 12) s = 30;
  else s = 18;
  const confFactor = 0.55 + 0.45 * (conf / 100);
  return clamp(s * confFactor);
}

export function calculateDoubleSidePotentialScore(privateSeller: number, buyerDemand: number, priceOpp: number): number {
  // Win the seller side (private) AND already have buyers + attractive price.
  let s = privateSeller * 0.4 + buyerDemand * 0.4 + priceOpp * 0.2;
  if (privateSeller >= 80 && buyerDemand >= 50) s += 10;
  return clamp(s);
}

export function calculateAcquisitionScore(i: AcquisitionInput): AcquisitionScores {
  const priv = calculatePrivateSellerScore(i);
  const demand = calculateBuyerDemandScore(i);
  const price = calculatePriceOpportunityScore(i);
  const gap = calculateMarketGapScore(i);
  const contact = calculateContactabilityScore(i);
  const competition = calculateBrokerCompetitionScore(i);
  const doubleSide = calculateDoubleSidePotentialScore(priv, demand, price);
  const txnVal = calculateTransactionValuationScore(i);

  // Weighted: private-seller acquirability + buyer demand drive it; broker
  // competition penalizes; contactability gates real-world reachability.
  let s = priv * 0.34 + demand * 0.22 + price * 0.16 + gap * 0.12 + contact * 0.16;
  s -= competition * 0.18; // de-prioritize broker/agency/exclusive
  if (doubleSide >= 75) s += 8;
  // Sold-price evidence: a verified below-market gap is a strong buy signal; a
  // verified over-market gap tempers the score. Neutral band leaves it unchanged.
  if (txnVal > 0) {
    if (txnVal >= 70) s += (txnVal - 60) * 0.18;       // up to ~+6
    else if (txnVal <= 35) s -= (45 - txnVal) * 0.12;  // mild over-market penalty
  }
  const acquisition = clamp(s);

  return {
    private_seller_score: priv, buyer_demand_score: demand, price_opportunity_score: price,
    market_gap_score: gap, contactability_score: contact, broker_competition_score: competition,
    double_side_potential_score: doubleSide, transaction_valuation_score: txnVal, acquisition_score: acquisition,
  };
}

// ── Status + next best action ────────────────────────────────────────────────
export function deriveAcquisitionStatus(i: AcquisitionInput, scores: AcquisitionScores): AcquisitionStatus {
  if (i.brokerDetectionStatus === "needs_review" || (i.listingSourceType === "unknown" && i.duplicateConfidence >= 60)) return "needs_review";
  if (scores.acquisition_score >= 65) return "qualified";
  return "new";
}

export interface NextAction { actionType: string; title: string; description: string; urgency: number; impact: number; confidence: number; expectedOutcome: string }

export function buildAcquisitionActions(i: AcquisitionInput, scores: AcquisitionScores, cityLabel: string): NextAction[] {
  const out: NextAction[] = [];
  const isPrivate = i.listingSourceType === "private_seller";

  if (isPrivate && i.hasPhone) {
    out.push({ actionType: "call_private_owner", title: `צור קשר עם בעלים פרטי${cityLabel ? ` ב${cityLabel}` : ""}`, description: "מודעת בעלים פרטי — הזדמנות גיוס בלעדיות.", urgency: clamp(70 + scores.acquisition_score * 0.2), impact: scores.private_seller_score, confidence: scores.contactability_score, expectedOutcome: "פגישת גיוס / קבלת ייצוג" });
  }
  if (scores.buyer_demand_score >= 40) {
    out.push({ actionType: "match_buyers", title: "בדוק התאמות לקונים", description: `${i.matchingBuyers} קונים פעילים עשויים להתאים.`, urgency: 60, impact: scores.buyer_demand_score, confidence: 75, expectedOutcome: "עסקת דו״צ פוטנציאלית" });
  }
  if (isPrivate) {
    out.push({ actionType: "prepare_acquisition_script", title: "הכן תסריט שיחת גיוס", description: "תסריט פתיחה + הצעת ערך מותאמת לאזור.", urgency: 50, impact: 55, confidence: 80, expectedOutcome: "שיחה מקצועית וממוקדת" });
  }
  if (scores.price_opportunity_score >= 60) {
    out.push({ actionType: "compare_price", title: "השווה מחיר לשוק", description: i.belowAverage ? "מתחת לממוצע השוק." : "בדוק מיצוב מחיר.", urgency: 45, impact: scores.price_opportunity_score, confidence: 70, expectedOutcome: "טיעון ערך לשיחה" });
  }
  if (scores.transaction_valuation_score >= 70 && (i.transactionComparables ?? 0) > 0) {
    out.push({ actionType: "review_transactions", title: "בדוק עסקאות אזור (מתחת לשווי)", description: `המחיר ~${Math.abs(Math.round(i.transactionGapPercent ?? 0))}% מתחת לשווי עסקאות אמת — טיעון גיוס/רכישה חזק.`, urgency: clamp(60 + scores.transaction_valuation_score * 0.2), impact: scores.transaction_valuation_score, confidence: clamp(i.transactionConfidence ?? 0), expectedOutcome: "תמחור מבוסס עסקאות אמת" });
  }
  if (i.listingSourceType === "unknown" || i.brokerDetectionStatus === "needs_review") {
    out.push({ actionType: "review_listing", title: "בדוק אם זה מתווך", description: "מפרסם לא מזוהה — דורש סיווג ידני.", urgency: 55, impact: 40, confidence: 60, expectedOutcome: "סיווג נכון של מקור" });
  }
  out.push({ actionType: "create_followup_task", title: "צור משימת גיוס", description: "פתח משימה למעקב גיוס הנכס.", urgency: 40, impact: 45, confidence: 85, expectedOutcome: "מעקב מסודר" });
  if (scores.acquisition_score >= 70 && isPrivate) {
    out.push({ actionType: "promote_to_crm", title: "קדם ל-CRM", description: "הזדמנות איכותית — שקול קידום למלאי (ידני).", urgency: 35, impact: 60, confidence: 65, expectedOutcome: "נכס בתהליך גיוס ב-CRM" });
  }
  if (!isPrivate && i.brokerDetectionStatus !== "needs_review") {
    out.push({ actionType: "mark_not_relevant", title: "סמן לא רלוונטי", description: "מודעת מתווך/משרד — תחרות, לא גיוס.", urgency: 20, impact: 20, confidence: 70, expectedOutcome: "ניקוי התור" });
  }
  return out.sort((a, b) => (b.urgency + b.impact) - (a.urgency + a.impact));
}

// ── Deterministic outreach script (draft only — no AI, no sending) ───────────
export interface ScriptInput { city: string | null; rooms: number | null; sqm: number | null; matchingBuyers: number; belowAverage: boolean; ownerName: string | null }

export interface OutreachScript {
  callOpener: string;
  whatsappDraft: string;
  valueProposition: string;
  trustHook: string;
  marketInsight: string;
  reasonForContact: string;
  cta: string;
}

export function generateOutreachScript(i: ScriptInput): OutreachScript {
  const where = i.city ?? "באזור";
  const spec = [i.rooms ? `${i.rooms} חד׳` : "", i.sqm ? `${i.sqm} מ״ר` : ""].filter(Boolean).join(", ");
  const buyerLine = i.matchingBuyers > 0 ? `יש לנו כרגע ${i.matchingBuyers} קונים פעילים שמחפשים בדיוק נכס כזה ב${where}` : `יש לנו ביקוש ער לנכסים ב${where}`;
  const hi = i.ownerName ? `שלום ${i.ownerName},` : "שלום,";
  return {
    callOpener: `${hi} ראיתי את הנכס שלך ב${where}${spec ? ` (${spec})` : ""}. ${buyerLine}, ורציתי לבדוק אם תרצה לקבל הערכת התאמה קצרה ללא התחייבות.`,
    whatsappDraft: `${hi} ראיתי את המודעה שלך ב${where}. ${buyerLine}. אשמח לתאם שיחה קצרה — מתי נוח לך?`,
    valueProposition: "ליווי מקצועי, חשיפה ממוקדת לקונים רלוונטיים, וניהול משא ומתן — כדי למכור מהר ובמחיר טוב יותר.",
    trustHook: "אנחנו פעילים באזור ומכירים את השוק המקומי לעומק.",
    marketInsight: i.belowAverage ? `נכסים דומים ב${where} נמכרים מעל המחיר המבוקש שלך — ייתכן שיש פוטנציאל תמחור גבוה יותר.` : `שוק ${where} פעיל וביקוש הקונים גבוה כעת.`,
    reasonForContact: i.matchingBuyers > 0 ? "קיימים קונים מתאימים שכבר מחפשים." : "הנכס מתאים לפרופיל הביקוש שלנו באזור.",
    cta: "אשמח לתאם שיחה קצרה או פגישה ללא התחייבות.",
  };
}

// ── AI-ready deterministic text ──────────────────────────────────────────────
export function buildAcquisitionAi(i: AcquisitionInput, scores: AcquisitionScores, cityLabel: string): { ai_summary: string; ai_outreach_strategy: string; ai_risk_summary: string; reason: string } {
  const reasons: string[] = [];
  if (i.listingSourceType === "private_seller") reasons.push("בעלים פרטי");
  if (i.belowAverage) reasons.push("מתחת לממוצע");
  if (i.priceDropCount > 0) reasons.push("ירידת מחיר");
  if (i.matchingBuyers > 0) reasons.push(`${i.matchingBuyers} קונים תואמים`);
  if (scores.market_gap_score >= 60) reasons.push("פער היצע באזור");
  const gap = i.transactionGapPercent;
  if (gap != null && (i.transactionComparables ?? 0) > 0) {
    if (gap <= -6) reasons.push(`${Math.abs(Math.round(gap))}% מתחת לשווי עסקאות`);
    else if (gap >= 8) reasons.push(`${Math.round(gap)}% מעל שווי עסקאות`);
  }
  if (!reasons.length) reasons.push("הזדמנות למעקב");
  const reason = reasons.join(" · ");

  const ai_summary = `ציון גיוס ${scores.acquisition_score}/100 ב${cityLabel || "אזור"}. ${reason}.`;
  const ai_outreach_strategy = i.listingSourceType === "private_seller"
    ? `פנייה ישירה לבעלים: הצג ביקוש קיים${i.matchingBuyers ? ` (${i.matchingBuyers} קונים)` : ""}, הצע הערכת שווי ללא התחייבות, ובנה אמון עם מומחיות מקומית.`
    : `מודעת מתווך/משרד — לא יעד גיוס ישיר. שקול שיתוף פעולה או הצגת קונה. אין לפנות כבעלים.`;
  const overMarket = i.transactionGapPercent != null && (i.transactionComparables ?? 0) > 0 && i.transactionGapPercent >= 8;
  const ai_risk_summary = i.listingSourceType !== "private_seller"
    ? "סיכון: תחרות ברוקר — הזדמנות גיוס נמוכה."
    : overMarket ? `סיכון: מחיר מבוקש ~${Math.round(i.transactionGapPercent!)}% מעל שווי עסקאות אזוריות — ציפיות מוכר גבוהות.`
    : scores.contactability_score < 50 ? "סיכון: פרטי קשר חלקיים — קושי ביצירת קשר." : "סיכון נמוך — בעלים פרטי עם פרטי קשר.";
  return { ai_summary, ai_outreach_strategy, ai_risk_summary, reason };
}
