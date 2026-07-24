// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · WEBHOOK DEDUPLICATION (PURE). Phase 3C.
// ----------------------------------------------------------------------------
// Deterministic, server-computed dedup. When Meta supplies a stable event id we
// prefer it; otherwise we hash a canonical fingerprint of the MATERIAL fields
// (provider, app/subscription context, asset, object, event type, provider time,
// normalized change) so a replayed or re-ordered delivery collapses to one row —
// while materially different events never collide. Irrelevant field ordering does
// not change the fingerprint (keys are canonicalized). Dedup is global within the
// provider/app context (so unresolved, org-less events still dedup) and remains
// tenant-safe after asset resolution.
// ============================================================================
import { createHash } from "node:crypto";
import type { MetaCanonicalWebhookEvent } from "./types";

/** Canonical fingerprint over the material fields (order-independent). */
export function webhookFingerprint(ev: Pick<MetaCanonicalWebhookEvent, "provider" | "platform" | "eventType" | "assetExternalId" | "externalObjectId" | "externalParentId" | "providerEventTime" | "changeClass">, appContext: string): string {
  const material = {
    provider: ev.provider,
    app: appContext,
    platform: ev.platform ?? "",
    asset: ev.assetExternalId ?? "",
    object: ev.externalObjectId ?? "",
    parent: ev.externalParentId ?? "",
    type: ev.eventType,
    change: ev.changeClass,
    time: ev.providerEventTime ?? "",
  };
  // Stable key order → order-independent hash.
  const canon = Object.keys(material).sort().map((k) => `${k}=${(material as Record<string, string>)[k]}`).join("|");
  return createHash("sha256").update(canon).digest("hex");
}

/** The dedup key: prefer a stable provider event id, else the fingerprint. */
export function webhookDedupKey(ev: MetaCanonicalWebhookEvent, appContext: string): { externalEventId: string | null; fingerprint: string } {
  return { externalEventId: ev.externalEventId, fingerprint: ev.externalEventId ? `evt:${ev.externalEventId}` : webhookFingerprint(ev, appContext) };
}

/** Stamp fingerprints onto a batch of canonical events (server-computed). */
export function withFingerprints(events: readonly MetaCanonicalWebhookEvent[], appContext: string): MetaCanonicalWebhookEvent[] {
  return events.map((e) => ({ ...e, fingerprint: webhookDedupKey(e, appContext).fingerprint }));
}
