// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · WEBHOOK contracts. Phase 0.
// ----------------------------------------------------------------------------
// Canonical webhook model. The RAW provider payload is confined to an opaque
// envelope handled by the Graph layer; everything above the provider consumes a
// NORMALIZED event only. No raw Graph field names leak into these contracts. No
// webhook route is implemented in Phase 0 — these are shapes/contracts only.
// ============================================================================
import type { MetaAssetRef } from "../assets/types";

/** Canonical webhook topics Meta Workspace cares about. */
export type MetaWebhookTopic =
  | "feed" // posts + comments on a Page/IG object
  | "comments"
  | "mentions"
  | "messages" // Extended: Messenger / IG DM
  | "message_reactions"
  | "permissions" // scope changes / de-authorizations
  | "unknown";

/**
 * An OPAQUE inbound webhook envelope. The raw body stays as an opaque handle
 * that only the Graph layer may parse; nothing above the provider reads it. This
 * keeps raw Graph payload shapes out of every canonical module.
 */
export interface MetaWebhookEnvelope {
  /** Provider delivery id used for dedup — opaque data, not a Graph path. */
  deliveryId: string;
  topic: MetaWebhookTopic;
  /** Opaque reference to the stored raw payload; parsed only inside Graph. */
  rawRef: string;
  receivedAt: string;
}

/** The result of verifying a webhook's signature (computed in Graph). */
export interface MetaWebhookVerificationResult {
  ok: boolean;
  /** Safe reason code when verification fails (no secret material). */
  reason: "valid" | "bad_signature" | "missing_signature" | "unknown_app" | "malformed";
}

/** A canonical, normalized webhook event consumed above the provider. */
export interface MetaNormalizedWebhookEvent {
  deliveryId: string;
  topic: MetaWebhookTopic;
  orgId: string | null;
  asset: MetaAssetRef | null;
  /** A canonical dedup key (org + external id) — never a raw payload field. */
  dedupKey: string;
  /** Canonical event name for downstream routing. */
  eventName: string;
  occurredAt: string;
}

// ── Phase 3C · richer canonical event for reconciliation (additive) ──────────
export type MetaCanonicalEventType =
  | "publish_confirmed" | "object_updated" | "object_deleted" | "object_hidden"
  | "permission_change" | "connection_change" | "ignored" | "unsupported";
export type MetaChangeClass = "created" | "updated" | "removed" | "hidden" | "permission" | "none";
export type MetaMatchConfidence = "high" | "medium" | "low";

/**
 * A provider-neutral canonical webhook event for the reconciliation layer. It
 * carries NO raw Graph field names or payload — only safe, normalized signals for
 * the PUBLISHING lifecycle, provider-object existence/state, and connection /
 * permission impact. Comments / messaging fields normalize to `ignored`/
 * `unsupported` and NEVER activate any comments or messaging feature.
 */
export interface MetaCanonicalWebhookEvent {
  provider: "meta";
  platform: "facebook" | "instagram" | null;
  eventType: MetaCanonicalEventType;
  externalEventId: string | null;
  fingerprint: string;
  externalObjectId: string | null;
  externalParentId: string | null;
  assetExternalId: string | null;
  providerEventTime: string | null;
  changeClass: MetaChangeClass;
  matchConfidence: MetaMatchConfidence;
  sourceWebhookEventId: string | null;
  correlationId: string | null;
}
