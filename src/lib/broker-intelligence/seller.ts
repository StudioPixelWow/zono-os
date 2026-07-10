// ============================================================================
// 🛡️ ZONO — BROKER INTELLIGENCE · Area 3 · Seller (PURE).
// Goal: prevent losing listings, protect seller trust, raise sell-probability.
// For ONE seller it produces a single proactive Next Best Action from REAL
// persisted signals (seller_intelligence_profiles + property_intelligence_
// profiles + seller row). Covers listing performance, marketing fatigue, buyer
// engagement, pricing resistance and exclusivity/cancellation risk. Unknown
// stays unknown — never zero, never fabricated. Offline-testable.
// ============================================================================
import {
  type Recommendation, type Evidence, clamp100, urgencyFromScore, MIN_EVIDENCE,
} from "./types";

/** REAL signals for one seller (+ their primary linked property, if any).
 *  All 0..100 scores come from persisted intelligence tables. Null = unknown. */
export interface SellerSignals {
  sellerId: string;
  name: string;
  hasSignedAgreement: boolean;
  allowsMarketing: boolean | null;
  // seller_intelligence_profiles (persisted)
  churnRisk: number | null;         // 0..100 (high = at risk of leaving)
  trust: number | null;             // 0..100
  satisfaction: number | null;      // 0..100
  engagement: number | null;        // 0..100
  daysSinceContact: number | null;
  // property_intelligence_profiles for the primary listing (persisted). Null when unlinked.
  propertyId: string | null;
  listingMomentum: number | null;   // 0..100 (attention trend)
  listingExposure: number | null;   // 0..100 (marketing reach)
  marketPosition: number | null;    // 0..100 (price competitiveness; low = resistance)
  marketingScore: number | null;    // 0..100 (marketing effectiveness)
}

type Action = { title: string; action: string; impact: string; href: string | null };

/** Score + choose the single Next Best Action from real evidence. Pure. */
export function scoreSeller(s: SellerSignals): Recommendation {
  const evidence: Evidence[] = [];
  let score = 0;

  // ── Exclusivity / cancellation risk — the thing we most want to prevent ─────
  const highChurn = s.churnRisk != null && s.churnRisk >= 55;
  const commGap = s.daysSinceContact != null && s.daysSinceContact >= 14;
  if (highChurn) {
    const w = s.churnRisk! >= 70 ? 34 : 18;
    score += w;
    evidence.push({ label: `סיכון נטישה גבוה (${s.churnRisk})`, source: "crm", weight: w });
  }
  if (commGap) {
    const w = s.daysSinceContact! >= 30 ? 18 : 10;
    score += w;
    evidence.push({ label: `${s.daysSinceContact} יום ללא קשר עם המוכר`, source: "timeline", weight: w });
  }
  if (s.trust != null && s.trust <= 40) {
    score += 10;
    evidence.push({ label: `אמון נמוך (${s.trust})`, source: "crm", weight: 10 });
  }
  if (s.satisfaction != null && s.satisfaction <= 40) {
    score += 8;
    evidence.push({ label: `שביעות רצון נמוכה (${s.satisfaction})`, source: "crm", weight: 8 });
  }

  // ── Listing performance / marketing fatigue ─────────────────────────────────
  const stagnating = s.listingMomentum != null && s.listingMomentum <= 35;
  if (stagnating) {
    score += 14;
    evidence.push({ label: `הנכס מאבד תאוצה (מומנטום ${s.listingMomentum})`, source: "deals", weight: 14 });
  }
  if (s.marketingScore != null && s.marketingScore <= 35) {
    score += 10;
    evidence.push({ label: `אפקטיביות שיווק נמוכה (${s.marketingScore})`, source: "marketing", weight: 10 });
  } else if (s.listingExposure != null && s.listingExposure <= 30) {
    score += 8;
    evidence.push({ label: `חשיפה שיווקית נמוכה (${s.listingExposure})`, source: "marketing", weight: 8 });
  }

  // ── Pricing resistance — real evidence only ────────────────────────────────
  const priceResistance = s.marketPosition != null && s.marketPosition <= 40;
  if (priceResistance) {
    score += 12;
    evidence.push({ label: `מיצוב מחיר חלש מול השוק (${s.marketPosition}) — התנגדות מחיר`, source: "market", weight: 12 });
  }

  // ── Engagement (positive) — a healthy listing still needs momentum kept ─────
  if (!stagnating && s.engagement != null && s.engagement >= 60) {
    score += 6;
    evidence.push({ label: `מעורבות מוכר גבוהה (${s.engagement})`, source: "activity", weight: 6 });
  }
  if (!s.hasSignedAgreement) {
    evidence.push({ label: "אין הסכם התקשרות חתום — חשיפה לאובדן המוכר", source: "documents" });
    if (score > 0) score += 6; // amplifies risk when other signals exist
  }

  const confidence = clamp100(score);
  const scored = evidence.filter((e) => (e.weight ?? 0) > 0).length;
  const insufficient = scored < MIN_EVIDENCE;

  const act = pickAction(s, { highChurn, commGap, stagnating, priceResistance, insufficient });
  const why = insufficient
    ? "אין מספיק אותות אמת על המוכר/הנכס כדי להמליץ בביטחון — אסוף מידע או המתן לפעילות."
    : evidence.filter((e) => (e.weight ?? 0) > 0).slice(0, 3).map((e) => e.label).join(" · ");

  return {
    id: `seller_${s.sellerId}`,
    area: "seller",
    entityType: "seller",
    entityId: s.sellerId,
    title: `${s.name} — ${act.title}`,
    why,
    evidence,
    confidence,
    urgency: urgencyFromScore(confidence),
    expectedImpact: insufficient ? "לא ניתן להעריך — אין די ראיות." : act.impact,
    suggestedAction: act.action,
    href: act.href,
    insufficientEvidence: insufficient,
  };
}

