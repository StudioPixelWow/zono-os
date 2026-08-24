// ============================================================================
// ZONO 9.3 — SILENT LEAD-INTAKE OBSERVABILITY (server-only, canonical).
// A thin boundary over the EXISTING lead writers + kernel emit — NOT a second lead
// engine. It exists so every public/external lead intake either produces exactly one
// correctly-attributed canonical lead + its downstream event, OR fails VISIBLY:
//   • emitLeadCreatedObserved — emit lead.created with the trusted server-resolved
//     org (a public path has no session, so WITHOUT an explicit org the emit silently
//     returns ok:false and the whole downstream pipeline is skipped) + an idempotency
//     key (a retry never double-fires downstream); it INSPECTS the result and records
//     a real failure — never ignores ok:false.
//   • recordLeadIntakeFailure — writes the operator's evidence to the canonical
//     audit_log (category "system"), service-role + EXPLICIT org (public → no session),
//     with a SANITIZED error category and safe identifiers only (never SQL/PII/UUID to
//     the customer). Best-effort; never throws; never blocks the underlying request.
// Customer-facing copy is Hebrew-safe (§10) — success + one retryable message.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { emitBusinessEvent, DOMAIN_EVENTS } from "@/lib/kernel";
import type { EmitResult } from "@/lib/kernel";
import { classifyLeadError, LEAD_INTAKE_OK, LEAD_INTAKE_RETRY } from "./rules";

// Re-export the pure customer-facing copy + classifier so callers have one import.
export { classifyLeadError, LEAD_INTAKE_OK, LEAD_INTAKE_RETRY };

export type LeadIntakeStage = "crm_write" | "mirror_write" | "event_emit";

/**
 * Record a lead-intake failure to audit_log (category "system"), so an operator can
 * answer: which org, source, form/path, when (created_at), which lead (if known),
 * did the primary write succeed, was the event emitted, is it retryable, and a
 * sanitized error category. Best-effort; never throws.
 */
export async function recordLeadIntakeFailure(f: {
  orgId: string;
  source: string;
  sourceSection?: string | null;
  stage: LeadIntakeStage;
  leadId?: string | null;
  retryable: boolean;
  error?: unknown;
  primaryWriteOk?: boolean;
  eventEmitted?: boolean;
}): Promise<void> {
  const errorCategory = classifyLeadError(f.error);
  try {
    const db = createServiceRoleClient();
    await db.from("audit_log" as never).insert({
      organization_id: f.orgId, actor_id: null, actor_name: "public lead intake",
      action: `lead_intake.${f.stage}_failed`, category: "system",
      entity_type: "lead", entity_id: f.leadId ?? null,
      summary: `כשל בקליטת ליד (${f.source}${f.sourceSection ? " · " + f.sourceSection : ""})`,
      metadata: {
        source: f.source, sourceSection: f.sourceSection ?? null, stage: f.stage,
        retryable: f.retryable, errorCategory,
        primaryWriteOk: f.primaryWriteOk ?? null, eventEmitted: f.eventEmitted ?? null,
      } as never,
    } as never);
  } catch (e) {
    // The audit sink itself failed — the structured log is the last-resort record.
    console.error(`[lead-intake] failure-audit write failed (${f.source}/${f.stage}):`, e);
  }
  console.error(`[lead-intake] ${f.stage} failed`, {
    source: f.source, org: f.orgId, section: f.sourceSection ?? null,
    leadId: f.leadId ?? null, category: errorCategory, retryable: f.retryable,
  });
}

/**
 * Emit lead.created the OBSERVED way. Passes the TRUSTED server-resolved org (so the
 * event actually persists for an unauthenticated public path) and an idempotency key
 * (so a retry never double-fires downstream). Inspects the result — a real failure
 * (ok:false and not a dedupe) is recorded to audit_log. Returns the EmitResult so the
 * caller can react; NEVER throws.
 */
export async function emitLeadCreatedObserved(e: {
  orgId: string;
  leadId: string;
  source: string;
  sourceSection?: string | null;
  actorUserId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<EmitResult> {
  let res: EmitResult;
  try {
    res = await emitBusinessEvent({
      type: DOMAIN_EVENTS.leadCreated, entityType: "lead", entityId: e.leadId,
      orgId: e.orgId, actorUserId: e.actorUserId ?? null,
      idempotencyKey: `lead.created:${e.leadId}`,
      payload: { source: e.source, ...(e.sourceSection ? { sourceSection: e.sourceSection } : {}), ...(e.payload ?? {}) },
    });
  } catch (err) {
    res = { ok: false, error: err instanceof Error ? err.message : "emit threw" };
  }
  if (!res.ok && !res.deduped) {
    await recordLeadIntakeFailure({
      orgId: e.orgId, source: e.source, sourceSection: e.sourceSection ?? null,
      stage: "event_emit", leadId: e.leadId, retryable: true, error: res.error,
      primaryWriteOk: true, eventEmitted: false,
    });
  }
  return res;
}
