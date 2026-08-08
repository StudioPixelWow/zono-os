"use server";
// ============================================================================
// ZONO — Publishing Control Center: operational server actions (P0/P1 engine).
// ----------------------------------------------------------------------------
// Retry / Pause / Resume / Cancel / Reconcile / Emergency-Stop — every state
// change routes through the canonical publishing state machine (transitionPost),
// so transitions are validated and every action appends an immutable audit event.
// Org-scoped; privileged actions (reconcile, emergency stop) require manager+.
// ============================================================================
import "server-only";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { transitionPost, type PublishState } from "./publishing-state-machine";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Ctx = { orgId: string; userId: string; rank: number };
type Result = { ok: boolean; error?: string };

const RANK: Record<string, number> = {
  owner: 100, admin: 80, manager: 60, branch_manager: 60, agent: 40, assistant: 30, viewer: 20,
};

async function ctx(): Promise<Ctx | null> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id || !profile?.id) return null;
  const db: any = createServiceRoleClient();
  // Role lives on roles.key (joined via users.role_id) — NOT a users.role column.
  const { data } = await db.from("users").select("role_id, roles:role_id(key)").eq("id", profile.id).maybeSingle();
  const joined = (data as { roles?: { key?: string } | { key?: string }[] } | null)?.roles;
  const role = (Array.isArray(joined) ? joined[0]?.key : joined?.key) ?? "agent";
  return { orgId: profile.org_id, userId: profile.id, rank: RANK[role] ?? 40 };
}

async function currentState(db: any, orgId: string, postId: string): Promise<PublishState | null> {
  const { data } = await db.from("distribution_posts").select("publish_state").eq("id", postId).eq("org_id", orgId).maybeSingle();
  const st = (data as { publish_state?: string } | null)?.publish_state;
  return (st ?? null) as PublishState | null;
}

function done(res: Result): Result { revalidatePath("/publishing-control"); return res; }

/** Retry a failed / dead-lettered target — re-queues it for a fresh, safe attempt. */
export async function retryPostAction(postId: string): Promise<Result> {
  const c = await ctx(); if (!c) return { ok: false, error: "unauthorized" };
  const db: any = createServiceRoleClient();
  const from = await currentState(db, c.orgId, postId); if (!from) return { ok: false, error: "not found" };
  return done(await transitionPost(db, {
    postId, orgId: c.orgId, from, to: "queued", kind: "retry", actorId: c.userId, reason: "manual retry",
    patch: { status: "scheduled", lease_expires_at: null, locked_by: null, next_retry_at: null, terminal: false, dead_lettered_at: null },
  }));
}

/** Pause a not-yet-dispatched target (queued/scheduled/draft → paused). */
export async function pausePostAction(postId: string): Promise<Result> {
  const c = await ctx(); if (!c) return { ok: false, error: "unauthorized" };
  const db: any = createServiceRoleClient();
  const from = await currentState(db, c.orgId, postId); if (!from) return { ok: false, error: "not found" };
  return done(await transitionPost(db, { postId, orgId: c.orgId, from, to: "paused", kind: "pause", actorId: c.userId, patch: { status: "paused" } }));
}

/** Resume a paused target. */
export async function resumePostAction(postId: string): Promise<Result> {
  const c = await ctx(); if (!c) return { ok: false, error: "unauthorized" };
  const db: any = createServiceRoleClient();
  const from = await currentState(db, c.orgId, postId); if (!from) return { ok: false, error: "not found" };
  return done(await transitionPost(db, { postId, orgId: c.orgId, from, to: "queued", kind: "resume", actorId: c.userId, patch: { status: "scheduled", paused_at: null } }));
}

