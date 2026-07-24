// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · WEBHOOK INGESTION SERVICE. Phase 3C (server).
// ----------------------------------------------------------------------------
// Orchestrates one trusted delivery: verify the signature over the EXACT raw bytes
// FIRST, then parse → normalize → fingerprint → durably persist (dedup) → match
// via trusted server mappings → enqueue a bounded reconciliation follow-up. The
// org is derived from provider evidence, NEVER the payload. A duplicate delivery
// creates no second row, no second job, no second notification. The acknowledgement
// returned to Meta does NOT imply successful internal processing — the durable
// event row exists before any async work. Raw body / secret / signature never
// leave this boundary or reach a log, DTO, or audit record.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { logAudit } from "@/lib/audit/service";
import { verifyChallenge, verifySignatureDualSecret } from "./verify";
import { normalizeWebhookBody } from "./normalize";
import { withFingerprints } from "./dedup";
import { matchEvent } from "./match";
import { createWebhookStore } from "./store";
import { createSupabaseReconcileStore } from "../reconcile/store";
import * as reconcile from "../reconcile/engine";
import { buildReconcilePorts } from "../reconcile/service";

function secrets(): string[] { return [process.env.META_WEBHOOK_SECRET ?? process.env.META_APP_SECRET ?? "", process.env.META_WEBHOOK_SECRET_PREVIOUS ?? ""].filter(Boolean); }
function appContext(): string { return process.env.META_APP_ID?.trim() || "meta"; }

/** GET subscription challenge. */
export function handleChallenge(params: { mode: string | null; verifyToken: string | null; challenge: string | null }): { ok: boolean; challenge: string | null } {
  return verifyChallenge(params, process.env.META_WEBHOOK_VERIFY_TOKEN ?? null);
}

export interface IngestResult { accepted: boolean; reason: string; processed: number; deduplicated: number; matched: number; unmatched: number }

/** Verify + ingest one webhook delivery. Returns quickly; ack ≠ processing. */
export async function ingestWebhook(rawBody: string | Buffer, signatureHeader: string | null, contentType: string | null): Promise<IngestResult> {
  const sig = verifySignatureDualSecret(rawBody, signatureHeader, secrets(), { contentType });
  if (!sig.ok) {
    // Do NOT log the body/signature — only the safe reason.
    await logAudit({ action: "meta.webhook.signature_rejected", category: "configuration", entityType: "meta_webhook_event", entityId: null, summary: "webhook signature rejected", metadata: { reason: sig.reason } });
    return { accepted: false, reason: sig.reason, processed: 0, deduplicated: 0, matched: 0, unmatched: 0 };
  }
  await logAudit({ action: "meta.webhook.verified", category: "configuration", entityType: "meta_webhook_event", entityId: null, summary: "webhook verified", metadata: {} });

  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody); } catch { return { accepted: true, reason: "malformed_json_acknowledged", processed: 0, deduplicated: 0, matched: 0, unmatched: 0 }; }

  const events = withFingerprints(normalizeWebhookBody(parsed), appContext());
  const store = createWebhookStore();
  const reconStore = createSupabaseReconcileStore();
  const ports = buildReconcilePorts();
  const res: IngestResult = { accepted: true, reason: "ok", processed: 0, deduplicated: 0, matched: 0, unmatched: 0 };

  for (const ev of events) {
    const up = await store.upsertEvent(ev, true);
    if (!up.wasNew) { res.deduplicated++; continue; } // duplicate → no second job/notification
    await logAudit({ action: "meta.webhook.received", category: "configuration", entityType: "meta_webhook_event", entityId: up.id, summary: "webhook event received", metadata: { eventType: ev.eventType } });

    if (ev.eventType === "ignored" || ev.eventType === "unsupported") { await store.setMatch(up.id, { orgId: null, providerObjectId: null, publishTargetId: null, status: "ignored" }); continue; }

    // Match via trusted mappings only (never the payload's org).
    const byObj = ev.externalObjectId ? await store.findProviderObjectByExternalId(ev.externalObjectId) : null;
    const byContainer = ev.externalObjectId ? await store.findProviderObjectByContainerId(ev.externalObjectId) : null;
    const byAsset = ev.assetExternalId ? await store.resolveAsset(ev.assetExternalId) : null;
    const m = matchEvent(ev, { byExternalObjectId: byObj, byContainerId: byContainer, byAsset });
    if (!m.matched) { await store.setMatch(up.id, { orgId: null, providerObjectId: null, publishTargetId: null, status: "unmatched" }); res.unmatched++; await logAudit({ action: "meta.webhook.unmatched", category: "configuration", entityType: "meta_webhook_event", entityId: up.id, summary: "webhook event unmatched (durable, admin-only)", metadata: { eventType: ev.eventType } }); continue; }

    await store.setMatch(up.id, { orgId: m.orgId, providerObjectId: m.providerObjectId, publishTargetId: m.publishTargetId, status: "matched" });
    res.matched++;
    await logAudit({ action: "meta.webhook.matched", category: "configuration", entityType: "meta_webhook_event", entityId: up.id, summary: "webhook event matched", metadata: { eventType: ev.eventType, reason: m.reason } });

    // Append webhook-sourced object-state evidence (a removal is decisive), then
    // enqueue a bounded reconciliation follow-up to confirm via inspection.
    if (m.providerObjectId && m.orgId) {
      const evidenceState = ev.eventType === "object_deleted" ? "deleted" : ev.eventType === "object_hidden" ? "hidden" : ev.eventType === "publish_confirmed" ? "published" : "exists";
      await reconStore.appendObjectState({ id: crypto.randomUUID(), orgId: m.orgId, providerObjectId: m.providerObjectId, observedAtIso: new Date().toISOString(), state: evidenceState as never, visibilityState: null, providerCreatedTime: ev.providerEventTime, providerUpdatedTime: null, permalink: null, externalParentId: ev.externalParentId, evidenceKind: "webhook", sourceEventId: up.id, sourceReconciliationAttemptId: null, contentFingerprint: null, safeMetadata: { changeClass: ev.changeClass } });
      const idem = crypto.createHash("sha256").update(`${m.orgId}|webhook_followup|${m.providerObjectId}|${ev.fingerprint}`).digest("hex");
      await reconcile.scheduleVerification(ports, { orgId: m.orgId, jobKind: "webhook_followup", operationId: m.publishOperationId, targetId: m.publishTargetId, providerObjectId: m.providerObjectId, webhookEventId: up.id, availableAtMs: Date.now(), priority: 40, correlationId: ev.correlationId ?? crypto.randomUUID(), idempotencyKey: idem, reason: `webhook_${ev.eventType}` });
    }
    await store.setMatch(up.id, { orgId: m.orgId, providerObjectId: m.providerObjectId, publishTargetId: m.publishTargetId, status: "processed" });
    res.processed++;
  }
  return res;
}

/** Webhook ingestion health (safe, low-cardinality). */
export async function getWebhookHealth(): Promise<{ lastValidAgeMs: number | null; invalidSignatureRate: number; unmatchedBacklog: number }> {
  const c = await createWebhookStore().healthCounts(Date.now());
  return { lastValidAgeMs: c.lastValidAgeMs, invalidSignatureRate: c.invalidSignatureRate, unmatchedBacklog: c.unmatchedBacklog };
}
