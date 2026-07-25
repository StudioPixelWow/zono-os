// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · SOCIAL LISTENING DOMAIN (PURE). Phase 5.
// ----------------------------------------------------------------------------
// Canonical, provider-neutral listening types. Sources represent ONLY provider-
// permitted connected surfaces (never an arbitrary external target). Mentions are
// canonical public content — no token, raw Graph payload, webhook signature, raw
// cursor, or scraped profile data is ever represented here. Mention kinds + status
// are provider-neutral (no Graph field name leaks into a domain value).
// ============================================================================
import type { MetaPlatform } from "../types";

// A listening source is always bound to a connected asset + a supported surface.
export type ListeningSourceKind = "page_mentions" | "account_mentions" | "tagged_media";
export const SOURCE_KINDS: readonly ListeningSourceKind[] = ["page_mentions", "account_mentions", "tagged_media"];

export type MentionKind = "page_mention" | "account_mention" | "media_tag" | "caption_mention" | "comment_mention" | "tagged_media" | "unknown_supported";
export const MENTION_KINDS: readonly MentionKind[] = ["page_mention", "account_mention", "media_tag", "caption_mention", "comment_mention", "tagged_media", "unknown_supported"];

export type MentionStatus = "new" | "reviewed" | "actionable" | "ignored" | "resolved" | "unavailable";
export const MENTION_STATUSES: readonly MentionStatus[] = ["new", "reviewed", "actionable", "ignored", "resolved", "unavailable"];

export type MatchState = "asset" | "provider_object" | "canonical_mapping" | "parent_child" | "unmatched";
export type SourceCapabilityState = "allowed" | "blocked_capability" | "blocked_token" | "unsupported" | "unknown";
export type EvidenceKind = "provider_webhook" | "provider_poll" | "provider_backfill";

export interface SafeAttachment { kind: string; hasMedia: boolean }

/** A canonical mention (public content projection — never a raw payload). */
export interface MentionRecord {
  platform: MetaPlatform;
  externalMentionId: string;
  mentionKind: MentionKind;
  sourceObjectRef: string | null;
  authorExternalId: string | null;
  authorDisplaySafe: string | null;
  messageText: string;                 // canonical public content, bounded
  attachmentsSafe: readonly SafeAttachment[];
  permalinkSafe: string | null;
  providerCreatedAt: string | null;
  evidenceKind: EvidenceKind;
}

export interface ListeningSourceConfig { note?: string }   // provider-neutral; NO arbitrary target field

export interface MentionFilter {
  sourceId?: string;
  platform?: MetaPlatform;
  mentionKind?: MentionKind;
  matchState?: MatchState | "matched" | "unmatched";
  status?: MentionStatus;
  sentiment?: string;
  intent?: string;
  urgency?: string;
  query?: string;
  sinceIso?: string;
  untilIso?: string;
}
export type MentionSort = "recent" | "oldest";
export interface MentionPage { limit: number; offset: number }

export const MENTION_TEXT_MAX = 2000;
export const isMentionKind = (v: unknown): v is MentionKind => typeof v === "string" && (MENTION_KINDS as readonly string[]).includes(v);
export const isMentionStatus = (v: unknown): v is MentionStatus => typeof v === "string" && (MENTION_STATUSES as readonly string[]).includes(v);
export const isSourceKind = (v: unknown): v is ListeningSourceKind => typeof v === "string" && (SOURCE_KINDS as readonly string[]).includes(v);
