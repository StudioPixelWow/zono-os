// ============================================================================
// ZONO — platform repository (server-only). Persistence for feature_flags +
// platform_audit_log. Strictly org-scoped; service-role client. No business
// logic — pure CRUD + row→DTO mapping.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { FeatureFlag, AuditEntry } from "../types";

type Db = ReturnType<typeof createServiceRoleClient>;
const FLAGS = "feature_flags";
const AUDIT = "platform_audit_log";

export interface FlagRow {
  id: string;
  org_id: string | null;
  flag_key: string;
  enabled: boolean;
  description: string | null;
  rollout_pct: number;
  min_role: string | null;
  allow_users: string[];
  deny_users: string[];
  environments: string[];
  updated_by: string | null;
  updated_at: string;
}

export interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_label: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  source: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  correlation_id: string | null;
  created_at: string;
}

/** Role rank used to expand `min_role` into an allow-list of role keys. */
const ROLE_ORDER = ["viewer", "agent", "team_leader", "manager", "admin", "owner"] as const;
function rolesAtOrAbove(min: string | null): string[] {
  if (!min) return [];
  const idx = ROLE_ORDER.indexOf(min as (typeof ROLE_ORDER)[number]);
  return idx < 0 ? [] : ROLE_ORDER.slice(idx);
}

/** Map a DB row → the pure FeatureFlag the evaluator understands. Rows are
 *  already org-scoped, so `orgIds` stays empty; `deny_users` is enforced by the
 *  caller (the pure evaluator has no deny concept). */
export function flagRowToFeatureFlag(r: FlagRow): FeatureFlag {
  return {
    key: r.flag_key,
    enabled: r.enabled,
    environments: r.environments ?? [],
    orgIds: [],
    roles: rolesAtOrAbove(r.min_role),
    userIds: r.allow_users ?? [],
    rolloutPercent: r.rollout_pct ?? 0,
  };
}

export function createPlatformRepository(db: Db) {
  return {
    // ── Feature flags ───────────────────────────────────────────────────────
    /** Org flags + global defaults (org_id is null). Org rows win on conflict. */
    async listFlags(orgId: string): Promise<FlagRow[]> {
      const { data } = await db
        .from(FLAGS as never)
        .select("*")
        .or(`org_id.eq.${orgId},org_id.is.null`)
        .order("flag_key", { ascending: true });
      const rows = (data ?? []) as unknown as FlagRow[];
      // De-dupe by key, preferring the org-specific row over the global default.
      const byKey = new Map<string, FlagRow>();
      for (const r of rows) {
        const prev = byKey.get(r.flag_key);
        if (!prev || (prev.org_id === null && r.org_id !== null)) byKey.set(r.flag_key, r);
      }
      return [...byKey.values()];
    },

    async upsertFlag(orgId: string, input: {
      flagKey: string; enabled: boolean; description?: string | null; rolloutPct?: number;
      minRole?: string | null; allowUsers?: string[]; denyUsers?: string[]; environments?: string[];
      updatedBy: string;
    }): Promise<FlagRow | null> {
      const { data } = await db.from(FLAGS as never).upsert({
        org_id: orgId,
        flag_key: input.flagKey,
        enabled: input.enabled,
        description: input.description ?? null,
        rollout_pct: Math.max(0, Math.min(100, input.rolloutPct ?? 0)),
        min_role: input.minRole ?? null,
        allow_users: input.allowUsers ?? [],
        deny_users: input.denyUsers ?? [],
        environments: input.environments ?? [],
        updated_by: input.updatedBy,
      } as never, { onConflict: "org_id,flag_key" }).select("*").maybeSingle();
      return (data as unknown as FlagRow) ?? null;
    },

    // ── Audit log (append-only) ───────────────────────────────────────────────
    async insertAudit(entry: AuditEntry & {
      actorLabel?: string | null; resourceId?: string | null;
      requestId?: string | null; traceId?: string | null; ip?: string | null; userAgent?: string | null;
    }): Promise<void> {
      await db.from(AUDIT as never).insert({
        org_id: entry.orgId,
        actor_id: entry.actorUserId,
        actor_label: entry.actorLabel ?? null,
        action: entry.action,
        resource_type: entry.entityType,
        resource_id: entry.entityId ?? entry.resourceId ?? null,
        source: entry.source,
        old_values: entry.before,
        new_values: entry.after,
        correlation_id: entry.correlationId,
        request_id: entry.requestId ?? null,
        trace_id: entry.traceId ?? null,
        ip: entry.ip ?? null,
        user_agent: entry.userAgent ?? null,
      } as never);
    },

    async listAudit(orgId: string, opts: { limit?: number; action?: string; resourceType?: string } = {}): Promise<AuditRow[]> {
      let q = db.from(AUDIT as never).select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(opts.limit ?? 100);
      if (opts.action) q = q.eq("action", opts.action);
      if (opts.resourceType) q = q.eq("resource_type", opts.resourceType);
      const { data } = await q;
      return (data ?? []) as unknown as AuditRow[];
    },
  };
}

export type PlatformRepository = ReturnType<typeof createPlatformRepository>;
