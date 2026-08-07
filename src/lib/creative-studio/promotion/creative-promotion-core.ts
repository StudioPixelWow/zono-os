// ============================================================================
// ZONO -- Creative APPROVED-DISTRIBUTION promotion: PURE core (no IO, no clock).
// ----------------------------------------------------------------------------
// Encodes the promotion + hand-off contract as pure functions so it is fully
// unit-testable with mocks (no Supabase, no storage). The private master is
// NEVER made public: promotion COPIES an approved master into an immutable,
// versioned distribution derivative (creative-published, private) keyed by
// (org, output, creative_version, channel, purpose). Groups/WhatsApp/export read
// ONLY an active derivative matching their exact job/version.
//
// Idempotency: promoting the same key returns the existing derivative (no copy,
// no duplicate ledger event). Version invalidation: a new creative_version is a
// new key, so the old derivative stays as historical evidence and a fresh
// promotion is required; job resolution is version-scoped.
// ============================================================================

export type OutputState = "draft" | "needs_review" | "approved" | "rejected" | "archived";
export type Channel = "facebook_groups" | "whatsapp" | "export";
export type DerivativeState = "active" | "revoked";

export const PROMOTABLE_CHANNELS: Channel[] = ["facebook_groups", "whatsapp", "export"];
/** Distribution derivatives live in this PRIVATE bucket -- never the master's. */
export const PUBLICATION_BUCKET = "creative-published";

export interface CreativeOutput {
  id: string;
  orgId: string;
  state: OutputState;
  privateMasterPath: string | null;
  creativeVersion: number;
  contentHash: string | null;
}

export interface Derivative {
  id: string;
  orgId: string;
  outputId: string;
  creativeVersion: number;
  contentHash: string | null;
  targetChannel: Channel;
  purpose: string;
  sourceMasterPath: string; // lineage back to the private master
  derivativePath: string; // object path in creative-published (private)
  state: DerivativeState;
  promotedBy: string | null;
}

export interface LedgerEvent {
  id: string;
  orgId: string;
  outputId: string;
  action: "promote" | "revoke";
  targetChannel: Channel;
  purpose: string;
  creativeVersion: number;
  contentHash: string | null;
  derivativePath: string;
  actorId: string | null;
  occurredAt: string;
}

export interface PromotionDecision {
  ok: boolean;
  noop: boolean; //           idempotent: returned the existing derivative
  error: string | null; //    machine code when ok === false
  copyRequested: boolean; //  caller must copy master -> derivativePath (once)
  derivative: Derivative | null;
  event: LedgerEvent | null;
}

interface PromoteCtx {
  callerOrgId: string;
  targetChannel: Channel;
  purpose: string;
  actorId: string | null;
  isManager: boolean;
  now: string;
  derivativeId: string; //   id for a NEW derivative
  eventId: string; //         id for a NEW ledger event
  derivativePath: string; //  server-computed target path in creative-published
  approvalEvidence?: unknown;
}

function fail(error: string): PromotionDecision {
  return { ok: false, noop: false, error, copyRequested: false, derivative: null, event: null };
}

/**
 * Promote an APPROVED creative master into an immutable versioned distribution
 * derivative for one channel/purpose. `existingForKey` is the current ACTIVE
 * derivative for the EXACT (org, output, version, channel, purpose) key, if any.
 */
