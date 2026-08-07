// ============================================================================
// ZONO -- Creative APPROVED-DISTRIBUTION promotion SERVICE (server-only).
// ----------------------------------------------------------------------------
// The authoritative adapter over the pure core (./creative-promotion-core). It
// loads the creative output, runs the promotion decision, COPIES the approved
// private master into the private creative-published derivative bucket (service
// role), and records the derivative row + append-only ledger event. Idempotent
// (unique index -> 23505 re-read). Hand-off resolution mints a channel/job-scoped
// signed URL from creative-published with a TTL long enough for the human-delayed
// Groups/WhatsApp publication -- the private master is NEVER exposed.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  promote as corePromote, revoke as coreRevoke, resolveForJob,
  PUBLICATION_BUCKET,
  type Channel, type CreativeOutput, type Derivative, type OutputState, type HandoffResult,
} from "./creative-promotion-core";

type DB = Awaited<ReturnType<typeof createClient>>;
const PRIVATE_BUCKET = "creative-private";
const OUTPUTS = "zono_quick_creative_outputs";
const DERIVATIVES = "creative_distribution_derivatives";
const LEDGER = "creative_promotion_events";
// Job-scoped signed access: long enough for a controlled, human-delayed publish
// job (agent posts through the extension hours later), still bounded + revocable.
const JOB_SIGNED_TTL_SEC = 24 * 60 * 60;
const LOG = "[creative-promotion]";

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

interface OutputRow {
  id: string; org_id: string; status: string | null; is_approved: boolean | null;
  private_master_path: string | null; creative_version: number | null; content_hash: string | null;
}

/** Map the persisted output row onto the pure-core state. */
function toOutput(r: OutputRow): CreativeOutput {
  let state: OutputState = "draft";
  if (r.is_approved || r.status === "approved") state = "approved";
  else if (r.status === "rejected") state = "rejected";
  else if (r.status === "archived" || r.status === "deleted") state = "archived";
  else if (r.status === "needs_review" || r.status === "review") state = "needs_review";
  return {
    id: r.id, orgId: r.org_id, state,
    privateMasterPath: r.private_master_path,
    creativeVersion: r.creative_version ?? 1,
    contentHash: r.content_hash,
  };
}

function admin(): DB {
  return createServiceRoleClient() as unknown as DB;
}

/** Copy the approved private master into an immutable private derivative object. */
async function copyMasterToDerivative(masterPath: string, derivativePath: string): Promise<void> {
  const a = admin();
  const dl = await a.storage.from(PRIVATE_BUCKET).download(masterPath);
  if (dl.error || !dl.data) throw new Error(`master unavailable: ${dl.error?.message ?? "no data"}`);
  const bytes = Buffer.from(await dl.data.arrayBuffer());
  const up = await a.storage.from(PUBLICATION_BUCKET).upload(derivativePath, bytes, { contentType: "image/png", upsert: true });
  if (up.error) throw new Error(`derivative copy failed: ${up.error.message}`);
}

export interface PromoteInput {
  orgId: string;
  outputId: string;
  targetChannel: Channel;
  purpose: string;
  actorId: string | null;
  isManager: boolean;
  approvalEvidence?: unknown;
  db?: DB;
}

export interface PromoteResult {
  ok: boolean;
  error?: string;
  derivativeId?: string;
  derivativePath?: string;
  reused?: boolean;
}

/** Promote an approved creative output into an approved distribution derivative. */
export async function promoteForChannel(input: PromoteInput): Promise<PromoteResult> {
  const db = input.db ?? admin();
  const { data } = await db.from(OUTPUTS as never)
    .select("id,org_id,status,is_approved,private_master_path,creative_version,content_hash")
    .eq("id", input.outputId).eq("org_id", input.orgId).maybeSingle();
  const row = data as unknown as OutputRow | null;
  if (!row) return { ok: false, error: "not_found" };
  const output = toOutput(row);

  // Existing ACTIVE derivative for the exact key (idempotency).
  const { data: exData } = await db.from(DERIVATIVES as never)
    .select("*").eq("org_id", input.orgId).eq("output_id", input.outputId)
    .eq("creative_version", output.creativeVersion).eq("target_channel", input.targetChannel)
    .eq("purpose", input.purpose).eq("state", "active").maybeSingle();
  const existing = (exData as unknown as DbDerivative | null);

  const derivativePath = `${input.orgId}/${input.outputId}/v${output.creativeVersion}/${input.targetChannel}.png`;
  const decision = corePromote(output, existing ? fromDb(existing) : null, {
    callerOrgId: input.orgId, targetChannel: input.targetChannel, purpose: input.purpose,
    actorId: input.actorId, isManager: input.isManager, now: nowIso(),
    derivativeId: newId(), eventId: newId(), derivativePath, approvalEvidence: input.approvalEvidence,
  });
  if (!decision.ok) return { ok: false, error: decision.error ?? "denied" };
  if (decision.noop && decision.derivative) {
    return { ok: true, reused: true, derivativeId: decision.derivative.id, derivativePath: decision.derivative.derivativePath };
  }

  const d = decision.derivative!;
  // Copy the master bytes into the immutable private derivative object first.
  try {
    await copyMasterToDerivative(output.privateMasterPath!, d.derivativePath);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "copy_failed" };
  }

  // Persist the derivative row (unique index makes a concurrent burst collapse).
  const { error: insErr } = await db.from(DERIVATIVES as never).insert({
    id: d.id, org_id: d.orgId, output_id: d.outputId, creative_version: d.creativeVersion,
    content_hash: d.contentHash, target_channel: d.targetChannel, purpose: d.purpose,
    source_master_path: d.sourceMasterPath, derivative_path: d.derivativePath, state: "active",
    promoted_by: d.promotedBy, approval_evidence: (input.approvalEvidence ?? null) as never,
  } as never);
  if (insErr && (insErr as { code?: string }).code === "23505") {
    // Concurrent promotion won the race -> re-read and return the existing one.
    const { data: won } = await db.from(DERIVATIVES as never)
      .select("id,derivative_path").eq("org_id", input.orgId).eq("output_id", input.outputId)
      .eq("creative_version", output.creativeVersion).eq("target_channel", input.targetChannel)
      .eq("purpose", input.purpose).eq("state", "active").maybeSingle();
    const w = won as { id: string; derivative_path: string } | null;
    if (w) return { ok: true, reused: true, derivativeId: w.id, derivativePath: w.derivative_path };
    return { ok: false, error: "promote_conflict" };
  }
  if (insErr) return { ok: false, error: insErr.message };

  if (decision.event) {
    await db.from(LEDGER as never).insert({
      id: decision.event.id, org_id: d.orgId, output_id: d.outputId, action: "promote",
      purpose: d.purpose, target_channel: d.targetChannel, distribution_path: d.derivativePath,
      content_hash: d.contentHash, actor_id: d.promotedBy,
      metadata: { creative_version: d.creativeVersion } as never,
    } as never).then(({ error }) => { if (error && error.code !== "23505") console.error(`${LOG} ledger insert: ${error.message}`); });
  }
  return { ok: true, reused: false, derivativeId: d.id, derivativePath: d.derivativePath };
}

