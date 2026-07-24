// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PROVIDER INTERFACE. Phase 0.
// ----------------------------------------------------------------------------
// The canonical MetaProvider interface. It DECLARES the full operation surface
// (connection, assets, publishing, comments, engagement, Extended messaging) but
// Phase 0 implements NO live provider call. Every method takes a canonical
// operation context and returns canonical results or throws ONLY MetaProviderError
// — no raw Graph exception, payload, or token may escape. Consumers depend on
// this interface + canonical types, never on the Graph layer.
// ============================================================================
import type { MetaConnectionDescriptor, MetaConnectionId, MetaPermissionSnapshot } from "../connection/types";
import type { MetaAssetInventory, MetaAssetRef, MetaBusinessAsset, MetaPageAsset, MetaInstagramAsset } from "../assets/types";
import type { MetaPublishingRequest, MetaPublishingResult, MetaIdempotencyKey } from "../publish/types";
import type { MetaComment, MetaEngagementEvent } from "../engagement/types";
import type { MetaWebhookTopic } from "../webhooks/types";
import type { MetaCapabilityDecision } from "../capability/types";

/** Re-exported here for provider consumers. */
export type { MetaProviderError, MetaRateLimitSnapshot } from "./errors";

/**
 * The canonical operation context every provider method receives. It carries the
 * tenant scope, the correlation/idempotency identifiers, the capability decision
 * that authorized the call, and an abort/timeout signal. No secret is present —
 * the provider resolves credentials internally from an opaque ref.
 */
export interface MetaOperationContext {
  orgId: string;
  connectionId: MetaConnectionId;
  /** The user performing the action, for audit provenance (may be null). */
  actorId: string | null;
  correlationId: string;
  /** Present for side-effectful operations (publish, reply). */
  idempotencyKey: MetaIdempotencyKey | null;
  /** The capability decision that gated this call (must be `allowed`). */
  capability: MetaCapabilityDecision;
  /** Cooperative cancellation / timeout. */
  signal: AbortSignal | null;
}

/** A rate-limit snapshot the provider may expose (canonical, non-secret). */
export interface MetaRateLimitSnapshotView {
  scope: string;
  used: number;
  limit: number;
  windowStartAt: string;
  resetAtMs: number | null;
}

/**
 * The canonical Meta provider. All methods are async and either resolve with a
 * canonical value or reject with MetaProviderError. Phase 0's only concrete
 * implementation (the Graph skeleton) rejects every external method with
 * `not_implemented`.
 */
export interface MetaProvider {
  /** Stable provider key (e.g. "graph", "test"). */
  readonly key: string;

  // ── Connection & assets ────────────────────────────────────────────────
  validateConnection(ctx: MetaOperationContext): Promise<MetaConnectionDescriptor>;
  inspectTokenState(ctx: MetaOperationContext): Promise<MetaConnectionDescriptor>;
  listBusinesses(ctx: MetaOperationContext): Promise<readonly MetaBusinessAsset[]>;
  listPages(ctx: MetaOperationContext): Promise<readonly MetaPageAsset[]>;
  listInstagramAccounts(ctx: MetaOperationContext): Promise<readonly MetaInstagramAsset[]>;
  inspectGrantedPermissions(ctx: MetaOperationContext): Promise<MetaPermissionSnapshot>;
  discoverAssets(ctx: MetaOperationContext): Promise<MetaAssetInventory>;
  subscribeAssetWebhooks(ctx: MetaOperationContext, asset: MetaAssetRef, topics: readonly MetaWebhookTopic[]): Promise<void>;
  unsubscribeAssetWebhooks(ctx: MetaOperationContext, asset: MetaAssetRef, topics: readonly MetaWebhookTopic[]): Promise<void>;

  // ── Publishing ─────────────────────────────────────────────────────────
  validatePublishingRequest(ctx: MetaOperationContext, req: MetaPublishingRequest): Promise<MetaCapabilityDecision>;
  publish(ctx: MetaOperationContext, req: MetaPublishingRequest): Promise<MetaPublishingResult>;
  inspectPublishingStatus(ctx: MetaOperationContext, requestId: string): Promise<MetaPublishingResult>;
  cancelScheduledPublishing(ctx: MetaOperationContext, requestId: string): Promise<void>;

  // ── Comments & engagement ──────────────────────────────────────────────
  fetchComments(ctx: MetaOperationContext, postRef: string): Promise<readonly MetaComment[]>;
  replyToComment(ctx: MetaOperationContext, commentId: string, text: string): Promise<MetaComment>;
  hideComment(ctx: MetaOperationContext, commentId: string): Promise<void>;
  deleteComment(ctx: MetaOperationContext, commentId: string): Promise<void>;
  fetchPostMetrics(ctx: MetaOperationContext, postRef: string): Promise<readonly MetaEngagementEvent[]>;

  // ── Messaging (EXTENDED — contract only; no CommOS adapter in Phase 0) ──
  /** Normalize a provider inbound message to a canonical shape (contract). */
  normalizeInboundMessage(ctx: MetaOperationContext, rawRef: string): Promise<unknown>;
  /** Send a message (Extended, app-review gated). Contract only in Phase 0. */
  sendMessage(ctx: MetaOperationContext, threadRef: string, text: string): Promise<unknown>;

  // ── Rate-limit introspection (optional, canonical) ─────────────────────
  rateLimitSnapshot?(ctx: MetaOperationContext): Promise<MetaRateLimitSnapshotView>;
}