export function promote(
  output: CreativeOutput,
  existingForKey: Derivative | null,
  ctx: PromoteCtx,
): PromotionDecision {
  // Cross-org: the output must belong to the caller's org.
  if (output.orgId !== ctx.callerOrgId) return fail("cross_org_rejected");
  if (!PROMOTABLE_CHANNELS.includes(ctx.targetChannel)) return fail("bad_channel");
  if (!ctx.isManager) return fail("not_authorized");

  // Only APPROVED outputs may be promoted.
  if (output.state === "rejected") return fail("rejected_not_promotable");
  if (output.state === "archived") return fail("archived_not_promotable");
  if (output.state !== "approved") return fail("not_approved");
  if (!output.privateMasterPath) return fail("no_master");

  // Idempotency: an existing ACTIVE derivative for this exact key (same version)
  // is returned unchanged -- no second copy, no duplicate ledger event. A cross-
  // org existing row is refused defensively.
  if (existingForKey) {
    if (existingForKey.orgId !== ctx.callerOrgId) return fail("cross_org_rejected");
    if (
      existingForKey.state === "active" &&
      existingForKey.creativeVersion === output.creativeVersion &&
      existingForKey.targetChannel === ctx.targetChannel &&
      existingForKey.purpose === ctx.purpose
    ) {
      return { ok: true, noop: true, error: null, copyRequested: false, derivative: existingForKey, event: null };
    }
  }

  // New derivative for this (version, channel, purpose). Old-version derivatives
  // are left as historical evidence; this key did not exist yet.
  const derivative: Derivative = {
    id: ctx.derivativeId,
    orgId: output.orgId,
    outputId: output.id,
    creativeVersion: output.creativeVersion,
    contentHash: output.contentHash,
    targetChannel: ctx.targetChannel,
    purpose: ctx.purpose,
    sourceMasterPath: output.privateMasterPath,
    derivativePath: ctx.derivativePath,
    state: "active",
    promotedBy: ctx.actorId,
  };
  const event: LedgerEvent = {
    id: ctx.eventId,
    orgId: output.orgId,
    outputId: output.id,
    action: "promote",
    targetChannel: ctx.targetChannel,
    purpose: ctx.purpose,
    creativeVersion: output.creativeVersion,
    contentHash: output.contentHash,
    derivativePath: ctx.derivativePath,
    actorId: ctx.actorId,
    occurredAt: ctx.now,
  };
  return { ok: true, noop: false, error: null, copyRequested: true, derivative, event };
}

/** Revoke an active derivative (e.g. approval revoked / content changed). */
export function revoke(
  derivative: Derivative,
  ctx: { callerOrgId: string; actorId: string | null; isManager: boolean; now: string; eventId: string },
): PromotionDecision {
  if (derivative.orgId !== ctx.callerOrgId) return fail("cross_org_rejected");
  if (!ctx.isManager) return fail("not_authorized");
  if (derivative.state !== "active") {
    return { ok: true, noop: true, error: null, copyRequested: false, derivative, event: null };
  }
  const next: Derivative = { ...derivative, state: "revoked" };
  const event: LedgerEvent = {
    id: ctx.eventId,
    orgId: derivative.orgId,
    outputId: derivative.outputId,
    action: "revoke",
    targetChannel: derivative.targetChannel,
    purpose: derivative.purpose,
    creativeVersion: derivative.creativeVersion,
    contentHash: derivative.contentHash,
    derivativePath: derivative.derivativePath,
    actorId: ctx.actorId,
    occurredAt: ctx.now,
  };
  return { ok: true, noop: false, error: null, copyRequested: false, derivative: next, event };
}

export interface HandoffResult {
  ok: boolean;
  blocked: boolean; //     honest blocked/preflight state (never silently omit)
  reason: string | null;
  derivative: Derivative | null;
}

/**
 * Resolve the EXACT approved derivative a channel job may receive. Returns only
 * an active derivative that matches the job's org, channel and creative_version.
 * Never returns a master path or a draft; a missing/mismatched/revoked derivative
 * or an active emergency stop is an honest BLOCKED state, not a silent omission.
 */
export function resolveForJob(
  derivatives: Derivative[],
  ctx: { callerOrgId: string; outputId: string; targetChannel: Channel; creativeVersion: number; emergencyActive: boolean },
): HandoffResult {
  if (ctx.emergencyActive) return { ok: false, blocked: true, reason: "emergency_stop_active", derivative: null };
  const match = derivatives.find(
    (d) =>
      d.state === "active" &&
      d.orgId === ctx.callerOrgId &&
      d.outputId === ctx.outputId &&
      d.targetChannel === ctx.targetChannel &&
      d.creativeVersion === ctx.creativeVersion,
  );
  if (!match) return { ok: false, blocked: true, reason: "no_approved_derivative", derivative: null };
  return { ok: true, blocked: false, reason: null, derivative: match };
}
