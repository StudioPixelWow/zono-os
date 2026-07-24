// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · GRAPH PROVIDER SKELETON. Phase 0.
// ----------------------------------------------------------------------------
// A NON-NETWORK skeleton that satisfies the MetaProvider contract so the registry
// and capability wiring can be validated end-to-end WITHOUT any external call.
// Every external operation throws MetaProviderError.notImplemented — no fetch, no
// Graph request is issued in Phase 0. The concrete Graph client lands in later
// phases inside this same directory; nothing above the provider changes then.
//
// This file may reference the Graph compat helpers (version/endpoint) — they are
// pure and Graph-owned — but it constructs NO request and reaches NO network.
// ============================================================================
import type { MetaProvider, MetaOperationContext } from "../types";
import type { MetaConnectionDescriptor, MetaPermissionSnapshot } from "../../connection/types";
import type { MetaAssetInventory, MetaBusinessAsset, MetaPageAsset, MetaInstagramAsset } from "../../assets/types";
import type { MetaPublishingResult } from "../../publish/types";
import type { MetaComment, MetaEngagementEvent } from "../../engagement/types";
import type { MetaCapabilityDecision } from "../../capability/types";
import { MetaProviderError } from "../errors";
import { graphApiVersion } from "./compat";

/** Guard: assert Phase-0 provider has no live implementation for an op. */
function ni(op: string, ctx: MetaOperationContext): never {
  throw MetaProviderError.notImplemented(op, ctx?.correlationId ?? null);
}

/**
 * The Graph provider skeleton. `key` is stable ("graph"); every external method
 * rejects with `not_implemented`. It performs no I/O — proven by QA A4/A5 and the
 * boundary guard (no fetch / model endpoint under the Meta module). Trailing
 * arguments are intentionally omitted from these stub signatures (the interface
 * remains satisfied structurally) since nothing is done with them yet.
 */
export const graphProviderSkeleton: MetaProvider = {
  key: "graph",

  async validateConnection(ctx): Promise<MetaConnectionDescriptor> {
    return ni("validateConnection", ctx);
  },
  async inspectTokenState(ctx): Promise<MetaConnectionDescriptor> {
    return ni("inspectTokenState", ctx);
  },
  async listBusinesses(ctx): Promise<readonly MetaBusinessAsset[]> {
    return ni("listBusinesses", ctx);
  },
  async listPages(ctx): Promise<readonly MetaPageAsset[]> {
    return ni("listPages", ctx);
  },
  async listInstagramAccounts(ctx): Promise<readonly MetaInstagramAsset[]> {
    return ni("listInstagramAccounts", ctx);
  },
  async inspectGrantedPermissions(ctx): Promise<MetaPermissionSnapshot> {
    return ni("inspectGrantedPermissions", ctx);
  },
  async discoverAssets(ctx): Promise<MetaAssetInventory> {
    return ni("discoverAssets", ctx);
  },
  async subscribeAssetWebhooks(ctx): Promise<void> {
    return ni("subscribeAssetWebhooks", ctx);
  },
  async unsubscribeAssetWebhooks(ctx): Promise<void> {
    return ni("unsubscribeAssetWebhooks", ctx);
  },

  async validatePublishingRequest(ctx): Promise<MetaCapabilityDecision> {
    return ni("validatePublishingRequest", ctx);
  },
  async publish(ctx): Promise<MetaPublishingResult> {
    return ni("publish", ctx);
  },
  async inspectPublishingStatus(ctx): Promise<MetaPublishingResult> {
    return ni("inspectPublishingStatus", ctx);
  },
  async cancelScheduledPublishing(ctx): Promise<void> {
    return ni("cancelScheduledPublishing", ctx);
  },

  async fetchComments(ctx): Promise<readonly MetaComment[]> {
    return ni("fetchComments", ctx);
  },
  async replyToComment(ctx): Promise<MetaComment> {
    return ni("replyToComment", ctx);
  },
  async hideComment(ctx): Promise<void> {
    return ni("hideComment", ctx);
  },
  async deleteComment(ctx): Promise<void> {
    return ni("deleteComment", ctx);
  },
  async fetchPostMetrics(ctx): Promise<readonly MetaEngagementEvent[]> {
    return ni("fetchPostMetrics", ctx);
  },

  async normalizeInboundMessage(ctx): Promise<unknown> {
    return ni("normalizeInboundMessage", ctx);
  },
  async sendMessage(ctx): Promise<unknown> {
    return ni("sendMessage", ctx);
  },
};

/** The pinned Graph version, surfaced for diagnostics only (no request made). */
export function graphSkeletonVersion(): string {
  return graphApiVersion();
}

// ── Phase 1 · live Graph boundary (OAuth + discovery via the gateway port) ───
// The connection engine performs real Graph I/O ONLY through this bridge; all
// Graph literals + token shapes stay sealed in this directory.
export { createGraphGateway } from "./gateway";
export type { GraphOAuthConfig } from "./oauth";
export type { GraphFetch } from "./client";
