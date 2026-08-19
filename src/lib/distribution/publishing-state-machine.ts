// ============================================================================
// ZONO — Facebook Groups: canonical publishing state machine (server-only).
// ----------------------------------------------------------------------------
// ONE source of truth for the per-group execution lifecycle on distribution_posts
// (the canonical child of distribution_campaigns). Every state change goes through
// transitionPost(), which validates the transition, writes distribution_posts, and
// appends an immutable distribution_publish_events row. Claiming is delegated to
// the DB function claim_next_distribution_post (FOR UPDATE SKIP LOCKED) so two
// workers/instances can NEVER receive the same post.
//
// Reuses existing tables (no new queue, no parallel model):
//   distribution_posts            — canonical per-group execution/result
//   distribution_publish_events   — append-only audit (target_id → posts)
//   distribution_publish_controls — emergency stop (org / scope)
// ============================================================================
import "server-only";
import crypto from "node:crypto";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any; // service-role Supabase client (distribution_* tables are untyped)

// ── Canonical per-destination lifecycle ──────────────────────────────────────
export const PUBLISH_STATES = [
  "draft",
  "queued",
  "scheduled",
  "dispatching",            // claimed by an extension instance, awaiting human action
  "awaiting_confirmation",  // human is publishing in FB; result not yet reported
  "awaiting_reconciliation",// ambiguous (lost ack) — MUST NOT be resubmitted
  "published",
  "failed",
  "paused",
  "cancelled",
  "dead_letter",
] as const;
export type PublishState = (typeof PUBLISH_STATES)[number];

const TERMINAL: ReadonlySet<PublishState> = new Set(["published", "cancelled", "dead_letter"]);

/** The only legal transitions. Anything else is rejected centrally. */
export const VALID_TRANSITIONS: Record<PublishState, PublishState[]> = {
  draft: ["queued", "scheduled", "cancelled", "paused"],
  queued: ["dispatching", "scheduled", "paused", "cancelled"],
  scheduled: ["queued", "dispatching", "paused", "cancelled"],
  dispatching: ["awaiting_confirmation", "published", "failed", "awaiting_reconciliation", "cancelled", "paused", "queued"],
  awaiting_confirmation: ["published", "failed", "awaiting_reconciliation", "cancelled"],
  awaiting_reconciliation: ["published", "failed", "cancelled"], // resolved ONLY by explicit decision
  failed: ["queued", "scheduled", "dead_letter", "cancelled"],   // retry re-queues
  paused: ["queued", "scheduled", "cancelled"],
  published: [],
  cancelled: [],
  dead_letter: ["queued"], // manual revival only
};

export function isTerminal(state: PublishState): boolean {
  return TERMINAL.has(state);
}
export function canTransition(from: PublishState, to: PublishState): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

// ── Deterministic identity: content hash + idempotency key ───────────────────
export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** Content fingerprint — identical (text, image, destination) ⇒ identical hash. */
export function buildContentHash(parts: { text: string; imageUrl?: string | null; destinationId?: string | null }): string {
  return sha256Hex([parts.text ?? "", parts.imageUrl ?? "", parts.destinationId ?? ""].join(""));
}

/**
 * Deterministic idempotency key for ONE intended publication of one content/creative
 * version to one destination within one schedule instance. A duplicate dispatch with
 * the same identity collides on uq_dposts_org_idem and is treated as an existing no-op.
 */
export function buildIdempotencyKey(p: {
  orgId: string; campaignId?: string | null; propertyId?: string | null;
  destinationId?: string | null; groupId?: string | null; contentHash: string;
  creativeVersion?: string | number | null; scheduleKey?: string | null;
}): string {
  return sha256Hex([
    p.orgId, p.campaignId ?? "", p.propertyId ?? "", p.destinationId ?? p.groupId ?? "",
    p.contentHash, String(p.creativeVersion ?? ""), p.scheduleKey ?? "",
  ].join(""));
}

