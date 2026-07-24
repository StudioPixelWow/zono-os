// ============================================================================
// 🤖 ZONO — Copilot ENRICHMENT cache + orchestration (server-only). Phase 5.
// ----------------------------------------------------------------------------
// Caches enriched outputs in copilot_enrichment, invalidated ONLY when the
// deterministic freshness hash changes. Records the AI audit trail. Enrichment
// is BEST-EFFORT: any failure falls back to the deterministic output and never
// blocks the pipeline. The classification LLM only runs for AMBIGUOUS (low-
// confidence) deterministic classifications — the deterministic result stays the
// source of truth (stored alongside the enriched suggestion + confidence delta).
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/service";
import { enrichText, type EnrichResult } from "./enrich";
import { buildDeterministicRef, type EnrichKind } from "./enrich-core";
import type { CopilotPipelineResult } from "./pipeline";

const sha1 = (s: string) => crypto.createHash("sha1").update(s).digest("hex");
type Db = ReturnType<typeof createServiceRoleClient>;

/** Cache hit only when the stored deterministic hash still matches. */
async function cacheGet(db: Db, orgId: string, ref: string, kind: EnrichKind, detHash: string): Promise<EnrichResult | null> {
  const { data } = await db.from("copilot_enrichment" as never)
    .select("enriched,accepted,validation_status,det_hash,audit").eq("org_id", orgId).eq("conversation_ref", ref).eq("kind", kind).maybeSingle();
  const row = data as { enriched: string; accepted: boolean; validation_status: string; det_hash: string; audit: unknown } | null;
  if (row && row.det_hash === detHash) return { kind, output: row.enriched, accepted: row.accepted, validationStatus: "cache", audit: row.audit as EnrichResult["audit"] };
  return null;
}

async function cachePut(db: Db, orgId: string, ref: string, kind: EnrichKind, detHash: string, deterministic: string, r: EnrichResult, confidenceDelta: number, explanation: string | null, nowIso: string): Promise<void> {
  await db.from("copilot_enrichment" as never).upsert({
    org_id: orgId, conversation_ref: ref, kind, det_hash: detHash, deterministic, enriched: r.output,
    accepted: r.accepted, validation_status: r.validationStatus, confidence_delta: confidenceDelta, explanation, audit: r.audit, updated_at: nowIso,
  } as never, { onConflict: "org_id,conversation_ref,kind" });
}

export interface EnrichConversationResult { summary?: EnrichResult; reply?: EnrichResult; classification?: EnrichResult }

/** Enrich a conversation's deterministic outputs (best-effort, cached). */
export async function enrichConversation(orgId: string, result: CopilotPipelineResult, nowIso: string): Promise<EnrichConversationResult> {
  const db = createServiceRoleClient();
  const ref = result.analysis.ref;
  const out: EnrichConversationResult = {};

  // Summary enrichment (readability only).
  const sText = result.summary.explain.evidence[0] ?? "";
  if (sText) {
    const sHash = sha1(sText);
    out.summary = (await cacheGet(db, orgId, ref, "summary", sHash)) ?? await (async () => {
      const r = await enrichText("summary", orgId, buildDeterministicRef(sText, result.summary.facts));
      await cachePut(db, orgId, ref, "summary", sHash, sText, r, 0, null, nowIso); return r;
    })();
  }

  // Reply enrichment (wording/tone/flow — never intent/facts).
  const reply = result.replies[0];
  if (reply) {
    const rHash = sha1(reply.body);
    out.reply = (await cacheGet(db, orgId, ref, "reply", rHash)) ?? await (async () => {
      const r = await enrichText("reply", orgId, buildDeterministicRef(reply.body, result.summary.facts));
      await cachePut(db, orgId, ref, "reply", rHash, reply.body, r, 0, null, nowIso); return r;
    })();
  }

  // Classification edge-case — LLM only resolves AMBIGUOUS (low-confidence)
  // classifications; the deterministic result remains the source of truth.
  if (result.classification.explain.confidence < 60) {
    const detClass = result.classification.classification;
    const cHash = sha1(detClass + result.analysis.intents.map((i) => i.intent).join(","));
    out.classification = (await cacheGet(db, orgId, ref, "classification", cHash)) ?? await (async () => {
      const r = await enrichText("classification", orgId, buildDeterministicRef(detClass, result.summary.facts));
      const delta = r.accepted ? 0 : 0;   // deterministic remains authoritative; enriched is advisory
      await cachePut(db, orgId, ref, "classification", cHash, detClass, r, delta, r.accepted ? "llm suggestion (advisory)" : "fallback to deterministic", nowIso); return r;
    })();
  }

  await logAudit({
    action: "copilot.enrichment", category: "recommendation", entityType: "conversation", entityId: ref,
    summary: "Copilot LLM enrichment (deterministic authoritative)",
    metadata: { summary: out.summary?.validationStatus, reply: out.reply?.validationStatus, classification: out.classification?.validationStatus },
  });
  return out;
}
