// ============================================================================
// ZONO — Distribution Infrastructure barrel.
// ----------------------------------------------------------------------------
// One import surface for the multi-channel Facebook distribution engine:
//
//   Channels   → channel adapters (group / page / marketplace / future) behind a
//                single registry. Adapters are the ONLY API-touching layer.
//   Queue      → durable, leased, retrying work queue (distribution_publish_jobs).
//   Publishing → channel-agnostic orchestrator: adapter → queue + post status.
//   Scheduler  → promotes due schedule slots into the queue (+ recurrence).
//   Analytics  → rolls posts/comments/leads into daily snapshots + live overview.
//   Comments   → collects post comments via adapters, dedupes, persists.
//   Leads      → classifies comments (pure intent engine) → distribution_leads.
//
// Architecture-only: every adapter returns `not_configured`, so no external API
// is called. Wiring a real integration = implement ChannelAdapter + register it;
// the services above never change.
// ============================================================================
export * from "./types";
export { queueService } from "./queue-service";
export { publishingService } from "./publishing-service";
export { scheduler } from "./scheduler";
export { analyticsService } from "./analytics-service";
export { commentCollectionService } from "./comment-collection-service";
export { leadDetectionService } from "./lead-detection-service";
export { detectIntent, extractPhone } from "./lead-intent";
export type { IntentResult, CommentIntent, CommentSentiment } from "./lead-intent";

// Channel layer.
export { getChannelAdapter, listChannelAdapters, capabilitiesFor } from "../channels/registry";
export type { ChannelAdapter } from "../channels/adapter";