interface DbDerivative {
  id: string; org_id: string; output_id: string; creative_version: number; content_hash: string | null;
  target_channel: string; purpose: string; source_master_path: string; derivative_path: string;
  state: string; promoted_by: string | null;
}
function fromDb(r: DbDerivative): Derivative {
  return {
    id: r.id, orgId: r.org_id, outputId: r.output_id, creativeVersion: r.creative_version,
    contentHash: r.content_hash, targetChannel: r.target_channel as Channel, purpose: r.purpose,
    sourceMasterPath: r.source_master_path, derivativePath: r.derivative_path,
    state: r.state as "active" | "revoked", promotedBy: r.promoted_by,
  };
}

export interface HandoffOutcome extends HandoffResult {
  signedUrl: string | null; // channel/job-scoped signed URL to the derivative (never the master)
}

/**
 * Resolve the exact approved derivative a channel job may receive and mint a
 * bounded, job-scoped signed URL for it. Returns an honest blocked state (never
 * a master/draft) when no active matching derivative exists or emergency-stopped.
 */
export async function resolveJobDerivative(input: {
  orgId: string; outputId: string; targetChannel: Channel; creativeVersion: number; emergencyActive: boolean; db?: DB;
}): Promise<HandoffOutcome> {
  const db = input.db ?? admin();
  const { data } = await db.from(DERIVATIVES as never)
    .select("*").eq("org_id", input.orgId).eq("output_id", input.outputId)
    .eq("target_channel", input.targetChannel).eq("state", "active");
  const derivs = ((data ?? []) as unknown as DbDerivative[]).map(fromDb);
  const res = resolveForJob(derivs, {
    callerOrgId: input.orgId, outputId: input.outputId, targetChannel: input.targetChannel,
    creativeVersion: input.creativeVersion, emergencyActive: input.emergencyActive,
  });
  if (!res.ok || !res.derivative) return { ...res, signedUrl: null };
  const { data: signed } = await db.storage.from(PUBLICATION_BUCKET).createSignedUrl(res.derivative.derivativePath, JOB_SIGNED_TTL_SEC);
  return { ...res, signedUrl: signed?.signedUrl ?? null };
}

/** Revoke an active derivative (approval revoked / content materially changed). */
export async function revokeDerivative(input: { orgId: string; derivativeId: string; actorId: string | null; isManager: boolean; db?: DB }): Promise<{ ok: boolean; error?: string }> {
  const db = input.db ?? admin();
  const { data } = await db.from(DERIVATIVES as never).select("*").eq("id", input.derivativeId).eq("org_id", input.orgId).maybeSingle();
  const row = data as unknown as DbDerivative | null;
  if (!row) return { ok: false, error: "not_found" };
  const decision = coreRevoke(fromDb(row), { callerOrgId: input.orgId, actorId: input.actorId, isManager: input.isManager, now: nowIso(), eventId: newId() });
  if (!decision.ok) return { ok: false, error: decision.error ?? "denied" };
  if (decision.noop) return { ok: true };
  await db.from(DERIVATIVES as never).update({ state: "revoked", revoked_at: nowIso() } as never).eq("id", input.derivativeId).eq("org_id", input.orgId);
  if (decision.event) {
    await db.from(LEDGER as never).insert({
      id: decision.event.id, org_id: row.org_id, output_id: row.output_id, action: "revoke",
      purpose: row.purpose, target_channel: row.target_channel, distribution_path: row.derivative_path,
      content_hash: row.content_hash, actor_id: input.actorId,
    } as never);
  }
  return { ok: true };
}
