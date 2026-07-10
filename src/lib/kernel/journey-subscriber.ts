// ============================================================================
// 🧭 ZONO OS 2.0 — Stage 5A · Event Kernel · Journey subscriber (PURE).
// A fifth consumer of the domain_events outbox. Maps lifecycle events to a
// customer-journey stage transition, so `journeys` stays consistent with what
// actually happened — instead of ad-hoc journey writes scattered across flows
// (the single-source-of-truth goal). Pure + offline-testable; the processor
// applies the transition via the EXISTING journey service (ensureJourney +
// advance) — reuse, never reimplement.
//
// A transition names the journey subject (a buyer/seller/lead) and the target
// stage. Events that don't move a journey → null.
// ============================================================================
import type { DomainEventLike } from "./subscriber";

export type JourneySubjectType = "buyer" | "seller" | "lead";

/** A journey stage transition to apply via the journey service. */
export interface JourneyTransition {
  org_id: string;
  subjectType: JourneySubjectType;
  subjectId: string;
  /** Target lifecycle stage (journey service maps to its own stage model). */
  stage: string;
  /** Terminal outcome, when the event closes the journey. */
  outcome: "open" | "won" | "lost" | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Project a domain event into a journey transition, or null.
 * Deterministic. The subject is resolved from the entity or payload so a deal
 * event advances the buyer/seller journey it belongs to.
 */
export function projectEventToJourneyTransition(evt: DomainEventLike): JourneyTransition | null {
  const org = evt.organization_id;
  if (!org || !evt.entity_id) return null;
  const p = evt.payload ?? {};
  const t = (subjectType: JourneySubjectType, subjectId: string, stage: string, outcome: JourneyTransition["outcome"]): JourneyTransition =>
    ({ org_id: org, subjectType, subjectId, stage, outcome });

  switch (evt.event_type) {
    // A new lead opens a journey.
    case "lead.created":
      return t("lead", evt.entity_id, "new", "open");

    // Buyer lifecycle moves sync the buyer journey.
    case "buyer.created":
      return t("buyer", evt.entity_id, "new", "open");
    case "buyer.stage_changed": {
      const stage = str(p.stage) ?? str(p.toStage);
      return stage ? t("buyer", evt.entity_id, stage, "open") : null;
    }

    // Seller lifecycle.
    case "seller.created":
      return t("seller", evt.entity_id, "new", "open");

    // A deal advances the buyer's journey (buyer-side is the primary subject).
    case "deal.created": {
      const buyerId = str(p.buyerId) ?? str(p.buyer_id);
      return buyerId ? t("buyer", buyerId, "in_deal", "open") : null;
    }
    case "deal.won": {
      const buyerId = str(p.buyerId) ?? str(p.buyer_id);
      return buyerId ? t("buyer", buyerId, "closed_won", "won") : null;
    }
    case "deal.lost": {
      const buyerId = str(p.buyerId) ?? str(p.buyer_id);
      return buyerId ? t("buyer", buyerId, "closed_lost", "lost") : null;
    }

    default:
      return null;
  }
}
