// ============================================================================
// ZONO — PLATFORM SECURITY server layer (server-only). P5.9. Read boundary for
// the Security Center overview + the privileged-action audit viewer. Pattern:
//   assertPlatformCapability(cap) → bounded service-role read → SAFE DTO.
// HARD RULES: reads only; NEVER expose tokens/secrets/ip/user_agent/raw blobs;
// audit diffs are secret-stripped; counts fail to null (never a fake 0). Zero
// migration (platform_operators + platform_audit_log + support_impersonation_log).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertPlatformCapability } from "./auth";
import { stripSecrets, isSensitiveAction, isDeniedAction } from "../security/model";

const DAY_MS = 86_400_000;
const SUPPORT_VIEW_MAX_MS = 15 * 60 * 1000;
function sinceIso(days: number): string { return new Date(Date.now() - days * DAY_MS).toISOString(); }

async function count(table: string, build: (q: CQB) => CQB): Promise<number | null> {
  try {
    const db = createServiceRoleClient();
    const q = build(db.from(table as never).select("*", { count: "exact", head: true }) as unknown as CQB);
    const { count, error } = await (q as unknown as Promise<{ count: number | null; error: unknown }>);
    return error ? null : (count ?? 0);
  } catch { return null; }
}
type CQB = { eq: (c: string, v: unknown) => CQB; is: (c: string, v: unknown) => CQB; like: (c: string, v: string) => CQB; gte: (c: string, v: unknown) => CQB; lt: (c: string, v: unknown) => CQB };

export interface SecurityOverview {
  activeOperators: number | null; suspendedOperators: number | null; superAdmins: number | null;
  recentPrivilegedActions: number | null; deniedActions: number | null;
  supportViewActive: number | null; supportViewExpiredOpen: number | null; supportViewTotal: number | null;
  mfaEnforced: boolean; generatedAt: string;
}

export async function getSecurityOverview(): Promise<SecurityOverview> {
  await assertPlatformCapability("platform.admins.read");
  const since30 = sinceIso(30);
  const staleCut = new Date(Date.now() - SUPPORT_VIEW_MAX_MS).toISOString();

  const [activeOperators, suspendedOperators, superAdmins, opCreate, roleChange, suspend, impStart, denied, svActive, svExpiredOpen, svTotal] = await Promise.all([
    count("platform_operators", (q) => q.eq("status", "active")),
    count("platform_operators", (q) => q.eq("status", "suspended")),
    count("platform_operators", (q) => q.eq("platform_role", "super_admin").eq("status", "active")),
    count("platform_audit_log", (q) => q.like("action", "platform.operator.%").gte("created_at", since30)),
    count("platform_audit_log", (q) => q.eq("action", "platform.operator.role.change").gte("created_at", since30)),
    count("platform_audit_log", (q) => q.eq("action", "platform.operator.suspend").gte("created_at", since30)),
    count("platform_audit_log", (q) => q.eq("action", "support.impersonation.start").gte("created_at", since30)),
    count("platform_audit_log", (q) => q.like("action", "%.denied").gte("created_at", since30)),
    count("support_impersonation_log", (q) => q.is("ended_at", null).gte("started_at", staleCut)),
    count("support_impersonation_log", (q) => q.is("ended_at", null).lt("started_at", staleCut)),
    count("support_impersonation_log", (q) => q.gte("started_at", sinceIso(365))),
  ]);
  void roleChange; void suspend; void impStart; // folded into recentPrivilegedActions below
  const recentPrivilegedActions = (opCreate === null && impStart === null) ? null : (opCreate ?? 0) + (impStart ?? 0);

  return {
    activeOperators, suspendedOperators, superAdmins,
    recentPrivilegedActions, deniedActions: denied,
    supportViewActive: svActive, supportViewExpiredOpen: svExpiredOpen, supportViewTotal: svTotal,
    mfaEnforced: false, // authoritative: no MFA enforcement in the current auth architecture (0 factors enrolled)
    generatedAt: new Date().toISOString(),
  };
}