/** Cancel a target (any non-terminal state → cancelled). */
export async function cancelPostAction(postId: string): Promise<Result> {
  const c = await ctx(); if (!c) return { ok: false, error: "unauthorized" };
  const db: any = createServiceRoleClient();
  const from = await currentState(db, c.orgId, postId); if (!from) return { ok: false, error: "not found" };
  return done(await transitionPost(db, { postId, orgId: c.orgId, from, to: "cancelled", kind: "cancel", actorId: c.userId, patch: { status: "cancelled", lease_expires_at: null } }));
}

/**
 * Resolve an ambiguous (awaiting_reconciliation) target with an EXPLICIT human
 * decision. Manager+ only. Never auto-resolves. published → mark done (+URL);
 * not_published → failed (retry-eligible); cancel → cancelled.
 */
export async function reconcilePostAction(postId: string, decision: "published" | "not_published" | "cancel", url?: string | null): Promise<Result> {
  const c = await ctx(); if (!c) return { ok: false, error: "unauthorized" };
  if (c.rank < 60) return { ok: false, error: "requires manager" };
  const db: any = createServiceRoleClient();
  const from = await currentState(db, c.orgId, postId); if (!from) return { ok: false, error: "not found" };
  const now = new Date().toISOString();
  let to: PublishState; let patch: Record<string, unknown>;
  if (decision === "published") { to = "published"; patch = { status: "published", published_at: now, published_manually_at: now, published_by: c.userId, confirmation_source: "reconciliation", external_post_url: url ?? null }; }
  else if (decision === "not_published") { to = "failed"; patch = { status: "failed", failure_code: "reconciled_not_published", confirmation_source: "reconciliation" }; }
  else { to = "cancelled"; patch = { status: "cancelled" }; }
  return done(await transitionPost(db, { postId, orgId: c.orgId, from, to, kind: "reconcile", actorId: c.userId, reason: decision, patch }));
}

/**
 * Engage an emergency stop. Manager+ only. scope: organization | campaign | group
 * | property (scopeId required for scoped stops). Serving is blocked server-side by
 * claim_next_distribution_post while any matching control is active.
 */
export async function engageEmergencyStopAction(scope: string, scopeId: string | null, reason: string): Promise<Result> {
  const c = await ctx(); if (!c) return { ok: false, error: "unauthorized" };
  if (c.rank < 60) return { ok: false, error: "requires manager" };
  const db: any = createServiceRoleClient();
  const { error } = await db.from("distribution_publish_controls").insert({
    org_id: c.orgId, scope, scope_id: scopeId, state: "active", reason: reason?.slice(0, 300) ?? null, created_by: c.userId,
  });
  if (error && !/duplicate key|23505/i.test(error.message)) return done({ ok: false, error: error.message });
  return done({ ok: true }); // duplicate = already active (idempotent)
}

/** Release an active emergency stop. Manager+ only. */
export async function releaseEmergencyStopAction(scope: string, scopeId: string | null): Promise<Result> {
  const c = await ctx(); if (!c) return { ok: false, error: "unauthorized" };
  if (c.rank < 60) return { ok: false, error: "requires manager" };
  const db: any = createServiceRoleClient();
  const base = db.from("distribution_publish_controls")
    .update({ state: "released", released_at: new Date().toISOString(), released_by: c.userId })
    .eq("org_id", c.orgId).eq("scope", scope).eq("state", "active");
  const { error } = scopeId ? await base.eq("scope_id", scopeId) : await base.is("scope_id", null);
  return done(error ? { ok: false, error: error.message } : { ok: true });
}

/** List active emergency controls for the org (Control Center panel). */
export async function listActiveControlsAction(): Promise<Array<{ id: string; scope: string; scope_id: string | null; reason: string | null; created_at: string }>> {
  const c = await ctx(); if (!c) return [];
  const db: any = createServiceRoleClient();
  const { data } = await db.from("distribution_publish_controls")
    .select("id,scope,scope_id,reason,created_at").eq("org_id", c.orgId).eq("state", "active")
    .order("created_at", { ascending: false });
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, scope: r.scope, scope_id: r.scope_id ?? null, reason: r.reason ?? null, created_at: r.created_at }));
}
