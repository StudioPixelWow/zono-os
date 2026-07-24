// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · GRAPH COMPATIBILITY + VERSION BOUNDARY.
// ----------------------------------------------------------------------------
// ⛔ THE compatibility seam. This file OWNS every Graph specific: the API version,
// endpoint construction, the raw-permission ↔ canonical-capability mapping, and
// status normalization. It is the ONLY module allowed to contain graph.facebook.com,
// endpoint fragments, and raw Meta permission strings. Swapping Graph versions (or
// a future Meta SDK) is a change to THIS directory only — nothing above changes.
//
// Phase 0 constructs NO request and performs NO network I/O; these are pure
// string/version helpers plus the canonical capability mapping table.
// ============================================================================
import type { MetaWebhookTopic } from "../../webhooks/types";

// ── Version selection — the single source of truth for the Graph API version ──
/** The pinned Graph API version. Change here only. */
const GRAPH_API_VERSION = "v23.0";
/** Graph host — confined to this file. */
const GRAPH_HOST = "https://graph.facebook.com";

/** The selected Graph API version (central accessor). */
export function graphApiVersion(): string {
  const override = process.env.META_GRAPH_VERSION?.trim();
  return override && /^v\d+\.\d+$/.test(override) ? override : GRAPH_API_VERSION;
}

/** Construct a versioned Graph endpoint. Endpoint paths live ONLY here. */
export function graphEndpoint(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${GRAPH_HOST}/${graphApiVersion()}${clean}`;
}

/** Canonical asset-discovery edges (raw Graph paths, Graph-internal). */
export const GRAPH_EDGES = {
  businesses: "/me/businesses",
  accounts: "/me/accounts",
  ownedPages: "/owned_pages",
  clientPages: "/client_pages",
} as const;

// ── Raw permission ↔ canonical capability mapping ─────────────────────────────
// The ONLY declaration of raw Meta permission strings. Canonical capability keys
// are what the rest of the system speaks; this table converts between the two.
const CAPABILITY_TO_SCOPES: Record<string, readonly string[]> = {
  "connection.manage": ["pages_show_list", "business_management"],
  "assets.read": ["pages_show_list"],
  "facebook.content.read": ["pages_read_engagement"],
  "facebook.content.publish": ["pages_manage_posts"],
  "instagram.content.read": ["instagram_basic"],
  "instagram.content.publish": ["instagram_content_publish"],
  "facebook.comments.read": ["pages_read_engagement"],
  "facebook.comments.reply": ["pages_manage_engagement"],
  "instagram.comments.read": ["instagram_manage_comments"],
  "instagram.comments.reply": ["instagram_manage_comments"],
  "webhook.health.read": ["pages_show_list"],
  "analytics.basic.read": ["pages_read_engagement"],
  // Extended (declared; disabled by default at the registry level)
  "facebook.reels.publish": ["pages_manage_posts"],
  "facebook.stories.publish": ["pages_manage_posts"],
  "instagram.reels.publish": ["instagram_content_publish"],
  "instagram.stories.publish": ["instagram_content_publish"],
  "facebook.messaging.read": ["pages_messaging"],
  "facebook.messaging.reply": ["pages_messaging"],
  "instagram.messaging.read": ["instagram_manage_messages"],
  "instagram.messaging.reply": ["instagram_manage_messages"],
  "analytics.advanced.read": ["read_insights"],
  "instagram.mentions.read": ["instagram_manage_comments"],
  "instagram.first_comment.publish": ["instagram_content_publish"],
};

/** The raw scopes a canonical capability requires (Graph-internal use). */
export function scopesForCapability(capabilityKey: string): readonly string[] {
  return CAPABILITY_TO_SCOPES[capabilityKey] ?? [];
}

/**
 * Convert a set of GRANTED raw Graph scopes into the canonical capability keys
 * they satisfy. This is how debug_token output becomes a canonical permission
 * snapshot — no raw scope string ever leaves this layer.
 */
export function capabilitiesFromGrantedScopes(grantedScopes: readonly string[]): readonly string[] {
  const granted = new Set(grantedScopes);
  const out: string[] = [];
  for (const [cap, scopes] of Object.entries(CAPABILITY_TO_SCOPES)) {
    if (scopes.length > 0 && scopes.every((s) => granted.has(s))) out.push(cap);
  }
  return out.sort();
}

// ── Webhook topic normalization (raw Graph field → canonical topic) ───────────
const WEBHOOK_FIELD_TO_TOPIC: Record<string, MetaWebhookTopic> = {
  feed: "feed",
  comments: "comments",
  mentions: "mentions",
  messages: "messages",
  message_reactions: "message_reactions",
  permissions: "permissions",
};

/** Normalize a raw Graph webhook field to a canonical topic. */
export function webhookTopicFromField(field: string | undefined): MetaWebhookTopic {
  return (field && WEBHOOK_FIELD_TO_TOPIC[field]) || "unknown";
}

// ── Status normalization (raw Graph verification → canonical) ─────────────────
/** Normalize a raw Graph business verification status to a canonical value. */
export function normalizeVerificationStatus(raw: string | undefined): "verified" | "not_verified" | "pending" | "unknown" {
  switch ((raw || "").toLowerCase()) {
    case "verified":
      return "verified";
    case "not_verified":
    case "failed":
      return "not_verified";
    case "pending":
    case "pending_submission":
    case "pending_review":
      return "pending";
    default:
      return "unknown";
  }
}