function pickAction(s: SellerSignals, f: { highChurn: boolean; commGap: boolean; stagnating: boolean; priceResistance: boolean; insufficient: boolean }): Action {
  const sellerHref = `/sellers/${s.sellerId}`;
  if (f.insufficient) {
    return { title: "המתן / אסוף מידע", action: "עדכן פרטי מוכר/נכס והרץ ניתוח מחדש; שמור על קשר.", impact: "לא ניתן להעריך.", href: sellerHref };
  }
  // Retention first — losing the seller is the worst outcome.
  if (f.highChurn || (f.commGap && (s.trust ?? 100) <= 50)) {
    return { title: "התקשר למוכר היום — שימור", action: "צור קשר יזום, חדש אמון והצג התקדמות/תכנית; זהו מוכר בסיכון נטישה.", impact: "מניעת אובדן המוכר/הבלעדיות.", href: sellerHref };
  }
  // Pricing resistance → review pricing / prepare valuation.
  if (f.priceResistance) {
    return { title: "סקור תמחור — הכן הערכת שווי", action: "הצג למוכר נתוני שוק והצע עדכון מחיר מבוסס-ראיות.", impact: "פתיחת חסם המחיר להאצת המכירה.", href: sellerHref };
  }
  // Stagnating listing / marketing fatigue → refresh marketing.
  if (f.stagnating || (s.marketingScore != null && s.marketingScore <= 35)) {
    return { title: "רענן שיווק / הפעל קמפיין", action: "הפעל קמפיין חדש או עדכן חשיפה; הנכס מאבד תשומת לב.", impact: "החזרת עניין קונים למודעה.", href: s.propertyId ? `/properties/${s.propertyId}` : sellerHref };
  }
  // Overdue follow-up, otherwise healthy → schedule a check-in.
  if (f.commGap) {
    return { title: "קבע עדכון למוכר", action: "תזמן שיחת עדכון קצרה; המוכר לא עודכן זמן מה.", impact: "שמירה על שביעות רצון ואמון.", href: sellerHref };
  }
  return { title: "המשך ניהול המכירה", action: "שמור על מומנטום — עדכן מוכר והבא קונים תואמים.", impact: "שמירה על התקדמות בריאה.", href: sellerHref };
}

/** Rank sellers by business impact: sufficient first, then confidence, then churn. */
export function rankSellers(list: SellerSignals[]): Recommendation[] {
  const churn = new Map(list.map((s) => [s.sellerId, s.churnRisk ?? 0]));
  return list
    .map(scoreSeller)
    .sort((a, b) => {
      if (a.insufficientEvidence !== b.insufficientEvidence) return a.insufficientEvidence ? 1 : -1;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return (churn.get(b.entityId) ?? 0) - (churn.get(a.entityId) ?? 0);
    });
}
