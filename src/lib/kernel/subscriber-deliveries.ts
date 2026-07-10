// ============================================================================
// 📊 ZONO OS 2.0 — Stage 3 · Event Kernel · subscriber delivery ledger (server).
// Records the outcome of ONE subscriber processing ONE event into
// domain_event_deliveries. The unique (event_id, subscriber) constraint makes it
// idempotent: re-draining an event never double-records (and lets us count
// duplicates). This is the source for the PART-7 per-subscriber metrics.
// Never throws — observability must not break the drain.
// ============================================================================
import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/server";

type Db = ReturnType<typeof createServiceRoleClient>;

export type SubscriberName = "timeline" | "notification" | "automation" | "recommendation" | "graph" | "memory" | "search";
export type DeliveryStatus = "done" | "duplicate" | "failed" | "skipped";

export interface DeliveryInput {
  orgId: string;
  eventId: string;
  subscriber: SubscriberName;
  status: DeliveryStatus;
  latencyMs?: number | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
}

/** Append one delivery outcome. Idempotent (unique event_id+subscriber). */
export async function recordDelivery(db: Db, input: DeliveryInput): Promise<void> {
  try {
    await db.from("domain_event_deliveries" as never).insert({
      organization_id: input.orgId,
      event_id: input.eventId,
      subscriber: input.subscriber,
      status: input.status,
      latency_ms: input.latencyMs ?? null,
      error: input.error ? input.error.slice(0, 500) : null,
      metadata: input.metadata ?? {},
    } as never);
  } catch { /* delivery ledger is best-effort; never break the drain */ }
}
