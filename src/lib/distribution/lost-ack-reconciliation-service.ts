// ============================================================================
// ZONO — Facebook GROUPS publishing: lost-ack / reconciliation SERVICE
// (server-only). Thin, side-effecting adapter over the PURE state machine in
// ./lost-ack-core. It loads a target from distribution_posts, runs the core,
// then persists: the new state on the post row + the append-only events, and
// performs the provider "submit" (hand-off to the extension) AT MOST ONCE, only
// when the core requests it. Cross-org access is refused both here and by RLS.
//
// There is intentionally NO automatic re-post path: a lost ack parks the target
// in `awaiting_reconciliation`, and only an extension reconciliation callback or
// an authorized manager decision can free it for one further attempt.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import {
  submit as coreSubmit,
  markAckLost as coreMarkAckLost,
  recordCallback as coreRecordCallback,
  managerDecision as coreManagerDecision,
  retry as coreRetry,
  TERMINAL_STATES,
  type Target,
  type Decision,
  type CallbackOutcome,
  type ManagerDecision,
  type PublishState,
} from "./lost-ack-core";

type DB = Awaited<ReturnType<typeof createClient>>;

const POSTS = "distribution_posts";
const EVENTS = "distribution_publish_events";
const CONTROLS = "distribution_publish_controls";
const LOG = "[fb-groups-reconcile]";

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

interface PostRow {
  id: string;
  org_id: string;
  group_id: string | null;
  publish_state: PublishState | null;
  status: string | null;
  attempt_count: number | null;
  idempotency_key: string | null;
  provider_post_id: string | null;
  submitted_at: string | null;
  reconciled_at: string | null;
  terminal: boolean | null;
  last_callback_id: string | null;
  last_callback_outcome: CallbackOutcome | null;
}

/** Map a persisted post row onto the pure-core Target shape. */
function toTarget(r: PostRow): Target {
  return {
    id: r.id,
    orgId: r.org_id,
    groupId: r.group_id ?? "",
    state: (r.publish_state ?? "ready") as PublishState,
    attemptCount: r.attempt_count ?? 0,
    idempotencyKey: r.idempotency_key ?? r.id,
    providerPostId: r.provider_post_id,
    submittedAt: r.submitted_at,
    reconciledAt: r.reconciled_at,
    terminal: r.terminal ?? false,
    lastCallbackId: r.last_callback_id,
    lastCallbackOutcome: r.last_callback_outcome,
  };
}

/** Keep the legacy free-text `status` column meaningful for existing UI. */
function legacyStatus(state: PublishState): string {
  switch (state) {
    case "published": return "published";
    case "failed_permanent": return "failed";
    case "cancelled": return "cancelled";
    case "submitted": return "publishing";
    case "awaiting_reconciliation": return "publishing";
    case "needs_review": return "publishing";
    case "pending_retry": return "queued";
    default: return "scheduled";
  }
}

async function loadTargetRow(db: DB, orgId: string, targetId: string): Promise<PostRow | null> {
  const { data } = await db
    .from(POSTS as never)
    .select("id,org_id,group_id,publish_state,status,attempt_count,idempotency_key,provider_post_id,submitted_at,reconciled_at,terminal,last_callback_id,last_callback_outcome")
    .eq("id", targetId)
    .eq("org_id", orgId) // defence-in-depth on top of RLS
    .maybeSingle();
  return (data as unknown as PostRow) ?? null;
}

/** True when an emergency stop is active for the org or the target's group. */
async function isEmergencyActive(db: DB, orgId: string, groupId: string | null): Promise<boolean> {
  const { data } = await db
    .from(CONTROLS as never)
    .select("scope,scope_id")
    .eq("org_id", orgId)
    .eq("state", "active");
  const rows = (data ?? []) as unknown as Array<{ scope: string; scope_id: string | null }>;
  return rows.some((c) => c.scope === "organization" || (c.scope === "group" && c.scope_id === groupId));
}

/** Persist a core Decision: update the post row + append its events (append-only). */
async function persist(db: DB, d: Decision, providerPostId?: string | null): Promise<void> {
  const t = d.target;
  await db
    .from(POSTS as never)
    .update({
      publish_state: t.state,
      status: legacyStatus(t.state),
      attempt_count: t.attemptCount,
      idempotency_key: t.idempotencyKey,
      provider_post_id: providerPostId ?? t.providerPostId,
      submitted_at: t.submittedAt,
      reconciled_at: t.reconciledAt,
      terminal: t.terminal,
      last_callback_id: t.lastCallbackId,
      last_callback_outcome: t.lastCallbackOutcome,
      published_at: t.state === "published" ? (t.reconciledAt ?? nowIso()) : undefined,
    } as never)
    .eq("id", t.id)
    .eq("org_id", t.orgId);

  for (const e of d.events) {
    // Idempotent audit: the (target, callback_id, kind) unique index makes a
    // duplicate delivery a no-op instead of a second history row.
    const { error } = await db.from(EVENTS as never).insert({
      id: e.id,
      org_id: e.orgId,
      target_id: e.targetId,
      from_state: e.fromState,
      to_state: e.toState,
      kind: e.kind,
      actor_id: e.actorId,
      callback_id: e.callbackId,
      reason: e.reason,
      occurred_at: e.occurredAt,
    } as never);
    if (error && error.code !== "23505") {
      console.error(`${LOG} event insert failed: ${error.message}`);
    }
  }
}

/**
 * The provider "submit": hand the target to the extension for the human to post.
 * In the Groups path there is no ZONO→Facebook API call — delivery happens when
 * the extension pulls the post. This hook exists so the at-most-once contract is
 * explicit and auditable; overridable for tests/dry-run.
 */
