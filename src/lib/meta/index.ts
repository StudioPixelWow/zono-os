// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PUBLIC SURFACE. Phase 0.
// ----------------------------------------------------------------------------
// The single import point for Meta Workspace. Phase 0 exposes contracts and
// boundaries ONLY: canonical domain types, the provider abstraction + registry,
// the capability registry + evaluator, the pure idempotency helper, notification
// event contracts, and the Integration-Center descriptor. No OAuth, no live Graph
// call, no migration, no UI — those arrive in later phases behind these seams.
//
// Graph specifics are sealed under ./provider/graph and are intentionally NOT
// re-exported here (enforced by scripts/check-meta-boundaries.mjs).
// ============================================================================

// ── Shared primitives ──────────────────────────────────────────────────────
export type { Brand, MetaPlatform, MetaScopeGroup, MetaCapabilityClass, MetaTimestamp } from "./types";

// ── Connection + authorization-mode model ──────────────────────────────────
export type {
  MetaConnectionId,
  MetaConnectionStatus,
  MetaConnectionHealth,
  MetaAuthorizationMode,
  MetaTokenKind,
  MetaSecretRef,
  MetaPermissionSnapshot,
  MetaConnectionDescriptor,
} from "./connection/types";
export { authorizationModeInfo, preferredOrgAutomationMode, type MetaAuthorizationModeInfo } from "./connection";

// ── Assets ──────────────────────────────────────────────────────────────────
export type {
  MetaAssetKind,
  MetaAssetStatus,
  MetaAssetRef,
  MetaAssetId,
  MetaBusinessAsset,
  MetaPageAsset,
  MetaInstagramAsset,
  MetaAsset,
  MetaAssetInventory,
} from "./assets/types";
export { assetRef } from "./assets/types";

// ── Capabilities ─────────────────────────────────────────────────────────────
export type {
  MetaCapability,
  MetaCapabilityKey,
  MetaCapabilityRequirement,
  MetaCapabilityState,
  MetaCapabilityDecision,
  MetaCapabilityDenyReason,
  MetaAccessMode,
  MetaKillSwitchDomain,
  MetaVerificationState,
} from "./capability/types";
export {
  META_CAPABILITIES,
  getMetaCapability,
  metaCapabilitiesByClass,
  EXCLUDED_CAPABILITY_KEYS,
  evaluateMetaCapability,
  evaluateMetaCapabilities,
} from "./capability";

// ── Content / media / engagement / webhooks ─────────────────────────────────
export type {
  MetaContentDraft,
  MetaContentTarget,
  MetaContentKind,
  MetaContentStatus,
  MetaPlatformVariant,
  MetaApprovalState,
  MetaContentDraftId,
} from "./content/types";
export type {
  MetaMediaAsset,
  MetaMediaKind,
  MetaMediaStatus,
  MetaMediaRequirement,
  MetaMediaValidationResult,
} from "./media/types";
export type {
  MetaComment,
  MetaCommentStatus,
  MetaEngagementEvent,
  MetaEngagementEventKind,
  MetaReplyProposal,
} from "./engagement/types";
export type {
  MetaWebhookEnvelope,
  MetaWebhookTopic,
  MetaWebhookVerificationResult,
  MetaNormalizedWebhookEvent,
} from "./webhooks/types";

// ── Publishing + idempotency ────────────────────────────────────────────────
export type {
  MetaPublishingRequest,
  MetaPublishingResult,
  MetaPublishingJobState,
  MetaPublishingTargetResult,
  MetaPublishingError,
  MetaIdempotencyKey,
  MetaIdempotencyInput,
} from "./publish/types";
export { createMetaPublishingIdempotencyKey } from "./publish/types";

// ── Provider abstraction (registry + error taxonomy; Graph sealed) ──────────
export type {
  MetaProvider,
  MetaOperationContext,
  MetaRateLimitSnapshotView,
  MetaProviderErrorKind,
  MetaProviderErrorMeta,
  MetaErrorStatusCategory,
  MetaRetryClass,
  MetaRetryDecision,
  MetaRateLimitSnapshot,
} from "./provider";
export {
  MetaProviderError,
  isMetaProviderError,
  decideRetry,
  MetaProviderRegistry,
  metaProviderRegistry,
  activeMetaProviderKey,
  graphProviderSkeleton,
} from "./provider";

// ── Observability / notify / integration contracts ──────────────────────────
export type { MetaMetricName, MetaHealthProbe } from "./observability/types";
export type {
  MetaNotificationEvent,
  MetaNotificationEventName,
  MetaNotificationSeverity,
} from "./notify/types";
export { META_EVENT_NAMES, META_EVENT_SEVERITY, buildMetaNotificationEvent } from "./notify/events";
export type {
  MetaIntegrationDescriptor,
  MetaIntegrationHealth,
  MetaIntegrationDescriptorInput,
} from "./integration/types";
export { getMetaIntegrationDescriptor, buildMetaIntegrationDescriptor } from "./integration/descriptor";

// ── Phase 1 · connection engine surface (pure; server wiring in service.ts) ──
export {
  createSignedState, verifySignedState, metaStateSecret,
  getMetaConnectionConfig, getMetaOperatorFlags,
  completeConnection, inspectConnectionHealth, disconnectConnection,
  buildCapabilityState, gateCapabilities,
  toConnectionDescriptor, withPermissionSnapshot, toBusinessAsset, toPageAsset, toInstagramAsset,
} from "./connection";
export type {
  MetaStatePayload, MetaConnectionConfig, MetaOperatorFlags,
  CompleteConnectionInput, ConnectionEngineResult, HealthResult, CapabilityGateFlags,
  MetaConnectionPorts, MetaStore, SecretCipher, GraphGateway, AuditSink, Clock, IdGen,
} from "./connection";

/** Default registration: bind the non-network Graph skeleton to the registry. */
import { metaProviderRegistry as _registry, graphProviderSkeleton as _graph } from "./provider";
if (!_registry.has(_graph.key)) _registry.register(_graph);
