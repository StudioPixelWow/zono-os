// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.2 · Journey subscriber (PURE).
//
// The 8th consumer of the domain_events outbox. Projects a business event into
// zero or more CANONICAL journey intents, expressed in the Batch 5.1 stage
// vocabulary (src/lib/journey-canonical). Pure + offline-testable: it decides
// WHAT should happen; journey-applier.ts (server) performs it through
// buildTransition() and the DB constraints. No parallel journey system.
//
// Two rules dominate this file:
//   1. EVIDENCE ONLY. A stage is asserted only when the event actually carries
//      the fact. Anything else is an honest `skip` with a reason — never a guess.
//   2. NO RECURSION. journey.* events are the subscriber's OWN output; feeding
//      them back in would loop forever. They are skipped first, before anything.
// ============================================================================
import type { DomainEventLike } from "./subscriber";
import {
  isValidStage, mapLegacyStage, type JourneyEntityType, type JourneyType,
} from "@/lib/journey-canonical";

/** Why no journey work happened. Every one is recorded in the delivery ledger. */
export type JourneySkipReason =
  | "journey_event_no_recurse"
  | "missing_entity_id"
  | "unsupported_event"
  | "no_stage_evidence"
  | "missing_linked_entity"
  | "unmappable_stage";

/** One canonical journey the event wants to create or advance. */
export interface JourneyIntent {
  journeyType: JourneyType;
  entityType: JourneyEntityType;
  entityId: string;
  targetStage: string;
  /**
   * A "created" event must never DRAG AN EXISTING JOURNEY BACKWARD to its
   * initial stage (a replayed or late buyer.created must not reset a buyer who
   * is already negotiating). createOnly means: open it if absent, otherwise
   * leave it exactly where it is.
   */
  createOnly: boolean;
  ownerUserId: string | null;
  reason: string;
  evidence: Record<string, unknown>;
}

export type JourneyProjection =
  | { kind: "intents"; intents: JourneyIntent[] }
  | { kind: "skip"; reason: JourneySkipReason; detail?: string };

// ── payload helpers ─────────────────────────────────────────────────────────
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const truthy = (v: unknown): boolean => v === true || v === "true";

/** Accepts both camelCase and snake_case — emitters in ZONO use both. */
function pick(p: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) { const v = str(p[k]); if (v) return v; }
  return null;
}
function has(p: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.some((k) => p[k] !== undefined && p[k] !== null && p[k] !== "");
}

/** journey.* is this subscriber's own output — never re-enter the machine. */
export function isJourneyEvent(eventType: string): boolean {
  return eventType.startsWith("journey.");
}

/**
 * Project a domain event into canonical journey intents.
 * Deterministic and side-effect free.
 */
