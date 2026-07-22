// ============================================================================
// 👤 ZONO OS 2.0 — STAGE 6 · Batch 6.1 · BROKER WORKSPACE — types.
//
// The Broker Workspace is the broker's default home screen. It introduces NO
// business logic: it is COMPOSITION ONLY over broker-scoped canonical providers
// (getDailyOS — which hard-scopes to the signed-in broker via owner_id — and
// getJourneyCenter({owner})). These are view-models carrying NO new numbers,
// no new priorities, no new confidence: every value is inherited verbatim.
//
// Broker isolation is structural: the office-wide slices of Daily OS
// (actionFeed / sinceYouWereAway) are NEVER surfaced raw — Today's Priorities
// filters the canonical queue to the broker's OWN entities, and no manager /
// office-wide field is read.
// ============================================================================

/** Stable identity of every broker card (QA + telemetry). */
export type BrokerCardId =
  | "todays_priorities" | "morning_brief" | "quick_actions"
  | "journey_summary" | "opportunities" | "buyers" | "sellers"
  | "calendar" | "recent_activity" | "coverage" | "performance";

/** Which canonical, broker-scoped provider each card composes — audited. */
export const BROKER_CARD_SOURCE: Record<BrokerCardId, string> = {
  todays_priorities: "getDailyOS.actionFeed ∩ own entities (Broker Intelligence queue, broker-scoped)",
  morning_brief: "compose(getDailyOS.briefing, broker priorities, getJourneyCenter({owner}))",
  quick_actions: "getDailyOS.approvals (existing approval-gated actions)",
  journey_summary: "getJourneyCenter({owner}).kpis",
  opportunities: "getDailyOS.territory.opportunities",
  buyers: "getDailyOS.deals.hotBuyers",
  sellers: "getDailyOS.deals.sellersAtRisk",
  calendar: "getDailyOS.timeline (meetings/suggested)",
  recent_activity: "getDailyOS.deals (own entities by lastActivityAt)",
  coverage: "getJourneyCenter({owner}).kpis (canonical vs fallback records)",
  performance: "getDailyOS.performance (existing broker metrics)",
};

/** One line of the broker Morning Brief. `text` is VERBATIM from a broker-scoped
 *  provider — the workspace never generates prose or conclusions. */
export interface BrokerBriefPoint {
  source: "daily" | "priorities" | "journey";
  label: string;        // UI chrome only (section label), never a business fact
  text: string;         // inherited verbatim from the upstream broker-scoped provider
  href: string | null;
}

/** The composed broker Morning Brief — assembled ONLY from already-fetched facts. */
export interface BrokerMorningBrief {
  points: BrokerBriefPoint[];
  empty: boolean;
}

/** Broker journey coverage — inherited CANONICAL-vs-FALLBACK record counts from
 *  the broker-scoped Journey Center KPIs. No formula is invented here. */
export interface BrokerCoverage {
  canonicalRecords: number;
  fallbackRecords: number;
  total: number;
  /** Percentage ONLY when total > 0 — a display of the inherited counts, not a
   *  new score (canonical ÷ total, the standing definition of evidence coverage). */
  value: number | null;
}
