// ============================================================================
// ZONO — recommended next action + contact-priority ranking (pure rule engine).
// No AI: every recommendation is a deterministic rule over real signals. A
// future AI Copilot may enrich the wording/strategy; the chosen action stays here.
// ============================================================================
import type {
  ContactPriorityItem,
  ExclusiveBand,
  RecommendedAction,
  RecommendedActionKind,
  SellerLifecycleStage,
  SellerProfile,
} from "./types";

export interface RecommendInput {
  exclusiveProbability: number;
  band: ExclusiveBand;
  matchingBuyerCount: number;
  priceDroppedRecently: boolean;
  hoursSinceLastContact: number | null;
  contactAttempts: number;
  hasPositiveResponse: boolean;
  lifecycleStage: SellerLifecycleStage;
}

const ACTION_LABEL: Record<RecommendedActionKind, string> = {
  call_today: "להתקשר היום",
  send_whatsapp: "לשלוח וואטסאפ",
  schedule_meeting: "לקבוע פגישה",
  follow_up_tomorrow: "מעקב מחר",
  wait: "להמתין",
};

function make(kind: RecommendedActionKind, reason: string, dueOffsetHours: number | null = null): RecommendedAction {
  return { kind, label: ACTION_LABEL[kind], reason, dueOffsetHours };
}

/** Deterministic next-best action for a seller opportunity. */
export function recommendNextAction(input: RecommendInput): RecommendedAction {
  if (input.lifecycleStage === "exclusive_signed") return make("wait", "הבלעדיות נחתמה");
  if (input.lifecycleStage === "lost" || input.lifecycleStage === "archived") return make("wait", "ההזדמנות נסגרה");

  // Positive engagement → push to a meeting.
  if (input.hasPositiveResponse || input.lifecycleStage === "negotiating") {
    return make("schedule_meeting", "הבעלים הגיב בחיוב — לקבוע פגישה לחתימה");
  }

  // Fresh, strong, not yet contacted → call now.
  if (input.contactAttempts === 0) {
    if (input.priceDroppedRecently && input.exclusiveProbability >= 50) return make("call_today", "ירידת מחיר טרייה — להתקשר לפני המתחרים");
    if (input.matchingBuyerCount > 0 && input.exclusiveProbability >= 50) return make("call_today", `יש ${input.matchingBuyerCount} קונים מתאימים — אפשר להבטיח עסקה`);
    if (input.band === "very_high" || input.band === "high") return make("call_today", "סבירות בלעדיות גבוהה — לפנות מיד");
    if (input.band === "medium") return make("send_whatsapp", "סבירות בינונית — לפתוח בקשר רך בוואטסאפ");
    return make("wait", "סבירות נמוכה — לעקוב בהמשך");
  }

  // Already contacted.
  if (input.priceDroppedRecently) return make("call_today", "ירד המחיר מאז הפנייה — להתקשר שוב");
  if (input.hoursSinceLastContact != null && input.hoursSinceLastContact >= 48) {
    return make("follow_up_tomorrow", "חלפו יומיים ללא מענה — מעקב", 24);
  }
  return make("wait", "נוצר קשר לאחרונה — להמתין למענה");
}

// ── Contact priority ranking ──────────────────────────────────────────────────
/**
 * Rank sellers for "Top Sellers To Contact Today". Deterministic weighted score
 * over exclusive probability, buyer matches, private, price drops, days on
 * market, freshness, urgency and prior-contact recency.
 */
export function computePriorityScore(p: SellerProfile, hoursSinceLastContact: number | null): number {
  let s = p.exclusiveProbability; // 0..100 dominant
  s += Math.min(p.buyerMatchCount, 5) * 4;
  if (p.listingType === "private") s += 10;
  s += Math.min(p.priceDropCount, 3) * 4;
  if (p.daysOnMarket != null) {
    if (p.daysOnMarket >= 60) s += 8;
    else if (p.daysOnMarket >= 30) s += 4;
    else if (p.daysOnMarket <= 3) s += 6; // fresh listing — act before brokers
  }
  if (p.exclusiveBand === "very_high") s += 6;
  // De-prioritise sellers contacted very recently (avoid spamming).
  if (hoursSinceLastContact != null && hoursSinceLastContact < 24) s -= 20;
  return Math.round(s);
}

export function rankContactPriority(
  profiles: SellerProfile[],
  hoursSinceContactByProfile: Record<string, number | null> = {},
  limit = 25,
): ContactPriorityItem[] {
  const active = profiles.filter((p) => !["exclusive_signed", "lost", "archived"].includes(p.lifecycleStage));
  return active
    .map((p) => ({
      profileId: p.id,
      marketPropertySourceId: p.marketPropertySourceId,
      addressText: p.addressText,
      city: p.city,
      exclusiveProbability: p.exclusiveProbability,
      exclusiveBand: p.exclusiveBand,
      sellerScore: p.sellerScore,
      buyerMatchCount: p.buyerMatchCount,
      recommendedAction: p.recommendedAction,
      priorityScore: computePriorityScore(p, hoursSinceContactByProfile[p.id] ?? null),
      reasonsShort: p.scoreReasons.slice(0, 3).map((r) => r.label),
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore || b.exclusiveProbability - a.exclusiveProbability)
    .slice(0, limit);
}
