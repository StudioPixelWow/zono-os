// ============================================================================
// 🧠 ZONO OS 2.0 — Stage 3 · Event Kernel · Recommendation subscriber (PURE).
// Keeps the shared Broker-Intelligence Queue, Daily OS and Executive OS
// EVENT-DRIVEN instead of polled. The queue / Daily OS / Executive are all
// LIVE-COMPUTED reads (Daily OS + Executive are compute-cached). This subscriber
// does NOT write to a parallel queue — it classifies which recommendation areas
// an event affects and whether the Daily/Executive caches must be invalidated so
// the next read recomputes. The processor performs the actual invalidateCache().
// Pure + deterministic + offline-testable. Null = event has no recommendation impact.
// ============================================================================
import type { DomainEventLike } from "./subscriber";

/** The intelligence areas a change can affect (mirrors broker-intelligence areas). */
export type RecommendationArea =
  | "acquisition" | "buyer" | "seller" | "deal" | "daily" | "office"
  // Batch 5.6E/5.6F — the canonical Journey spine is an intelligence area.
  | "journey";

export interface RecommendationRefresh {
  /** Which recommendation areas this event may change. */
  affectedAreas: RecommendationArea[];
  /** Invalidate the org's Daily OS cache (a broker-facing mission changed). */
  refreshDaily: boolean;
  /** Invalidate the org's Executive OS cache (a manager-facing figure changed). */
  refreshExecutive: boolean;
  entityType: string;
  entityId: string;
  reason: string;
}

interface Rule { areas: RecommendationArea[]; daily?: boolean; exec?: boolean; reason: string }

// Which events shift recommendations, and how far they ripple. Executive refresh
// is reserved for manager-level figures (deal outcomes, high-value moves).
const RULES: Record<string, Rule> = {
  "buyer.created":          { areas: ["buyer"], daily: true, reason: "קונה חדש — עדכון עדיפויות קונים" },
  "buyer.updated":          { areas: ["buyer"], daily: true, reason: "פרטי קונה השתנו" },
  "buyer.stage_changed":    { areas: ["buyer"], daily: true, reason: "שלב הקונה השתנה" },
  "seller.created":         { areas: ["seller"], daily: true, reason: "מוכר חדש" },
  "seller.updated":         { areas: ["seller"], daily: true, reason: "פרטי מוכר השתנו — חישוב סיכון שימור" },
  "seller.risk_changed":    { areas: ["seller"], daily: true, exec: true, reason: "סיכון שימור מוכר השתנה" },
  "lead.created":           { areas: ["buyer"], daily: true, reason: "ליד חדש" },
  "lead.converted_to_buyer":  { areas: ["buyer"], daily: true, reason: "ליד הומר לקונה" },
  "lead.converted_to_seller": { areas: ["seller"], daily: true, reason: "ליד הומר למוכר" },
  "property.created":       { areas: ["acquisition", "seller"], daily: true, reason: "נכס חדש" },
  "property.price_changed": { areas: ["acquisition", "seller"], daily: true, reason: "מחיר נכס השתנה — הזדמנות תמחור" },
  "property.status_changed":{ areas: ["seller"], daily: true, reason: "סטטוס נכס השתנה" },
  "property.sold":          { areas: ["seller", "deal"], daily: true, exec: true, reason: "נכס נמכר" },
  "external_listing.promoted": { areas: ["acquisition"], daily: true, reason: "מודעה חיצונית קודמה — המלצת שיווק הושלמה" },
  "meeting.completed":      { areas: ["buyer", "seller"], daily: true, reason: "פגישה הושלמה — עדכון עדיפות לקוח" },
  "meeting.no_show":        { areas: ["buyer", "seller"], daily: true, reason: "אי-הגעה — עדכון סיכון" },
  "deal.created":           { areas: ["deal"], daily: true, reason: "עסקה חדשה" },
  "deal.stage_changed":     { areas: ["deal"], daily: true, reason: "שלב עסקה השתנה" },
  "deal.won":               { areas: ["deal", "office"], daily: true, exec: true, reason: "עסקה נסגרה — הזדמנות הכנסה מומשה" },
  "deal.lost":              { areas: ["deal", "office"], daily: true, exec: true, reason: "עסקה אבדה" },

  // ── Batch 5.6F — canonical Journey events ────────────────────────────────
  // Scoped by what each event can actually change in the Journey engine, so a
  // low-value event never triggers a full recompute.
  //
  // `journey.created` is DELIBERATELY not a daily refresh: a brand-new journey
  // has zero proven dwell time, so it cannot produce a recommendation — the
  // 5.6E evidence gate skips it. Invalidating Daily/Home for it would recompute
  // every surface to arrive at an identical answer.
  "journey.created":        { areas: ["journey"], reason: "מסע נפתח — אין עדיין ראיית שהייה בשלב" },
  // A stage change RESETS the dwell clock, so an existing stall recommendation
  // may legitimately disappear. That changes the ranked feed → refresh Daily.
  "journey.stage_changed":  { areas: ["journey"], daily: true, reason: "המסע עבר שלב — שעון השהייה אופס" },
  // Terminal outcome: the journey leaves the eligible set entirely, and a won
  // journey is a manager-level figure.
  "journey.completed":      { areas: ["journey", "office"], daily: true, exec: true, reason: "מסע הושלם — יצא מקבוצת המסעות הפעילים" },
  // Blocked/paused/resumed/reopened flip `status`, which the engine gates on
  // (only `active` journeys are eligible). NOTE: `journey.blocked` has no
  // emitter today (journey-applier returns the outcome without emitting) — the
  // rule is registered so it works the moment that gap is closed, and costs
  // nothing until then.
  "journey.blocked":        { areas: ["journey"], daily: true, exec: true, reason: "מסע נחסם — סיכון לתקיעות" },
  "journey.paused":         { areas: ["journey"], daily: true, reason: "מסע הושהה — אינו ממתין לפעולה" },
  "journey.resumed":        { areas: ["journey"], daily: true, reason: "מסע חודש — חזר לקבוצת הפעילים" },
  "journey.reopened":       { areas: ["journey"], daily: true, reason: "מסע נפתח מחדש" },
};

/**
 * Classify how an event should refresh the recommendation/daily/executive layer,
 * or null when it has no impact. Deterministic: same input → same output.
 */
export function projectEventToRecommendationRefresh(evt: DomainEventLike): RecommendationRefresh | null {
  if (!evt.id || !evt.organization_id || !evt.entity_type || !evt.entity_id) return null;
  const rule = RULES[evt.event_type];
  if (!rule) return null;
  return {
    affectedAreas: rule.areas,
    refreshDaily: rule.daily ?? false,
    refreshExecutive: rule.exec ?? false,
    entityType: evt.entity_type,
    entityId: evt.entity_id,
    reason: rule.reason,
  };
}
