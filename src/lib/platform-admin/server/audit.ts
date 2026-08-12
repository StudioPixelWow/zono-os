// ============================================================================
// ZONO — PLATFORM ADMIN audit writer (server-only). P5.0.
// ----------------------------------------------------------------------------
// THE single writer for platform-level audit events. Writes to the existing
// `platform_audit_log` table (org_id made nullable additively so platform-scoped
// events with no single org can be recorded). Service-role insert; best-effort
// (never blocks the caller). NEVER logs secrets/tokens/credentials — only the
// explicit, safe fields passed in are stored, and `metadata` goes into the
// `new_values` jsonb column verbatim, so callers must pass only safe values.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import type { PlatformOperator, PlatformCapability } from "../capabilities";

export interface PlatformAuditEvent {
  operator: PlatformOperator;
  capability: PlatformCapability;
  /** Short verb.noun, e.g. "customers.list", "customers.read", "users.list". */
  action: string;
  /** Requested target org (null/omit for platform-wide events). */
  targetOrgId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  /** Required for sensitive/impersonation actions; stored under new_values.reason. */
  reason?: string | null;
  correlationId?: string | null;
  /** ONLY safe, non-secret fields (e.g. counts, filters). Stored in new_values. */
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Record a platform audit event. Fail-open for the CALLER (never throws), but
 * fail-closed for security (writes nothing if the service role is unavailable).
 */
export async function writePlatformAudit(e: PlatformAuditEvent): Promise<void> {
  if (!isServiceRoleConfigured()) return;
  try {
    const db = createServiceRoleClient();
    const newValues: Record<string, unknown> = { capability: e.capability, ...(e.metadata ?? {}) };
    if (e.reason) newValues.reason = e.reason;
    await db.from("platform_audit_log" as never).insert({
      org_id: e.targetOrgId ?? null,
      actor_id: e.operator.userId,
      actor_label: `platform:${e.operator.role}`,
      action: e.action,
      // resource_type is NOT NULL on platform_audit_log — never pass null.
      resource_type: e.resourceType ?? "platform",
      resource_id: e.resourceId ?? null,
      source: "platform_admin",
      new_values: newValues,
      correlation_id: e.correlationId ?? null,
    } as never);
  } catch {
    // Audit is best-effort for availability; a failed audit must not crash a
    // privileged read, but it is intentionally non-silent in dev (server logs).
  }
}
