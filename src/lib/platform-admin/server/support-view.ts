// ============================================================================
// ZONO — PLATFORM SUPPORT VIEW server layer (server-only). P5.8 · Path A.
// ----------------------------------------------------------------------------
// A secure, PLATFORM-SIDE, READ-ONLY reconstruction of a customer's account. NO
// customer auth session, NO JWT, NO service-role flip of the customer app, NO
// core-auth change. Every read is an EXPLICITLY org+user-scoped service-role
// query issued from here (the platform boundary) — RLS is NEVER relied upon.
// Session history reuses support_impersonation_log (NO migration).
// Pattern: assertPlatformCapability(cap) → validate tenancy → scoped read → audit.
// HARD RULES:
//   · Reads gated platform.support.read; start/end gated platform.support.impersonate.
//   · EVERY data query includes .eq("org_id", orgId); user-scoped queries also
//     bind the target user column. NO unscoped service-role select.
//   · READ ONLY — this module has zero customer mutations.
//   · NEVER select secret/token columns; NEVER fabricate (unavailable → flagged).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertPlatformCapability } from "./auth";
import { writePlatformAudit } from "./audit";
import { isBlockedAccountStatus } from "@/lib/auth/account-status";
import {
  validateReason, composeReason, isSessionExpired, sessionExpiresAtMs,
  type SupportViewReason,
} from "../impersonation/model";

export class SupportViewError extends Error {
  constructor(message: string) { super(message); this.name = "SupportViewError"; }
}

// ── Session lifecycle (support_impersonation_log; NO migration) ──────────────
export interface SupportViewSession {
  sessionId: string;         // correlation_id
  orgId: string; targetUserId: string;
  reason: string; startedAt: string; expiresAtMs: number;
}

/** The current caller's ACTIVE (unexpired, unended) session for this target, or
 *  null. An expired-but-open row is closed + audited as expired here (lazy). */
export async function getActiveSupportSession(orgId: string, targetUserId: string): Promise<SupportViewSession | null> {
  const operator = await assertPlatformCapability("platform.support.impersonate");
  const db = createServiceRoleClient();
  const { data } = await db.from("support_impersonation_log" as never)
    .select("correlation_id,org_id,target_user_id,reason,started_at,ended_at")
    .eq("admin_user_id" as never, operator.userId as never)
    .eq("org_id" as never, orgId as never)
    .eq("target_user_id" as never, targetUserId as never)
    .is("ended_at" as never, null as never)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = (data as { correlation_id: string; org_id: string; target_user_id: string; reason: string; started_at: string; ended_at: string | null } | null) ?? null;
  if (!row) return null;
  if (isSessionExpired(row.started_at, Date.now())) {
    // Lazy expiry: close it and record the expired outcome.
    await db.from("support_impersonation_log" as never).update({ ended_at: new Date().toISOString() } as never)
      .eq("correlation_id" as never, row.correlation_id as never).is("ended_at" as never, null as never);
    await writePlatformAudit({ operator, capability: "platform.support.impersonate", action: "support.impersonation.expired", resourceType: "organization", targetOrgId: orgId, resourceId: row.correlation_id, metadata: { targetUserId } });
    return null;
  }
  return { sessionId: row.correlation_id, orgId, targetUserId, reason: row.reason, startedAt: row.started_at, expiresAtMs: sessionExpiresAtMs(row.started_at) };
}

/** Start a Support View session. Fail-closed tenancy validation; audited. */
export async function startSupportView(input: { orgId: string; targetUserId: string; reason: string; reasonDetail?: string | null; ticketId?: string | null }): Promise<{ sessionId: string }> {
  const operator = await assertPlatformCapability("platform.support.impersonate");
  const db = createServiceRoleClient();
  const denied = async (why: string): Promise<never> => {
    await writePlatformAudit({ operator, capability: "platform.support.impersonate", action: "support.impersonation.denied", resourceType: "organization", targetOrgId: input.orgId, metadata: { targetUserId: input.targetUserId, reason: why } });
    throw new SupportViewError(why);
  };

  const reasonErr = validateReason(input.reason, input.reasonDetail);
  if (reasonErr) return denied(reasonErr);
  // Tenancy: org exists; target user exists, belongs to THIS org, not blocked.
  const { data: org } = await db.from("organizations").select("id").eq("id", input.orgId).maybeSingle();
  if (!org) return denied("ארגון לא קיים");
  const { data: u } = await db.from("users").select("id,org_id,status").eq("id", input.targetUserId).maybeSingle();
  const urow = (u as { id: string; org_id: string | null; status: string | null } | null) ?? null;
  if (!urow || urow.org_id !== input.orgId) return denied("המשתמש אינו שייך לארגון היעד");
  if (isBlockedAccountStatus(urow.status)) return denied("לא ניתן לצפות כמשתמש חסום");

  const sessionId = crypto.randomUUID();
  const reason = composeReason(input.reason as SupportViewReason, input.reasonDetail);
  const { error } = await db.from("support_impersonation_log" as never).insert({
    org_id: input.orgId, admin_user_id: operator.userId, target_user_id: input.targetUserId,
    reason, read_only: true, correlation_id: sessionId, started_at: new Date().toISOString(),
  } as never);
  if (error) throw new SupportViewError("פתיחת מצב תמיכה נכשלה");
  // ticketId is NOT a column on support_impersonation_log (no migration) — it is
  // recorded in the audit metadata + carried in the route URL for return.
  await writePlatformAudit({ operator, capability: "platform.support.impersonate", action: "support.impersonation.start", resourceType: "organization", targetOrgId: input.orgId, resourceId: sessionId, reason, metadata: { targetUserId: input.targetUserId, ticketId: input.ticketId ?? null } });
  return { sessionId };
}

