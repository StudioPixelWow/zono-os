// ============================================================================
// ZONO — P4.2: social interaction PRODUCER (server-only).
// The first (and, in v1, only) writer of public.social_interactions. Validates +
// normalizes an untrusted payload, resolves attribution SERVER-SIDE (org-scoped),
// and writes exactly one row with DB-enforced idempotency (the P4.1 partial unique
// index on (organization_id, external_comment_id)). It does NOT create social
// leads, CRM leads, or emit lead.created — scoring/review/conversion stay in their
// existing, review-gated pipeline.
// ============================================================================
import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/server";
import { resolvePostAttribution } from "@/lib/distribution/attribution";
import { normalizeInteractionInput, type RawInteractionInput } from "./ingest-normalize";

/** Dark by default: the ingestion endpoint + producer are inert until enabled. */
export const SOCIAL_INTERACTION_INGEST_ENABLED = process.env.SOCIAL_INTERACTION_INGEST_ENABLED === "1";

type ServiceDb = ReturnType<typeof createServiceRoleClient>;

export interface IngestCtx {
  db: ServiceDb;     // service-role client, created by the authenticated caller
  orgId: string;     // TRUSTED — from authInstance, never from the client
  actorId: string | null;
  instanceId: string;
}

export interface IngestResult {
  id: string | null;
  deduped: boolean;
  attribution: "post" | "unresolved";
}

export type IngestOutcome = { ok: true; result: IngestResult } | { ok: false; error: string };

export async function ingestSocialInteraction(input: RawInteractionInput, ctx: IngestCtx): Promise<IngestOutcome> {
  // 1) Validate + normalize (pure; untrusted input).
  const norm = normalizeInteractionInput(input);
  if (!norm.ok) return { ok: false, error: norm.error };
  const n = norm.value;

  // 2) Resolve attribution server-side. Org ownership is validated inside the
  //    resolver; a missing or foreign-org source post yields null (→ unresolved),
  //    indistinguishably. Client-supplied property/campaign/group are never read.
  const attr = await resolvePostAttribution(n.sourcePostId, ctx.orgId, ctx.db);
  const attribution: "post" | "unresolved" = attr ? "post" : "unresolved";
  const distributionQueueId = attr ? n.sourcePostId : null; // only link when it validated to OUR org

  // 3) Build the row. org_id is trusted (ctx); server-resolved attribution values
  //    are written LAST into raw_payload so any client-supplied same-named keys are
  //    overridden and can never be trusted.
  const row = {
    organization_id: ctx.orgId,
    platform: n.platform,
    interaction_type: n.interactionType,
    external_comment_id: n.externalCommentId,
    external_post_id: n.externalPostId,
    external_post_url: n.externalPostUrl,
    person_name: n.personName,
    profile_url: n.profileUrl,
    message_text: n.messageText,
    property_id: attr?.propertyId ?? null,
    distribution_queue_id: distributionQueueId,
    status: "new",
    raw_payload: {
      ...n.rawPayload,
      attribution,
      campaign_id: attr?.campaignId ?? null,
      group_id: attr?.groupId ?? null,
      source_post_id: distributionQueueId,
    },
  };

  // 4) Insert with DB-enforced idempotency via the P4.1 partial unique index.
  //    PostgREST .upsert() cannot target a partial index (it emits ON CONFLICT
  //    without the required predicate), so we INSERT and catch unique_violation
  //    (23505). Concurrent duplicates: one insert wins, the other gets 23505 and
  //    is resolved to the existing row — race-safe, single row guaranteed.
  let id: string | null = null;
  let deduped = false;
  const ins = await ctx.db.from("social_interactions" as never).insert(row as never).select("id").single();
  if (!ins.error) {
    id = (ins.data as unknown as { id: string }).id;
  } else if (ins.error.code === "23505" && n.externalCommentId) {
    deduped = true;
    const ex = await ctx.db.from("social_interactions" as never)
      .select("id")
      .eq("organization_id", ctx.orgId)
      .eq("external_comment_id", n.externalCommentId)
      .maybeSingle();
    id = (ex.data as unknown as { id: string } | null)?.id ?? null;
  } else {
    return { ok: false, error: "db_error" };
  }

  // 5) Audit (best-effort). logAudit() is session-based and cannot run in this
  //    instance-authed context, so we write a scoped audit_log row directly with
  //    the instance's org/actor. Never blocks ingestion.
  try {
    await ctx.db.from("audit_log" as never).insert({
      organization_id: ctx.orgId,
      actor_id: ctx.actorId,
      actor_name: null,
      action: "social_interaction.ingested",
      category: "system",
      entity_type: "social_interaction",
      entity_id: id,
      summary: `${deduped ? "deduped" : "ingested"} · ${attribution}`,
      metadata: { instanceId: ctx.instanceId, attribution, deduped, interactionType: n.interactionType },
    } as never);
  } catch { /* best-effort audit — never blocks the ingest */ }

  return { ok: true, result: { id, deduped, attribution } };
}