export function projectEventToJourney(evt: DomainEventLike): JourneyProjection {
  // 1. RECURSION GUARD — must come first.
  if (isJourneyEvent(evt.event_type)) {
    return { kind: "skip", reason: "journey_event_no_recurse" };
  }
  if (!evt.entity_id) return { kind: "skip", reason: "missing_entity_id" };

  const p = (evt.payload ?? {}) as Record<string, unknown>;
  const owner = pick(p, "ownerId", "owner_id", "assignedTo", "owner_user_id") ?? evt.actor_user_id;
  const out: JourneyIntent[] = [];

  const add = (
    journeyType: JourneyType,
    entityId: string,
    targetStage: string,
    reason: string,
    evidence: Record<string, unknown>,
    createOnly = false,
  ) => {
    // A stage the machine does not know is a bug, not a transition.
    if (!isValidStage(journeyType, targetStage)) return;
    out.push({
      journeyType, entityType: journeyType as JourneyEntityType, entityId,
      targetStage, createOnly, ownerUserId: owner, reason, evidence,
    });
  };

  const e = evt.entity_id;

  switch (evt.event_type) {
    // ── CREATION ────────────────────────────────────────────────────────────
    case "buyer.created":
      add("buyer", e, "new", "buyer.created", { source: "buyer.created" }, true);
      break;
    case "seller.created":
      add("seller", e, "new", "seller.created", { source: "seller.created" }, true);
      break;
    case "lead.created":
      add("lead", e, "new", "lead.created", { source: "lead.created" }, true);
      break;
    case "deal.created": {
      add("deal", e, "initiated", "deal.created", { source: "deal.created" }, true);
      // A deal is hard evidence for every party it names.
      const buyerId = pick(p, "buyerId", "buyer_id");
      const sellerId = pick(p, "sellerId", "seller_id");
      const propertyId = pick(p, "propertyId", "property_id");
      if (buyerId) add("buyer", buyerId, "deal", "deal.created", { dealId: e });
      if (sellerId) add("seller", sellerId, "deal", "deal.created", { dealId: e });
      if (propertyId) add("property", propertyId, "negotiation", "deal.created", { dealId: e });
      break;
    }
    case "property.created": {
      // Open at the stage the property REALLY is, not a hardcoded guess.
      const status = pick(p, "status");
      const mapped = status ? mapLegacyStage("property", status) : null;
      const stage = mapped && !mapped.ambiguous ? mapped.canonical : "draft";
      add("property", e, stage, "property.created", { status: status ?? null, stage }, true);
      break;
    }

    // ── BUYER ADVANCEMENT (evidence-driven) ─────────────────────────────────
    case "buyer.updated": {
      // Financing beats qualification: a pre-approved buyer is past qualifying.
      if (truthy(p.preapproved) || has(p, "financing", "mortgage", "preapproval")) {
        add("buyer", e, "financing", "buyer.updated:financing_evidence", { fields: ["financing"] });
      } else if (has(p, "budget", "preferred_area", "preferredArea", "must_have", "mustHave")) {
        add("buyer", e, "qualification", "buyer.updated:qualification_evidence", {
          fields: Object.keys(p).filter((k) => ["budget", "preferred_area", "preferredArea", "must_have", "mustHave"].includes(k)),
        });
      } else {
        return { kind: "skip", reason: "no_stage_evidence", detail: "buyer.updated carried no qualification/financing fact" };
      }
      break;
    }
    case "buyer.stage_changed": {
      const raw = pick(p, "stage", "toStage", "to_stage");
      if (!raw) return { kind: "skip", reason: "no_stage_evidence" };
      const target = isValidStage("buyer", raw) ? raw : mapLegacyStage("buyer", raw)?.canonical ?? null;
      if (!target) return { kind: "skip", reason: "unmappable_stage", detail: raw };
      add("buyer", e, target, "buyer.stage_changed", { raw, target });
      break;
    }

    // ── SELLER ──────────────────────────────────────────────────────────────
    case "seller.linked_to_property": {
      // IDENTITY (fixed in 5.3 — the mapping was INVERTED against the emitter).
      // sellers/actions.ts emits this with entityType "property":
      //     entity_id = the PROPERTY, payload = { sellerId, propertyId }
      // This case used to read `payload.propertyId` (which the create-flow emitter
      // never sent → guaranteed `missing_linked_entity` skip) and then keyed the
      // SELLER journey on `evt.entity_id` — i.e. on the PROPERTY's id. Same family
      // of bug as the deal dual identity. A seller could therefore never reach
      // `representation`, and if it had, it would have been the wrong journey.
      const sellerId = pick(p, "sellerId", "seller_id");
      const propertyId = pick(p, "propertyId", "property_id") ?? e;   // e IS the property
      if (!sellerId) return { kind: "skip", reason: "missing_linked_entity", detail: "no sellerId on seller.linked_to_property" };
      // Linking a seller to a property IS the representation fact.
      add("seller", sellerId, "representation", "seller.linked_to_property", { propertyId });
      break;
    }
    case "seller.risk_changed": {
      // Modelled because the event type exists — but note honestly: nothing in
      // ZONO emits it today (seller risk is computed-on-read, see STAB-2). It
      // therefore never fires; it is NOT manufactured from a computed value.
      add("seller", e, "churn_risk", "seller.risk_changed", { risk: p.risk ?? null });
      break;
    }

    // ── LEAD ────────────────────────────────────────────────────────────────
    case "lead.stage_changed": {
      const raw = pick(p, "stage", "toStage", "to_stage");
      if (!raw) return { kind: "skip", reason: "no_stage_evidence" };
      if (!isValidStage("lead", raw)) return { kind: "skip", reason: "unmappable_stage", detail: raw };
      add("lead", e, raw, "lead.stage_changed", { stage: raw });
      break;
    }
    case "lead.converted_to_buyer": {
      add("lead", e, "converted", "lead.converted_to_buyer", { source: "conversion" });
      const buyerId = pick(p, "buyerId", "buyer_id");
      if (buyerId) add("buyer", buyerId, "new", "lead.converted_to_buyer", { fromLead: e }, true);
      break;
    }
    case "lead.converted_to_seller": {
      add("lead", e, "converted", "lead.converted_to_seller", { source: "conversion" });
      const sellerId = pick(p, "sellerId", "seller_id");
      if (sellerId) add("seller", sellerId, "new", "lead.converted_to_seller", { fromLead: e }, true);
      break;
    }

    // ── PROPERTY ────────────────────────────────────────────────────────────
    case "property.published": {
      add("property", e, "active", "property.published", { source: "publish" });
      const sellerId = pick(p, "sellerId", "seller_id");
      if (sellerId) add("seller", sellerId, "marketing", "property.published", { propertyId: e });
      break;
    }
    case "property.status_changed": {
      const raw = pick(p, "status");
      if (!raw) return { kind: "skip", reason: "no_stage_evidence" };
      const m = mapLegacyStage("property", raw);
      // `closed` is ambiguous (sold vs rented vs archived) — the event alone
      // cannot say which, so we refuse to guess.
      if (!m) return { kind: "skip", reason: "unmappable_stage", detail: raw };
      if (m.ambiguous) return { kind: "skip", reason: "no_stage_evidence", detail: `ambiguous legacy status '${raw}' — needs properties.status resolution (Batch 5.3)` };
      add("property", e, m.canonical, "property.status_changed", { raw, canonical: m.canonical });
      break;
    }
    case "property.sold":
      add("property", e, "sold", "property.sold", { source: "sold" });
      break;
    case "property.archived":
      add("property", e, "archived", "property.archived", { source: "archived" });
      break;

    // ── DEAL ────────────────────────────────────────────────────────────────
    case "deal.stage_changed": {
      const raw = pick(p, "stage", "toStage", "to_stage");
      if (!raw) return { kind: "skip", reason: "no_stage_evidence" };
      const target = isValidStage("deal", raw) ? raw : mapLegacyStage("deal", raw)?.canonical ?? null;
      if (!target) return { kind: "skip", reason: "unmappable_stage", detail: raw };
      add("deal", e, target, "deal.stage_changed", { raw, target });
      break;
    }
    case "deal.won": {
      add("deal", e, "won", "deal.won", { source: "won" });
      const buyerId = pick(p, "buyerId", "buyer_id");
      const sellerId = pick(p, "sellerId", "seller_id");
      const propertyId = pick(p, "propertyId", "property_id");
      if (buyerId) add("buyer", buyerId, "won", "deal.won", { dealId: e });
      if (sellerId) add("seller", sellerId, "won", "deal.won", { dealId: e });
      if (propertyId) add("property", propertyId, "sold", "deal.won", { dealId: e });
      break;
    }
    case "deal.lost":
      // Only the DEAL is lost. A buyer whose deal fell through is still a buyer —
      // auto-losing their journey would destroy a live pipeline. No fan-out.
      add("deal", e, "lost", "deal.lost", { source: "lost" });
      break;

    // ── MEETINGS (viewing evidence) ─────────────────────────────────────────
    case "meeting.created": {
      const buyerId = pick(p, "buyerId", "buyer_id");
      const leadId = pick(p, "leadId", "lead_id");
      const propertyId = pick(p, "propertyId", "property_id");
      if (buyerId && propertyId) add("buyer", buyerId, "viewing_scheduled", "meeting.created:viewing", { meetingId: e, propertyId });
      if (leadId) add("lead", leadId, "meeting_scheduled", "meeting.created", { meetingId: e });
      if (!buyerId && !leadId) return { kind: "skip", reason: "missing_linked_entity", detail: "meeting has no buyer/lead" };
      if (buyerId && !propertyId && !leadId) return { kind: "skip", reason: "no_stage_evidence", detail: "buyer meeting without property is not a viewing" };
      break;
    }
    case "meeting.completed": {
      const buyerId = pick(p, "buyerId", "buyer_id");
      const propertyId = pick(p, "propertyId", "property_id");
      if (buyerId && propertyId) add("buyer", buyerId, "viewing_completed", "meeting.completed:viewing", { meetingId: e, propertyId });
      if (propertyId) add("property", propertyId, "viewings", "meeting.completed:viewing", { meetingId: e });
      if (!buyerId && !propertyId) return { kind: "skip", reason: "missing_linked_entity", detail: "meeting has no buyer/property" };
      break;
    }

    default:
      return { kind: "skip", reason: "unsupported_event", detail: evt.event_type };
  }

  if (!out.length) return { kind: "skip", reason: "no_stage_evidence", detail: evt.event_type };
  return { kind: "intents", intents: out };
}