/** End the caller's active session(s) for this target; audited with duration. */
export async function endSupportView(orgId: string, targetUserId: string): Promise<void> {
  const operator = await assertPlatformCapability("platform.support.impersonate");
  const db = createServiceRoleClient();
  const { data } = await db.from("support_impersonation_log" as never)
    .select("correlation_id,started_at").eq("admin_user_id" as never, operator.userId as never)
    .eq("org_id" as never, orgId as never).eq("target_user_id" as never, targetUserId as never)
    .is("ended_at" as never, null as never).order("started_at", { ascending: false }).limit(1).maybeSingle();
  const row = (data as { correlation_id: string; started_at: string } | null) ?? null;
  const endedAt = new Date().toISOString();
  await db.from("support_impersonation_log" as never).update({ ended_at: endedAt } as never)
    .eq("admin_user_id" as never, operator.userId as never).eq("org_id" as never, orgId as never)
    .eq("target_user_id" as never, targetUserId as never).is("ended_at" as never, null as never);
  const durationMs = row ? Math.max(0, Date.parse(endedAt) - Date.parse(row.started_at)) : null;
  await writePlatformAudit({ operator, capability: "platform.support.impersonate", action: "support.impersonation.end", resourceType: "organization", targetOrgId: orgId, resourceId: row?.correlation_id ?? null, metadata: { targetUserId, durationMs } });
}

// ── Security history (spec §11) ─────────────────────────────────────────────
export interface SupportSessionRow { sessionId: string; operatorId: string; operatorName: string | null; orgId: string; orgName: string | null; targetUserId: string; targetName: string | null; reason: string; startedAt: string; endedAt: string | null; durationMs: number | null; outcome: string }
export async function listSupportViewSessions(limit = 100): Promise<SupportSessionRow[]> {
  const operator = await assertPlatformCapability("platform.support.read");
  const db = createServiceRoleClient();
  const capped = Math.min(Math.max(limit, 1), 500);
  // Only PLATFORM-operator sessions (distinguish from the org-admin launch logbook).
  const { data: ops } = await db.from("platform_operators" as never).select("user_id").limit(500);
  const opIds = ((ops ?? []) as { user_id: string }[]).map((o) => o.user_id);
  if (opIds.length === 0) { await writePlatformAudit({ operator, capability: "platform.support.read", action: "support.impersonation.history", resourceType: "platform", metadata: { count: 0 } }); return []; }
  const { data } = await db.from("support_impersonation_log" as never)
    .select("correlation_id,admin_user_id,org_id,target_user_id,reason,started_at,ended_at")
    .in("admin_user_id" as never, opIds as never).order("started_at", { ascending: false }).limit(capped);
  const rows = ((data ?? []) as { correlation_id: string; admin_user_id: string; org_id: string; target_user_id: string; reason: string; started_at: string; ended_at: string | null }[]);
  // Batch names.
  const orgIds = Array.from(new Set(rows.map((r) => r.org_id)));
  const userIds = Array.from(new Set([...rows.map((r) => r.admin_user_id), ...rows.map((r) => r.target_user_id)]));
  const orgName = new Map<string, string | null>(); const userName = new Map<string, string | null>();
  if (orgIds.length) { const { data: o } = await db.from("organizations").select("id,name").in("id", orgIds); for (const x of ((o ?? []) as { id: string; name: string | null }[])) orgName.set(x.id, x.name); }
  if (userIds.length) { const { data: u } = await db.from("users").select("id,full_name").in("id", userIds); for (const x of ((u ?? []) as { id: string; full_name: string | null }[])) userName.set(x.id, x.full_name); }
  await writePlatformAudit({ operator, capability: "platform.support.read", action: "support.impersonation.history", resourceType: "platform", metadata: { count: rows.length } });
  const now = Date.now();
  return rows.map((r) => {
    const durationMs = r.ended_at ? Math.max(0, Date.parse(r.ended_at) - Date.parse(r.started_at)) : null;
    const outcome = r.ended_at ? "הסתיים" : isSessionExpired(r.started_at, now) ? "פג תוקף" : "פעיל";
    return { sessionId: r.correlation_id, operatorId: r.admin_user_id, operatorName: userName.get(r.admin_user_id) ?? null, orgId: r.org_id, orgName: orgName.get(r.org_id) ?? null, targetUserId: r.target_user_id, targetName: userName.get(r.target_user_id) ?? null, reason: r.reason, startedAt: r.started_at, endedAt: r.ended_at, durationMs, outcome };
  });
}

