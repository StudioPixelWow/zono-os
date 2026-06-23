// ============================================================================
// ZONO — Distribution Infrastructure: shared types (client + server safe).
// ----------------------------------------------------------------------------
// The new infra tables (distribution_channels, distribution_publish_jobs) are
// not yet in the generated Supabase Database type, so the services cast through
// `as never` and shape results with the row types declared here.
// ============================================================================

/** Supported publish channels. Extend the union + registry for new integrations. */
export type ChannelKind =
  | "facebook_group"
  | "facebook_page"
  | "facebook_marketplace";

export const CHANNEL_KINDS: ChannelKind[] = [
  "facebook_group",
  "facebook_page",
  "facebook_marketplace",
];

export type ChannelConnectionStatus = "disconnected" | "pending" | "connected" | "error";

/** What a channel can do — drives validation before a job is enqueued. */
export interface ChannelCapabilities {
  publish: boolean;            // can publish a feed post
  schedule: boolean;          // supports native scheduling (vs. ZONO-side scheduling)
  comments: boolean;          // comments can be collected
  marketplaceListing: boolean; // Marketplace-style structured listing
}

/** Lifecycle of a queued publish job. */
export type PublishJobStatus =
  | "queued"     // ready (run_after may be in the future)
  | "claimed"    // leased by a worker
  | "running"    // adapter call in flight
  | "succeeded"  // published
  | "failed"     // failed, retry budget remains
  | "canceled"   // explicitly canceled
  | "dead";      // exhausted retries / non-retryable

// ── Table row shapes ─────────────────────────────────────────────────────────

export interface ChannelRow {
  id: string;
  org_id: string;
  kind: ChannelKind;
  name: string;
  group_id: string | null;
  external_ref: string | null;
  connection_status: ChannelConnectionStatus;
  capabilities: Partial<ChannelCapabilities> & Record<string, unknown>;
  is_enabled: boolean;
  daily_post_limit: number;
  posts_today: number;
  health_score: number;
  last_published_at: string | null;
  last_error: string | null;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PublishJobRow {
  id: string;
  org_id: string;
  post_id: string | null;
  channel_id: string | null;
  campaign_id: string | null;
  schedule_id: string | null;
  channel_kind: ChannelKind;
  status: PublishJobStatus;
  priority: number;
  run_after: string;
  attempts: number;
  max_attempts: number;
  locked_by: string | null;
  locked_at: string | null;
  lease_expires_at: string | null;
  idempotency_key: string | null;
  last_error: string | null;
  result: Record<string, unknown>;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Adapter contracts ────────────────────────────────────────────────────────

/** The content + target a channel adapter needs to publish one post. */
export interface PublishRequest {
  channel: ChannelRow;
  postId: string;
  title: string | null;
  body: string;
  hashtags: string[];
  cta: string | null;
  imageUrl: string | null;
  /** Free-form per-channel hints (e.g. marketplace price/category). */
  context?: Record<string, unknown>;
}

/** Discriminated result of an adapter publish attempt. */
export type PublishOutcome =
  | { status: "published"; externalPostId?: string | null; externalPostUrl?: string | null; raw?: Record<string, unknown> }
  | { status: "not_configured"; message: string }
  | { status: "rate_limited"; retryAfterMs: number; message: string }
  | { status: "error"; retryable: boolean; message: string };

/** A comment as returned by a channel's collection adapter (pre-persistence). */
export interface FetchedComment {
  externalId: string | null;
  authorName: string | null;
  authorExternalId: string | null;
  text: string;
  occurredAt: string | null; // ISO; null → now()
  raw?: Record<string, unknown>;
}

export type FetchCommentsOutcome =
  | { status: "ok"; comments: FetchedComment[] }
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string };

// ── Table-name constants (cast targets) ──────────────────────────────────────
export const TBL = {
  channels: "distribution_channels",
  jobs: "distribution_publish_jobs",
  posts: "distribution_posts",
  schedules: "distribution_schedules",
  comments: "distribution_comments",
  leads: "distribution_leads",
  analytics: "distribution_analytics",
  campaigns: "distribution_campaigns",
} as const;

/** Default lease duration for a claimed job (ms). */
export const DEFAULT_LEASE_MS = 2 * 60_000;
/** Exponential back-off base (ms) per attempt. */
export const BACKOFF_BASE_MS = 30_000;
