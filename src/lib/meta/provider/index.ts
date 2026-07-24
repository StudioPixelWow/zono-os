// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PROVIDER surface. Phase 0.
// ----------------------------------------------------------------------------
// The provider abstraction's public surface. Consumers import the interface,
// operation context, canonical error taxonomy, and the registry from here —
// never from provider/graph/ (that seam is boundary-guarded). Graph specifics
// stay sealed under ./graph.
// ============================================================================
export type {
  MetaProvider,
  MetaOperationContext,
  MetaRateLimitSnapshotView,
} from "./types";
export {
  MetaProviderError,
  isMetaProviderError,
  decideRetry,
  type MetaProviderErrorKind,
  type MetaProviderErrorMeta,
  type MetaErrorStatusCategory,
  type MetaRetryClass,
  type MetaRetryDecision,
  type MetaRateLimitSnapshot,
} from "./errors";
export { MetaProviderRegistry, metaProviderRegistry, activeMetaProviderKey } from "./registry";
// The Graph skeleton is exposed so the default registry can register it; its
// internals (compat/errors/types) remain private to ./graph.
export { graphProviderSkeleton } from "./graph";
