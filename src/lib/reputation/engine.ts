// ============================================================================
// ZONO — Review, Referral & Reputation Intelligence OS · Pure engine
// ----------------------------------------------------------------------------
// Deterministic, client-safe. Computes advocate score + level, deal-closure
// probabilities (satisfaction/review/referral/advocate), geo reputation scores,
// review/referral opportunity detection, and the reputation signals that feed
// the Decision Brain. No I/O, no LLM.
// ============================================================================

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

// ── advocate score + level ────────────────────────────────────────────────────
export interface AdvocateInputs {
  dealsCompleted: number; reviewsCount: number; referralsCount: number;
  repeatBusiness: boolean; relationshipStrength?: number | null; satisfaction?: number | null; portalEngagement?: number | null;
}
export type AdvocateLevel = "none" | "bronze" | "silver" | "gold" | "ambassador" | "elite_ambassador";

export function computeAdvocateScore(i: AdvocateInputs): { score: number; level: AdvocateLevel } {
  const deals = Math.min(1, i.dealsCompleted / 3);            // up to 3 deals saturates
  const reviews = Math.min(1, i.reviewsCount / 2);
  const referrals = Math.min(1, i.referralsCount / 3);
  const satisfaction = (i.satisfaction ?? 60) / 100;
  const relationship = (i.relationshipStrength ?? 50) / 100;
  const repeat = i.repeatBusiness ? 1 : 0;
  const engagement = (i.portalEngagement ?? 40) / 100;

  const score = clamp(
    deals * 25 + satisfaction * 20 + referrals * 20 + reviews * 15 + repeat * 10 +
    relationship * 7 + engagement * 3);

  let level: AdvocateLevel = "none";
  if (score >= 95) level = "elite_ambassador";
  else if (score >= 85) level = "ambassador";
  else if (score >= 70) level = "gold";
  else if (score >= 50) level = "silver";
  else if (score >= 30) level = "bronze";
  return { score, level };
}

export const LEVEL_LABELS: Record<string, string> = {
  none: "—", bronze: "תומך ארד", silver: "תומך כסף", gold: "תומך זהב", ambassador: "שגריר", elite_ambassador: "שגריר עילית",
};
export const LEVEL_TONE: Record<string, string> = {
  none: "bg-surface text-muted", bronze: "bg-warning-soft text-warning", silver: "bg-surface text-ink",
  gold: "bg-brand-soft text-brand-strong", ambassador: "bg-success-soft text-success", elite_ambassador: "bg-success-soft text-success",
};
export const SENTIMENT_LABELS: Record<string, string> = { positive: "חיובי", neutral: "ניטרלי", negative: "שלילי" };

// ── deal-closure probabilities (on a won deal) ────────────────────────────────
export interface ClosureInputs {
  dealValue?: number | null; relationshipStrength?: number | null; commHealth?: number | null;
  priorReviews?: number; priorReferrals?: number; repeatClient?: boolean;
}
export interface ClosureProbabilities { satisfaction: number; review: number; referral: number; advocate: number }
export function closureProbabilities(i: ClosureInputs): ClosureProbabilities {
  const rel = (i.relationshipStrength ?? 55) / 100;
  const comm = (i.commHealth ?? 55) / 100;
  const valueBoost = i.dealValue && i.dealValue > 2_000_000 ? 0.1 : 0;
  const satisfaction = clamp((rel * 0.5 + comm * 0.5 + valueBoost) * 100);
  const review = clamp(satisfaction * 0.8 + (i.priorReviews ? 10 : 0));
  const referral = clamp(satisfaction * 0.65 + (i.priorReferrals ? 15 : 0) + (i.repeatClient ? 10 : 0));
  const advocate = clamp(satisfaction * 0.5 + referral * 0.3 + (i.repeatClient ? 15 : 0));
  return { satisfaction, review, referral, advocate };
}

// ── geo reputation scores ──────────────────────────────────────────────────────
export interface ReputationInputs { reviewCount: number; avgRating: number; referralCount: number; convertedReferrals: number }
export interface ReputationScores { reviewScore: number; referralScore: number; influenceScore: number; trustScore: number }
export function computeReputation(i: ReputationInputs): ReputationScores {
  const reviewScore = clamp(i.avgRating > 0 ? (i.avgRating / 5) * 100 * Math.min(1, 0.4 + i.reviewCount / 10) : 0);
  const referralScore = clamp(Math.min(1, i.referralCount / 5) * 70 + Math.min(1, i.convertedReferrals / 3) * 30);
  const influenceScore = clamp(reviewScore * 0.4 + referralScore * 0.6);
  const trustScore = clamp(reviewScore * 0.5 + referralScore * 0.3 + influenceScore * 0.2);
  return { reviewScore, referralScore, influenceScore, trustScore };
}

// ── opportunity detection ──────────────────────────────────────────────────────
export interface DealOutcomeLike { won: boolean; hasReview: boolean; satisfaction: number; relationshipStrength?: number | null }
export function detectReviewOpportunity(d: DealOutcomeLike): boolean {
  return d.won && !d.hasReview && d.satisfaction >= 60;
}
export function detectReferralOpportunity(advocateScore: number, recentReferral: boolean): boolean {
  return advocateScore >= 60 && !recentReferral;
}

// ── reputation signal derivation (pure) ───────────────────────────────────────
export interface ReputationSignalSpec { signal_type: string; score: number; title: string; reason: string; recommended_action: string }
export function deriveAdvocateSignals(clientName: string, score: number, level: AdvocateLevel, referralRevenue: number, recentReferral: boolean): ReputationSignalSpec[] {
  const out: ReputationSignalSpec[] = [];
  if (level === "ambassador" || level === "elite_ambassador" || score >= 85) {
    out.push({ signal_type: "ambassador_candidate", score: 86, title: `מועמד לשגריר — ${clientName}`, reason: "ציון תומך גבוה מאוד — לקוח שמייצר מוניטין ועסקים", recommended_action: "צרף לתוכנית שגרירים ובקש הפניות והמלצות" });
  }
  if (score >= 70) out.push({ signal_type: "high_influence_client", score: 80, title: `לקוח בעל השפעה גבוהה — ${clientName}`, reason: "ציון תומך גבוה — פוטנציאל הפניות משמעותי", recommended_action: "שמר על קשר הדוק ובקש הפניה" });
  if (score >= 60 && !recentReferral) out.push({ signal_type: "referral_opportunity", score: 74, title: `הזדמנות הפניה — ${clientName}`, reason: "לקוח מרוצה ללא הפניה אחרונה", recommended_action: "בקש הפניה בזמן הנכון" });
  if (referralRevenue > 0) out.push({ signal_type: "referral_revenue", score: 70, title: `הכנסה מהפניות — ${clientName}`, reason: `הפניות מלקוח זה הניבו ${referralRevenue.toLocaleString("he-IL")} ₪`, recommended_action: "תגמל/חזק את הקשר לשימור מקור ההכנסה" });
  return out;
}

export const SCOPE_LABELS: Record<string, string> = {
  neighborhood: "שכונה", street: "רחוב", building: "בניין", office: "משרד", agent: "סוכן",
};
export const REVIEW_SOURCE_LABELS: Record<string, string> = {
  manual: "ידני", portal: "פורטל", website: "אתר", google: "Google", whatsapp: "וואטסאפ", referral: "הפניה",
};
