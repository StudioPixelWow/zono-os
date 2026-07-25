// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · LISTENING SAFE READ MODELS (PURE). Phase 5.
// ----------------------------------------------------------------------------
// PURE mappers to client-safe DTOs. Canonical, safe fields ARE the product (author
// display, public text, mention kind, match state, status, safe post context,
// intelligence summary, projection state, last-sync). NEVER a token, raw Graph
// payload, raw cursor, webhook body, lease token, idempotency key, trace id, raw
// AI output, or an unsafe provider error.
// ============================================================================
import type { ListeningSourceRow, StoredMention } from "./ports";
import type { FeedRow } from "./feed";

export interface ListeningSourceDTO {
  id: string; platform: string; sourceKind: string; assetId: string; enabled: boolean;
  capabilityState: string; safeBlockReason: string | null; lastPolledAt: string | null; nextPollAt: string | null; lastSyncStatus: string; backfillState: string;
}
export function toSourceDTO(s: ListeningSourceRow): ListeningSourceDTO {
  return { id: s.id, platform: s.platform, sourceKind: s.sourceKind, assetId: s.assetId, enabled: s.enabled, capabilityState: s.capabilityState, safeBlockReason: s.safeBlockReason, lastPolledAt: s.lastPolledAtIso, nextPollAt: s.nextPollAtIso, lastSyncStatus: s.lastSyncStatus, backfillState: s.backfillState };
}

export interface MentionFeedItemDTO {
  id: string; platform: string; mentionKind: string; matchState: string; status: string;
  authorDisplay: string | null; text: string; providerCreatedAt: string | null;
  sentiment: string | null; intent: string | null; urgency: string | null; hasInboxProjection: boolean; sourceId: string;
}
export function toFeedItemDTO(r: FeedRow): MentionFeedItemDTO {
  return { id: r.id, platform: r.platform, mentionKind: r.mentionKind, matchState: r.matchState, status: r.status, authorDisplay: r.authorDisplaySafe, text: r.messageText, providerCreatedAt: r.providerCreatedAt, sentiment: r.sentiment, intent: r.intent, urgency: r.urgency, hasInboxProjection: r.hasInboxProjection, sourceId: r.sourceId };
}

export interface MentionDetailDTO {
  id: string; platform: string; mentionKind: string; matchState: string; status: string;
  authorDisplay: string | null; text: string; attachments: readonly { kind: string; hasMedia: boolean }[]; permalink: string | null;
  providerCreatedAt: string | null; matchedProviderObjectId: string | null; inboxConversationId: string | null; unavailable: boolean;
}
export function toMentionDetailDTO(m: StoredMention): MentionDetailDTO {
  return { id: m.id, platform: m.platform, mentionKind: m.mentionKind, matchState: m.matchState, status: m.status, authorDisplay: m.authorDisplaySafe, text: m.messageText, attachments: m.attachmentsSafe, permalink: m.permalinkSafe, providerCreatedAt: m.providerCreatedAt, matchedProviderObjectId: m.matchedProviderObjectId, inboxConversationId: m.inboxConversationId, unavailable: (m as unknown as { unavailable?: boolean }).unavailable ?? false };
}
