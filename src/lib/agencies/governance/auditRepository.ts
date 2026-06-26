// ============================================================================
// ZONO — PHASE 26.14: Audit log repository (SERVER-ONLY, append-only). Org-scoped.
// Captures who/when/old/new/reason for every governed action. Never updated.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { govContext } from "./_ctx";
import type { AuditLogEntry, AuditAction } from "./agencyGovernanceTypes";

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | null => (v && typeof v === "object" ? (v as Obj) : null);
const COLS = "id,actor_id,action,entity_type,entity_id,old_value,new_value,reason,created_at";

export interface LogAuditInput {
  action: AuditAction | string;
  entityType: string;
  entityId?: string | null;
  oldValue?: Obj | null;
  newValue?: Obj | null;
  reason?: string | null;
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  const { orgId, actorId } = await govContext();
  const db = await createClient();
  const { error } = await db.from("agency_intelligence_audit_log").insert({
    organization_id: orgId, actor_id: actorId, action: input.action, entity_type: input.entityType,
    entity_id: input.entityId ?? null, old_value: input.oldValue ?? null, new_value: input.newValue ?? null, reason: input.reason ?? null,
  } as never);
  if (error) throw new Error(error.message);
}

function toEntry(r: Obj): AuditLogEntry {
  return {
    id: r.id as string, actorId: (r.actor_id as string) ?? null, action: r.action as string,
    entityType: r.entity_type as string, entityId: (r.entity_id as string) ?? null,
    oldValue: asObj(r.old_value), newValue: asObj(r.new_value), reason: (r.reason as string) ?? null, createdAt: r.created_at as string,
  };
}

export async function listAudit(opts: { action?: string; entityType?: string; entityId?: string; limit?: number } = {}): Promise<AuditLogEntry[]> {
  const { orgId } = await govContext();
  const db = await createClient();
  let q = db.from("agency_intelligence_audit_log").select(COLS).eq("organization_id", orgId);
  if (opts.action) q = q.eq("action", opts.action);
  if (opts.entityType) q = q.eq("entity_type", opts.entityType);
  if (opts.entityId) q = q.eq("entity_id", opts.entityId);
  const { data } = await q.order("created_at", { ascending: false }).limit(opts.limit ?? 100);
  return ((data as Obj[] | null) ?? []).map(toEntry);
}