// ── Audit viewer (spec §7) ──────────────────────────────────────────────────
export interface AuditFilters { action?: string | null; orgId?: string | null; resourceType?: string | null; operatorId?: string | null; since?: string | null; until?: string | null; limit?: number }
export interface AuditEntry {
  id: string; createdAt: string; actorId: string | null; actorLabel: string | null; actorName: string | null;
  action: string; sensitive: boolean; denied: boolean; orgId: string | null; orgName: string | null;
  resourceType: string | null; resourceId: string | null; reason: string | null; source: string | null; correlationId: string | null;
  diff: { before: Record<string, unknown> | null; after: Record<string, unknown> | null } | null;
}

export async function listPlatformAuditLog(filters: AuditFilters = {}): Promise<AuditEntry[]> {
  await assertPlatformCapability("platform.audit.read");
  const db = createServiceRoleClient();
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  // Safe columns only — NEVER ip / user_agent / raw request blobs.
  let rows: { id: string; actor_id: string | null; actor_label: string | null; action: string; resource_type: string | null; resource_id: string | null; org_id: string | null; source: string | null; correlation_id: string | null; old_values: unknown; new_values: unknown; created_at: string }[] = [];
  try {
    let q = db.from("platform_audit_log" as never)
      .select("id,actor_id,actor_label,action,resource_type,resource_id,org_id,source,correlation_id,old_values,new_values,created_at")
      .order("created_at", { ascending: false }).limit(limit);
    if (filters.action) q = q.eq("action" as never, filters.action as never);
    if (filters.orgId) q = q.eq("org_id" as never, filters.orgId as never);
    if (filters.resourceType) q = q.eq("resource_type" as never, filters.resourceType as never);
    if (filters.operatorId) q = q.eq("actor_id" as never, filters.operatorId as never);
    if (filters.since) q = q.gte("created_at" as never, filters.since as never);
    if (filters.until) q = q.lte("created_at" as never, filters.until as never);
    const { data } = await q;
    rows = ((data ?? []) as typeof rows);
  } catch { rows = []; }

  const orgIds = Array.from(new Set(rows.map((r) => r.org_id).filter((x): x is string => !!x)));
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x)));
  const orgName = new Map<string, string | null>(); const actorName = new Map<string, string | null>();
  if (orgIds.length) { try { const { data } = await db.from("organizations").select("id,name").in("id", orgIds); for (const o of ((data ?? []) as { id: string; name: string | null }[])) orgName.set(o.id, o.name); } catch { /* */ } }
  if (actorIds.length) { try { const { data } = await db.from("users").select("id,full_name").in("id", actorIds); for (const u of ((data ?? []) as { id: string; full_name: string | null }[])) actorName.set(u.id, u.full_name); } catch { /* */ } }

  // NOTE: this reader does NOT self-audit (auditing an audit read loops).
  return rows.map((r) => {
    const nv = (r.new_values && typeof r.new_values === "object") ? (r.new_values as Record<string, unknown>) : null;
    const reason = nv && typeof nv.reason === "string" ? nv.reason : null;
    const before = stripSecrets(r.old_values);
    const after = stripSecrets(r.new_values);
    const diff = (before || after) ? { before, after } : null;
    return {
      id: r.id, createdAt: r.created_at, actorId: r.actor_id, actorLabel: r.actor_label, actorName: r.actor_id ? (actorName.get(r.actor_id) ?? null) : null,
      action: r.action, sensitive: isSensitiveAction(r.action), denied: isDeniedAction(r.action),
      orgId: r.org_id, orgName: r.org_id ? (orgName.get(r.org_id) ?? null) : null,
      resourceType: r.resource_type, resourceId: r.resource_id, reason, source: r.source, correlationId: r.correlation_id, diff,
    };
  });
}