// ── Target header (validated: user belongs to org) ─────────────────────────
export interface SupportViewTarget { orgName: string | null; userName: string | null; userStatus: string | null; valid: boolean }
export async function getSupportViewTarget(orgId: string, targetUserId: string): Promise<SupportViewTarget> {
  await assertPlatformCapability("platform.support.read");
  const db = createServiceRoleClient();
  const [{ data: org }, { data: u }] = await Promise.all([
    db.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    db.from("users").select("full_name,org_id,status").eq("id", targetUserId).maybeSingle(),
  ]);
  const urow = (u as { full_name: string | null; org_id: string | null; status: string | null } | null) ?? null;
  const valid = !!urow && urow.org_id === orgId; // tenancy: reject a target from another org
  return { orgName: (org as { name: string | null } | null)?.name ?? null, userName: urow?.full_name ?? null, userStatus: urow?.status ?? null, valid };
}

// ── Scoped data reads — EVERY query binds org_id (+ user where user-scoped) ──
export interface AvailableSection<T> { available: boolean; rows: T[]; note?: string }
async function scopedList<T>(table: string, orgId: string, cols: string, extra?: (q: SVQB) => SVQB, limit = 100): Promise<AvailableSection<T>> {
  try {
    const db = createServiceRoleClient();
    let q = db.from(table as never).select(cols).eq("org_id" as never, orgId as never).limit(limit) as unknown as SVQB;
    if (extra) q = extra(q);
    const { data, error } = await (q as unknown as Promise<{ data: unknown; error: unknown }>);
    if (error) return { available: false, rows: [], note: "לא זמין במצב תמיכה" };
    return { available: true, rows: ((data ?? []) as T[]) };
  } catch { return { available: false, rows: [], note: "לא זמין במצב תמיכה" }; }
}
type SVQB = { eq: (c: string, v: unknown) => SVQB; limit: (n: number) => SVQB; order: (c: string, o: { ascending: boolean }) => SVQB };

export interface PropRow { id: string; title: string | null; status: string | null }
export interface IdRow { id: string }
export interface StatusRow { id: string; status: string | null }
export interface TaskRow { id: string; title: string | null; status: string | null }

/** Target user's OWN properties (org + owner scoped). */
export async function svProperties(orgId: string, targetUserId: string): Promise<AvailableSection<PropRow>> {
  await assertPlatformCapability("platform.support.read");
  return scopedList<PropRow>("properties", orgId, "id,title,status", (q) => q.eq("owner_id", targetUserId), 60);
}
export async function svLeads(orgId: string, targetUserId: string): Promise<AvailableSection<IdRow>> {
  await assertPlatformCapability("platform.support.read");
  return scopedList<IdRow>("leads", orgId, "id", (q) => q.eq("owner_id", targetUserId), 60);
}
export async function svBuyers(orgId: string, targetUserId: string): Promise<AvailableSection<IdRow>> {
  await assertPlatformCapability("platform.support.read");
  return scopedList<IdRow>("buyers", orgId, "id", (q) => q.eq("owner_id", targetUserId), 60);
}
export async function svTasks(orgId: string, targetUserId: string): Promise<AvailableSection<TaskRow>> {
  await assertPlatformCapability("platform.support.read");
  return scopedList<TaskRow>("tasks", orgId, "id,title,status", (q) => q.eq("created_by", targetUserId), 60);
}
/** Org-level journeys (org scoped; no per-user column on this table). */
export async function svJourneys(orgId: string): Promise<AvailableSection<StatusRow>> {
  await assertPlatformCapability("platform.support.read");
  return scopedList<StatusRow>("journeys", orgId, "id,status", undefined, 60);
}
