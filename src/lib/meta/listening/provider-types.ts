// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · LISTENING PROVIDER CONTRACTS (canonical). Phase 5.
// ----------------------------------------------------------------------------
// The secret-free contracts the sealed listening gateway speaks. Graph endpoints,
// raw fields, paging cursors and version literals live ONLY in provider/graph/
// listening.ts — above the boundary, nothing knows them. This gateway is READ-ONLY:
// it exposes NO write/reply/hide/delete/follow/like/send method. A page returns
// canonical mentions + an opaque cursor + a safe error; transient errors are
// retryable, permanent permission/policy errors are not.
// ============================================================================
import type { CanonicalMention } from "./normalize";
import type { MetaPlatform } from "../types";

export interface ListeningFetchRequest {
  platform: MetaPlatform;
  surface: "page_mentions" | "account_mentions" | "tagged_media";
  assetExternalId: string;
  tokenPlain: string;              // used server-side only, never logged, never surfaced
  cursorRef: string | null;        // opaque continuation (provider-isolated)
  pageLimit: number;               // bounded
  correlationId: string;
}
export interface ListeningFetchError { kind: string; safeMessage: string; providerCodeCategory: string | null; retryClass: string; retryAfterMs: number | null }
export interface ListeningFetchResult {
  ok: boolean;
  mentions: readonly CanonicalMention[];
  nextCursorRef: string | null;    // opaque; null = end of feed
  ambiguous: boolean;              // transient — safe to retry, never recorded as "empty"
  error: ListeningFetchError | null;
}

/** READ-ONLY sealed gateway. There is intentionally NO write surface here. */
export interface ListeningGateway {
  fetchMentions(req: ListeningFetchRequest): Promise<ListeningFetchResult>;
}