export type DeliverFn = (target: Target) => Promise<{ providerPostId: string | null }>;
const defaultDeliver: DeliverFn = async () => ({ providerPostId: null });

interface Ctx {
  orgId: string;
  actorId?: string | null;
  db?: DB;
  deliver?: DeliverFn;
}

async function client(ctx: Ctx): Promise<DB> {
  if (ctx.db) return ctx.db;
  if (isServiceRoleConfigured()) return createServiceRoleClient() as unknown as DB;
  return createClient();
}

export const lostAckReconciliationService = {
  /** Hand a prepared target to the extension for publishing (attempt N). */
  async submitTarget(targetId: string, ctx: Ctx): Promise<Decision | { ok: false; error: string }> {
    const db = await client(ctx);
    const row = await loadTargetRow(db, ctx.orgId, targetId);
    if (!row) return { ok: false, error: "not_found" };
    const emergencyActive = await isEmergencyActive(db, ctx.orgId, row.group_id);
    const decision = coreSubmit(toTarget(row), {
      callerOrgId: ctx.orgId, now: nowIso(), eventId: newId(), actorId: ctx.actorId ?? null, emergencyActive,
    });
    let providerPostId: string | null | undefined;
    if (decision.providerSubmitRequested) {
      const deliver = ctx.deliver ?? defaultDeliver;
      ({ providerPostId } = await deliver(decision.target)); // the ONE post hand-off
    }
    await persist(db, decision, providerPostId);
    return decision;
  },

  /** Signal that the extension acknowledgement for a submitted target was lost. */
  async reportAckLost(targetId: string, ctx: Ctx): Promise<Decision | { ok: false; error: string }> {
    const db = await client(ctx);
    const row = await loadTargetRow(db, ctx.orgId, targetId);
    if (!row) return { ok: false, error: "not_found" };
    const decision = coreMarkAckLost(toTarget(row), {
      callerOrgId: ctx.orgId, now: nowIso(), eventId: newId(), actorId: ctx.actorId ?? null,
    });
    await persist(db, decision);
    return decision;
  },

  /** Idempotent extension-result callback. Never re-posts. */
  async handleExtensionCallback(
    targetId: string,
    input: { callbackId: string; outcome: CallbackOutcome; providerPostId?: string | null },
    ctx: Ctx,
  ): Promise<Decision | { ok: false; error: string }> {
    const db = await client(ctx);
    const row = await loadTargetRow(db, ctx.orgId, targetId);
    if (!row) return { ok: false, error: "not_found" };
    const decision = coreRecordCallback(toTarget(row), {
      callerOrgId: ctx.orgId, now: nowIso(), eventId: newId(), actorId: ctx.actorId ?? null,
      callbackId: input.callbackId, outcome: input.outcome,
    });
    await persist(db, decision, input.providerPostId ?? decision.target.providerPostId);
    return decision;
  },

  /** Authorized manager makes an audited manual decision on an uncertain target. */
  async managerReconcile(
    targetId: string,
    input: { decision: ManagerDecision; isManager: boolean },
    ctx: Ctx,
  ): Promise<Decision | { ok: false; error: string }> {
    const db = await client(ctx);
    const row = await loadTargetRow(db, ctx.orgId, targetId);
    if (!row) return { ok: false, error: "not_found" };
    const decision = coreManagerDecision(toTarget(row), {
      callerOrgId: ctx.orgId, now: nowIso(), eventId: newId(), actorId: ctx.actorId ?? null,
      decision: input.decision, isManager: input.isManager,
    });
    await persist(db, decision);
    return decision;
  },

  /** Attempt one further post on the SAME target. Blocked while awaiting reconcile. */
  async retryTarget(targetId: string, ctx: Ctx): Promise<Decision | { ok: false; error: string }> {
    const db = await client(ctx);
    const row = await loadTargetRow(db, ctx.orgId, targetId);
    if (!row) return { ok: false, error: "not_found" };
    const emergencyActive = await isEmergencyActive(db, ctx.orgId, row.group_id);
    const decision = coreRetry(toTarget(row), {
      callerOrgId: ctx.orgId, now: nowIso(), eventId: newId(), actorId: ctx.actorId ?? null, emergencyActive,
    });
    let providerPostId: string | null | undefined;
    if (decision.providerSubmitRequested) {
      const deliver = ctx.deliver ?? defaultDeliver;
      ({ providerPostId } = await deliver(decision.target));
    }
    await persist(db, decision, providerPostId);
    return decision;
  },

  /** Engage an emergency stop (manager-gated by RLS). Idempotent per active scope. */
  async engageEmergencyStop(
    input: { scope?: "organization" | "group"; scopeId?: string | null; reason?: string },
    ctx: Ctx,
  ): Promise<{ ok: boolean; error?: string }> {
    const db = await client(ctx);
    const { error } = await db.from(CONTROLS as never).insert({
      org_id: ctx.orgId, scope: input.scope ?? "organization", scope_id: input.scopeId ?? null,
      state: "active", reason: input.reason ?? null, created_by: ctx.actorId ?? null,
    } as never);
    if (error && error.code === "23505") return { ok: true }; // already active — idempotent
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  /** Utility for dashboards/tests: is the org/group currently emergency-stopped. */
  async emergencyActive(groupId: string | null, ctx: Ctx): Promise<boolean> {
    const db = await client(ctx);
    return isEmergencyActive(db, ctx.orgId, groupId);
  },
};

export { TERMINAL_STATES };
