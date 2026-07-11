// ============================================================================
// 🧠 ZONO OS 2.0 — Stage 1 · Event Kernel · emitBusinessEvent (server-only).
// The single entry point every command uses AFTER its transactional write to
// publish a durable domain event. Persists to the append-only domain_events
// store (the propagation backbone). Best-effort by contract: it NEVER throws to
// its caller, so adding emission to a flow can't break that flow. Subscribers
// (timeline / automation / notifications / search / graph / memory) are wired
// in later stages; today the event is durably stored (status 'pending') ready
// for those subscribers + the outbox worker.
// ============================================================================
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { DomainEventType, DomainEntityType } from "./events";

export interface EmitEventInput {
  type: DomainEventType;
  entityType: DomainEntityType;
  entityId: string;
  version?: number;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  correlationId?: string | null;
  causationId?: string | null;
  /** When set, the (org, key) pair is unique — re-emits with the same key are deduped. */
  idempotencyKey?: string | null;
  occurredAt?: string;
  /** Override org/actor (e.g. service-role / webhook contexts without a session). */
  orgId?: string;
  actorUserId?: string | null;
}

export interface EmitResult { ok: boolean; id?: string; deduped?: boolean; error?: string }

/** Publish a durable domain event. Never throws — returns a structured result. */
export async function emitBusinessEvent(input: EmitEventInput): Promise<EmitResult> {
  try {
    let orgId = input.orgId ?? null;
    let actorId = input.actorUserId ?? null;
    // Explicit orgId ⇒ service-role / webhook / background context (no request
    // cookies). Session-derived orgId ⇒ request context (insert under the broker's
    // RLS). Using the cookie client in a background context throws "cookies outside
    // request scope", so pick the client to match the context.
    const serviceContext = !!input.orgId;
    if (!orgId) {
      const { user, profile } = await getSessionContext();
      orgId = profile?.org_id ?? null;
      if (actorId === null) actorId = user?.id ?? null;
    }
    if (!orgId) return { ok: false, error: "no org context" };
    if (!input.entityId) return { ok: false, error: "missing entityId" };

    const db = serviceContext ? createServiceRoleClient() : await createClient();
    const row = {
      event_type: input.type,
      event_version: input.version ?? 1,
      organization_id: orgId,
      actor_user_id: actorId,
      entity_type: input.entityType,
      entity_id: String(input.entityId),
      correlation_id: input.correlationId ?? null,
      causation_id: input.causationId ?? null,
      payload: (input.payload ?? {}) as never,
      metadata: (input.metadata ?? {}) as never,
      idempotency_key: input.idempotencyKey ?? null,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      processing_status: "pending",
    };

    // Idempotent insert: on a duplicate (org, idempotency_key) the row already
    // exists — treat as a successful no-op rather than an error.
    // Table name cast: the generated Supabase types regenerate from the applied
    // schema; `domain_events` is added by 20260919120000 and typed post-apply.
    const { data, error } = await db.from("domain_events" as never).insert(row as never).select("id").maybeSingle();
    if (error) {
      if (input.idempotencyKey && /duplicate key|unique/i.test(error.message)) return { ok: true, deduped: true };
      return { ok: false, error: error.message };
    }
    return { ok: true, id: (data as { id: string } | null)?.id };
  } catch (e) {
    console.error("[kernel] emitBusinessEvent failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "emit failed" };
  }
}
