// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · GRAPH GATEWAY (port bridge). Phase 1.
// ----------------------------------------------------------------------------
// ⛔ BOUNDARY: implements the engine's `GraphGateway` port using the sealed Graph
// OAuth + discovery functions. This is the ONLY adapter that turns canonical port
// calls into real Graph I/O. The fetch implementation is injectable, so QA drives
// the whole engine through a mock transport with no network. No raw Graph literal
// or token shape leaks past this bridge — it returns canonical port DTOs.
// ============================================================================
import type { GraphGateway } from "../../connection/ports";
import type { GraphFetch } from "./client";
import { buildAuthorizeUrl, exchangeCodeForToken, exchangeForLongLived, inspectToken, revokePermissions, type GraphOAuthConfig } from "./oauth";
import { fetchBusinesses, fetchPages, fetchInstagram } from "./discovery";

/** Construct a GraphGateway bound to an OAuth config + (optional) mock transport. */
export function createGraphGateway(cfg: GraphOAuthConfig, fetchImpl?: GraphFetch): GraphGateway {
  return {
    authorizeUrl: (state) => buildAuthorizeUrl(cfg, state),
    exchangeCode: (code) => exchangeCodeForToken(cfg, code, fetchImpl),
    exchangeLongLived: (token) => exchangeForLongLived(cfg, token, fetchImpl),
    inspectToken: (token) => inspectToken(cfg, token, fetchImpl),
    discoverBusinesses: (token) => fetchBusinesses(token, fetchImpl),
    discoverPages: (token) => fetchPages(token, fetchImpl),
    discoverInstagram: (igExternalId, pageTokenPlain, pageExternalId) => fetchInstagram(igExternalId, pageTokenPlain, pageExternalId, fetchImpl),
    revoke: (token) => revokePermissions(token, fetchImpl),
  };
}
