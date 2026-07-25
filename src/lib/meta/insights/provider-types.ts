// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INSIGHT PROVIDER CONTRACTS. Phase 2.
// ----------------------------------------------------------------------------
// The canonical, READ-ONLY request/result the insight engine hands to the sealed
// Graph insights gateway (mirrors the publish/inspect/comments seams). Insights
// are strictly read-only — there is no write path. The token is used inside Graph
// only; NO raw Graph payload, token, or signed URL escapes. A transient failure is
// `ambiguous` (retried on a bounded cadence), never treated as a zero value.
// ============================================================================
import type { MetaPlatform } from "../types";
import type { InsightSubjectKind, InsightSnapshot } from "./domain";

export interface InsightFetchRequest {
  subjectKind: InsightSubjectKind;
  platform: MetaPlatform;
  assetExternalId: string;
  tokenPlain: string;
  objectExternalId: string | null; // required for object insights
  correlationId: string;
  timeoutMs: number;
}

export interface InsightFetchError { kind: string; safeMessage: string; providerCodeCategory: string | null; retryClass: string }

export interface InsightFetchResult {
  ok: boolean;
  snapshots: readonly InsightSnapshot[];
  observedAt: string | null;
  ambiguous: boolean;
  error: InsightFetchError | null;
  warnings: readonly string[];
}

/** The sealed insights gateway the engine depends on (implemented in
 *  provider/graph/insights.ts). Read-only by contract. */
export interface InsightsGateway {
  fetchInsights(req: InsightFetchRequest): Promise<InsightFetchResult>;
}
