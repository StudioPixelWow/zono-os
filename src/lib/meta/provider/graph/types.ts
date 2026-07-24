// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · GRAPH-INTERNAL TYPES. Phase 0.
// ----------------------------------------------------------------------------
// ⛔ BOUNDARY: this directory (src/lib/meta/provider/graph/) is the ONLY place
// Graph-specific shapes, endpoints, versions, raw permission strings, and the
// "access_token" field may appear. Nothing here is exported above the provider;
// consumers see only canonical types. These shapes are declarations for the
// future concrete Graph client — Phase 0 performs NO request.
// ============================================================================

/** Raw Graph node/edge identifiers we will read (kept internal). */
export interface GraphPageNode {
  id: string;
  name?: string;
  category?: string;
  access_token?: string; // ⛔ raw page token — Graph-internal, never surfaced
  tasks?: string[];
  instagram_business_account?: { id: string };
}

export interface GraphBusinessNode {
  id: string;
  name?: string;
  verification_status?: string;
}

export interface GraphInstagramNode {
  id: string;
  username?: string;
  account_type?: string;
  followers_count?: number;
}

/** Raw debug_token response subset (granular scopes discovery). */
export interface GraphDebugTokenData {
  is_valid?: boolean;
  scopes?: string[];
  granular_scopes?: { scope: string; target_ids?: string[] }[];
  expires_at?: number;
}

/** Raw Graph error envelope (normalized away before it can escape). */
export interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/** Raw webhook change entry (parsed only inside the Graph layer). */
export interface GraphWebhookChange {
  field?: string;
  value?: Record<string, unknown>;
}
