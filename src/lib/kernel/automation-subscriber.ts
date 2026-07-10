// ============================================================================
// ⚙️ ZONO OS 2.0 — Stage 3 · Event Kernel · Automation subscriber (PURE).
// A consumer of the domain_events outbox that CLASSIFIES each business event
// into the downstream automation it should trigger — WITHOUT building a new
// engine and WITHOUT executing anything. It maps a kernel event to:
//   • a journey-automation TriggerType (the existing event-driven workflow
//     dispatcher: journey-automation/orchestrator.dispatchForOrg), and/or
//   • an Approval-Bundle candidate type (the existing STATELESS approval inbox:
//     approval-bundle/buildBundleForEvent → getInboxBundles).
// Approval bundles are recomputed on read, so once an event has been processed
// the candidate simply appears in the broker's inbox — nothing auto-executes.
// PART-2 rule honored: never execute immediately; approval-required only.
// Pure + deterministic + offline-testable. Empty intent (null) = no automation.
// ============================================================================
import type { DomainEventLike } from "./subscriber";

/** What an event should trigger downstream (classification only — no execution). */
export interface AutomationIntent {
  /** Existing journey-automation TriggerType, or null when none applies. */
  journeyTrigger: string | null;
  /** Existing Approval-Bundle candidate type, or null when none applies. */
  bundleEventType: string | null;
  /** Always true for Stage 3 — automation never auto-executes; a human approves. */
  requiresApproval: boolean;
  entityType: string;
  entityId: string;
  /** Idempotency key for any downstream dispatch (the domain event id). */
  dedupKey: string;
}

interface Mapping { journeyTrigger?: string; bundleEventType?: string }

// Kernel event_type → (journey TriggerType, Approval-Bundle candidate type).
// Only events with a real downstream automation appear here; the rest are
// timeline/notification-only and return null (honest — no fabricated trigger).
const MAP: Record<string, Mapping> = {
  "buyer.created":              { bundleEventType: "new_buyer" },
  "seller.created":             { bundleEventType: "new_seller" },
  "lead.created":               { bundleEventType: "new_lead" },
  "property.created":           { journeyTrigger: "property_created", bundleEventType: "new_property" },
  "property.updated":           { journeyTrigger: "property_updated" },
  "property.price_changed":     { journeyTrigger: "price_drop", bundleEventType: "price_opportunity" },
  "external_listing.promoted":  { bundleEventType: "external_listing" },
  "external_listing.returned":  { journeyTrigger: "back_on_market" },
  "seller.risk_changed":        { bundleEventType: "seller_at_risk" },
  "meeting.completed":          { journeyTrigger: "meeting_completed", bundleEventType: "meeting_completed" },
  "deal.stage_changed":         { journeyTrigger: "deal_stage_changed" },
  "automation.run_completed":   { bundleEventType: "workflow_completed" },
};

/**
 * Classify a domain event into its downstream automation intent, or null when
 * the event triggers no automation. Deterministic: same input → same output.
 */
export function projectEventToAutomation(evt: DomainEventLike): AutomationIntent | null {
  if (!evt.id || !evt.organization_id || !evt.entity_type || !evt.entity_id) return null;
  const m = MAP[evt.event_type];
  if (!m || (!m.journeyTrigger && !m.bundleEventType)) return null;
  return {
    journeyTrigger: m.journeyTrigger ?? null,
    bundleEventType: m.bundleEventType ?? null,
    requiresApproval: true,
    entityType: evt.entity_type,
    entityId: evt.entity_id,
    dedupKey: evt.id,
  };
}