// ── Emergency stop ───────────────────────────────────────────────────────────
/** True if an org-wide emergency stop is active (also enforced inside the claim fn). */
export async function isOrgEmergencyActive(db: Db, orgId: string): Promise<boolean> {
  const { data } = await db.from("distribution_publish_controls")
    .select("id").eq("org_id", orgId).eq("state", "active")
    .in("scope", ["all", "organization", "org"]).limit(1);
  return Array.isArray(data) && data.length > 0;
}

// ── Atomic claim (delegates to the DB function) ──────────────────────────────
export interface ClaimedPost {
  id: string; org_id: string; campaign_id: string | null; group_id: string | null;
  property_id: string | null; post_text: string | null; hashtags: string[] | null;
  image_url: string | null; image_urls: ClaimedMediaItem[] | null; external_destination_url: string | null;
  creative_output_id: string | null; creative_version: number | null;
  metadata: Record<string, unknown> | null; publish_state: string | null;
}
/** One persisted media item on a claimed post (jsonb element of distribution_posts.image_urls). */
export interface ClaimedMediaItem {
  kind: string; url: string; creativeOutputId: string | null; creativeVersion: number | null; source?: string;
}
/** Claim ONE eligible post for ONE instance. Returns null when nothing is claimable. */
export async function claimNextPost(db: Db, args: { orgId: string; userId: string; instanceId: string; leaseSeconds?: number }): Promise<ClaimedPost | null> {
  const { data, error } = await db.rpc("claim_next_distribution_post", {
    p_org: args.orgId, p_user: args.userId, p_instance: args.instanceId, p_lease_seconds: args.leaseSeconds ?? 300,
  });
  if (error) { console.error("[publishing-sm] claim failed:", error.message); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.id) return null;
  return row as ClaimedPost;
}

// ── Central transition ───────────────────────────────────────────────────────
export interface TransitionInput {
  postId: string; orgId: string;
  from: PublishState; to: PublishState;
  kind: string;                 // event kind, e.g. "claim" | "publish_result" | "retry" | "pause"
  actorId?: string | null;
  callbackId?: string | null;   // dedupes provider/extension callbacks (uq_dpe_callback)
  reason?: string | null;
  patch?: Record<string, unknown>; // extra distribution_posts column updates
}
export interface TransitionResult { ok: boolean; error?: string }

/**
 * Validate + apply a lifecycle transition: guarded UPDATE on distribution_posts
 * (only if it is still in `from`), then an append-only event. Terminal states stamp
 * completed_at; awaiting_reconciliation clears the lease so the ambiguous post is
 * never re-claimed.
 */
export async function transitionPost(db: Db, input: TransitionInput): Promise<TransitionResult> {
  const { postId, orgId, from, to } = input;
  if (!canTransition(from, to)) {
    return { ok: false, error: `illegal transition ${from} → ${to}` };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { publish_state: to, updated_at: now, ...(input.patch ?? {}) };
  if (to === "awaiting_reconciliation") { patch.reconciled_at = null; patch.lease_expires_at = null; patch.locked_by = null; }
  if (to === "paused") patch.paused_at = now;
  if (isTerminal(to)) { patch.terminal = true; patch.completed_at = now; }
  if (to === "dead_letter") patch.dead_lettered_at = now;

  const { data: updated, error: upErr } = await db.from("distribution_posts")
    .update(patch)
    .eq("id", postId).eq("org_id", orgId)
    .or(`publish_state.eq.${from},publish_state.is.null`)
    .select("id").maybeSingle();
  if (upErr) return { ok: false, error: upErr.message };
  if (!updated) return { ok: false, error: `post not in expected state ${from}` };

  const { error: evErr } = await db.from("distribution_publish_events").insert({
    org_id: orgId, target_id: postId, from_state: from, to_state: to,
    kind: input.kind, actor_id: input.actorId ?? null,
    callback_id: input.callbackId ?? null, reason: input.reason ?? null,
  });
  if (evErr && !/duplicate key/i.test(evErr.message)) {
    console.error("[publishing-sm] event insert failed:", evErr.message);
  }
  return { ok: true };
}
