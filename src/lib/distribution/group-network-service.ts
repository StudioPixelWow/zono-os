// ============================================================================
// ZONO — Facebook GROUP NETWORK state + reconciliation (P9.8, server-only).
// ----------------------------------------------------------------------------
// Turns the raw distribution_groups registry into a managed "רשת הקבוצות שלי":
// a persistent DISCOVERED / ACTIVE / IGNORED / UNAVAILABLE state model + an
// idempotent reconciliation that survives re-scans WITHOUT duplicating groups,
// deleting history, or overriding the agent's ACTIVE/IGNORED choices.
//
// Reuses the EXISTING schema — distribution_groups.status is free-form text, so
// no migration is required (see P9.8 architecture note). Nothing here publishes,
// automates, or touches Facebook credentials.
// ============================================================================
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { planReconcile, type GroupNetworkStatus } from "./group-network-core";

export { GROUP_STATUS_LABEL, planReconcile } from "./group-network-core";
export type { GroupNetworkStatus, GroupStateRow, ReconcilePlan } from "./group-network-core";

// ── DB apply ─────────────────────────────────────────────────────────────────
const GROUPS = "distribution_groups";
const AUDIT = "distribution_group_sync_events";

type Ctx = { orgId: string; userId: string | null };
async function ctx(): Promise<Ctx | null> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return null;
  return { orgId: profile.org_id, userId: profile.id ?? null };
}

export interface SetStatusResult { ok: boolean; updated: number; error?: string }

/** Set the network status for one or more of the org's groups (agent choice).
 *  RLS user-scoped; only groups belonging to the caller's org are affected. */
export async function setGroupNetworkStatus(groupIds: string[], status: GroupNetworkStatus): Promise<SetStatusResult> {
  const c = await ctx(); if (!c) return { ok: false, updated: 0, error: "unauthorized" };
  const ids = [...new Set((groupIds ?? []).filter(Boolean))];
  if (!ids.length) return { ok: false, updated: 0, error: "no groups" };
  const db = await createClient();
  const { data, error } = await db.from(GROUPS as never)
    .update({ status, updated_at: new Date().toISOString() } as never)
    .eq("org_id", c.orgId).in("id", ids as never).select("id");
  if (error) return { ok: false, updated: 0, error: error.message };
  return { ok: true, updated: (data as unknown as unknown[])?.length ?? 0 };
}

/** Apply a reconciliation after a COMPLETE scan (service-role; explicit org). Marks
 *  vanished scan groups unavailable and restores reappeared ones — idempotent, never
 *  deletes, never overrides an active/ignored choice. Returns the applied counts. */
export async function reconcileScannedGroups(orgId: string, userId: string | null, seenExternalIds: string[]): Promise<{ markedUnavailable: number; restored: number }> {
  const db = createServiceRoleClient();
  const { data } = await db.from(GROUPS as never)
    .select("id,external_group_id,status,source").eq("org_id", orgId);
  const rows = ((data ?? []) as unknown as Array<{ id: string; external_group_id: string | null; status: string | null; source: string | null }>)
    .map((r) => ({ id: r.id, externalGroupId: r.external_group_id, status: r.status, source: r.source }));
  const plan = planReconcile(rows, seenExternalIds);
  const now = new Date().toISOString();
  if (plan.toUnavailable.length) {
    await db.from(GROUPS as never).update({ status: "unavailable", updated_at: now } as never).eq("org_id", orgId).in("id", plan.toUnavailable as never);
    await db.from(AUDIT as never).insert({ org_id: orgId, user_id: userId, action: "groups_marked_unavailable", details: { count: plan.toUnavailable.length } } as never);
  }
  if (plan.toRestore.length) {
    await db.from(GROUPS as never).update({ status: "discovered", updated_at: now } as never).eq("org_id", orgId).in("id", plan.toRestore as never);
    await db.from(AUDIT as never).insert({ org_id: orgId, user_id: userId, action: "groups_restored", details: { count: plan.toRestore.length } } as never);
  }
  return { markedUnavailable: plan.toUnavailable.length, restored: plan.toRestore.length };
}

// ── Directory snapshot for the network UI ────────────────────────────────────
export interface GroupNetworkCounts { discovered: number; active: number; ignored: number; unavailable: number; total: number }

/** Counts by network status for the org — powers "ZONO מצאה X קבוצות" + tabs. */
export async function getGroupNetworkCounts(): Promise<GroupNetworkCounts> {
  const c = await ctx();
  const empty: GroupNetworkCounts = { discovered: 0, active: 0, ignored: 0, unavailable: 0, total: 0 };
  if (!c) return empty;
  const db = await createClient();
  const { data } = await db.from(GROUPS as never).select("status").eq("org_id", c.orgId);
  const rows = (data ?? []) as unknown as Array<{ status: string | null }>;
  const out = { ...empty };
  for (const r of rows) {
    out.total++;
    const s = (r.status ?? "discovered") as GroupNetworkStatus;
    if (s === "active") out.active++;
    else if (s === "ignored") out.ignored++;
    else if (s === "unavailable") out.unavailable++;
    else out.discovered++;
  }
  return out;
}
