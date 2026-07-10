// ============================================================================
// 🧠 ZONO OS 2.0 — Stage 4B · Event Kernel · Org-Memory subscriber (PURE).
// A fourth consumer of the domain_events outbox. Selects the MILESTONE events
// worth remembering long-term and shapes a durable org-memory row, so Ask ZONO
// and the executive memory reflect what happened without a batch harvest. Pure +
// offline-testable; the processor inserts the returned row into
// `zono_org_memory_events` (columns match). Best-effort, event-driven.
//
// Only milestones are remembered (won/lost deals, sold properties, conversions,
// completed meetings, signed documents) — routine updates stay in the timeline.
// ============================================================================
import type { DomainEventLike } from "./subscriber";

/** A ready-to-insert zono_org_memory_events row (columns match the table). */
export interface MemoryEventUpsert {
  org_id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;   // reuse the domain event_type
  title: string;        // Hebrew, human milestone line
  impact: "positive" | "negative" | "neutral";
  source_module: string;
  occurred_at: string;
}

interface Rule { title: string; impact: MemoryEventUpsert["impact"] }

const MILESTONES: Record<string, Rule> = {
  "deal.won":            { title: "עסקה נסגרה בהצלחה", impact: "positive" },
  "deal.lost":           { title: "עסקה אבדה", impact: "negative" },
  "property.sold":       { title: "נכס נמכר", impact: "positive" },
  "lead.converted_to_buyer":  { title: "ליד הומר לקונה", impact: "positive" },
  "lead.converted_to_seller": { title: "ליד הומר למוכר", impact: "positive" },
  "meeting.completed":   { title: "פגישה הושלמה", impact: "positive" },
  "meeting.no_show":     { title: "אי-הגעה לפגישה", impact: "negative" },
  "document.signed":     { title: "מסמך נחתם", impact: "positive" },
  "document.completed":  { title: "מסמך הושלם", impact: "positive" },
};

/**
 * Project a domain event into a durable org-memory row, or null if it isn't a
 * milestone. Deterministic; only real events are remembered.
 */
export function projectEventToMemory(evt: DomainEventLike): MemoryEventUpsert | null {
  if (!evt.organization_id || !evt.entity_id || !evt.entity_type) return null;
  const rule = MILESTONES[evt.event_type];
  if (!rule) return null;
  return {
    org_id: evt.organization_id,
    entity_type: evt.entity_type,
    entity_id: evt.entity_id,
    event_type: evt.event_type,
    title: rule.title,
    impact: rule.impact,
    source_module: "kernel",
    occurred_at: evt.occurred_at,
  };
}
