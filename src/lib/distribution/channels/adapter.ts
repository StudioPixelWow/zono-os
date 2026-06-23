// ============================================================================
// ZONO — Channel adapter contract.
// ----------------------------------------------------------------------------
// Every distribution channel (Facebook group / page / marketplace / future)
// implements this interface. Adapters are the ONLY place that would ever talk to
// an external API — the services above them stay channel-agnostic. In this
// architecture phase all adapters are stubs returning `not_configured`, so no
// network calls happen and nothing can leak credentials.
// ============================================================================
import "server-only";
import type {
  ChannelKind, ChannelCapabilities, ChannelRow,
  PublishRequest, PublishOutcome, FetchCommentsOutcome,
} from "../infrastructure/types";

export interface ChannelAdapter {
  readonly kind: ChannelKind;
  /** Static capabilities for this channel kind. */
  readonly capabilities: ChannelCapabilities;
  /** Human label (Hebrew) for UI. */
  readonly label: string;

  /** Validate that a channel row is publish-ready; returns null when ok. */
  validate(channel: ChannelRow): string | null;
  /** Publish one post. Stub → not_configured. */
  publish(req: PublishRequest): Promise<PublishOutcome>;
  /** Collect comments for a published post. Stub → not_configured. */
  fetchComments(channel: ChannelRow, postId: string): Promise<FetchCommentsOutcome>;
}

/** Shared "integration not wired yet" outcomes — keeps every stub identical. */
export function notConfigured(label: string): PublishOutcome {
  return { status: "not_configured", message: `${label}: אינטגרציה רשמית טרם חוברה — ארכיטקטורה בלבד.` };
}
export function commentsNotConfigured(label: string): FetchCommentsOutcome {
  return { status: "not_configured", message: `${label}: איסוף תגובות טרם חובר.` };
}

/** Base validator: channel must be enabled and marked connected. */
export function baseValidate(channel: ChannelRow, label: string): string | null {
  if (!channel.is_enabled) return `${label} מושבת`;
  if (channel.connection_status !== "connected") return `${label} לא מחובר (${channel.connection_status})`;
  return null;
}
