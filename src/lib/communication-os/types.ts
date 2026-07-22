// ============================================================================
// 📡 ZONO OS 2.0 — STAGE 6 · Batch 6.2 · COMMUNICATION OS — canonical model.
//
// THE canonical communication runtime. Every future communication surface reads
// conversations THROUGH this layer, and every channel maps INTO this one model.
// This file defines the model only — no business logic, no AI, no scoring, no
// priorities. All values are FACTS carried verbatim from a channel adapter.
//
// One customer · multiple channels · one communication history.
// ============================================================================

/** Every channel that maps into the canonical model. WhatsApp / Gmail /
 *  Calendar are ADAPTED in this batch; messenger / instagram / sms are declared
 *  interfaces only (no adapter yet) so the model is closed and future-proof. */
export type Channel = "whatsapp" | "gmail" | "calendar" | "messenger" | "instagram" | "sms";

/** The channels with a working adapter in this batch. */
export const ADAPTED_CHANNELS: readonly Channel[] = ["whatsapp", "gmail", "calendar"] as const;

/** Who a participant is. No CRM identity logic lives here — just a role tag. */
export type ParticipantKind = "person" | "broker" | "system";

/** One participant in a conversation. `handle` (phone/email) is null when the
 *  source does not expose it (e.g. WhatsApp stores a phone HASH, never the raw
 *  number) — the model never fabricates a handle. */
export interface Participant {
  id: string;                 // canonical, channel-namespaced participant id
  kind: ParticipantKind;
  displayName: string;
  handle: string | null;      // phone / email / attendee address — or null
  channel: Channel;
}

export type MessageDirection = "inbound" | "outbound" | null;

/** A file carried by a message. Adapters populate this ONLY when the source
 *  exposes attachments; otherwise the list is empty (never invented). */
export interface Attachment {
  id: string;
  kind: string;               // "image" | "document" | "audio" | "event" | ... (source-declared)
  name: string | null;
  mimeType: string | null;
  url: string | null;
  sizeBytes: number | null;
}

/** One canonical message. `preview` is the source body/line VERBATIM — the
 *  runtime never summarizes or rewrites it. */
export interface Message {
  id: string;                 // canonical id: `${channel}:${sourceMessageId}`
  conversationId: string;
  channel: Channel;
  direction: MessageDirection;
  authorId: string | null;    // Participant.id
  sentAt: string;
  preview: string;            // verbatim source text
  attachments: Attachment[];
  read: boolean;
}

/** CRM links are REFERENCES ONLY — opaque ids the adapter copied from the
 *  source. No ownership logic, no CRM data, no resolution happens here. */
export interface CrmLink {
  lead: string | null;
  buyer: string | null;
  seller: string | null;
  journey: string | null;
  deal: string | null;
  property: string | null;
}

/** The five allowed conversation-state flags. Nothing else is a state. */
export type CommunicationStateFlag = "unread" | "waiting" | "archived" | "pinned" | "resolved";

export interface CommunicationState {
  flags: CommunicationStateFlag[];
}

/**
 * Communication Summary — COMPOSITION ONLY. Every field is a fact selected from
 * the conversation/messages: latest message, unread count, last (outbound)
 * reply, waiting status, participant count. NO AI summary, NO interpretation,
 * NO recommendation — those are forbidden by contract and asserted in QA.
 */
export interface CommunicationSummary {
  latestMessagePreview: string | null;
  latestMessageAt: string | null;
  unread: number;
  lastReplyAt: string | null;       // timestamp of the last OUTBOUND message
  waiting: boolean;                 // an inbound message is newer than our last reply
  participantCount: number;
}

/** One canonical conversation — the same shape for every channel. */
export interface Conversation {
  id: string;                       // canonical id: `${channel}:${sourceId}`
  channel: Channel;
  title: string;
  participants: Participant[];
  lastActivityAt: string | null;
  unreadCount: number;
  state: CommunicationState;
  crmLinks: CrmLink;
  attachmentCount: number;
  summary: CommunicationSummary;
}

/**
 * Canonical identity — one customer across many channels/conversations.
 * Built by COMPOSITION (grouping conversations that share a CRM reference), not
 * by any scoring or fuzzy AI matching.
 */
export interface CanonicalPerson {
  personId: string;                 // deterministic canonical key
  displayName: string;
  channels: { channel: Channel; handle: string | null; conversationId: string }[];
}

/** The scope a conversation read runs under. Cross-org isolation is RLS (in the
 *  frozen source services); broker vs manager isolation is applied here from
 *  the caller's own identity — never widened. */
export interface CommunicationScope {
  brokerId: string | null;
  isManager: boolean;
}

/**
 * The contract every channel adapter implements. An adapter maps ONE source
 * into the canonical model and knows nothing about CRM or Journey — it only
 * copies opaque CRM reference ids the source already carries.
 */
export interface ChannelAdapter {
  readonly channel: Channel;
  listConversations(scope: CommunicationScope): Promise<Conversation[]>;
  loadConversation(sourceId: string, scope: CommunicationScope): Promise<Conversation | null>;
  loadMessages(sourceId: string, scope: CommunicationScope): Promise<Message[]>;
}

/** Split a canonical conversation/message id into its channel + source id. */
export function parseCanonicalId(id: string): { channel: Channel; sourceId: string } | null {
  const i = id.indexOf(":");
  if (i <= 0) return null;
  const channel = id.slice(0, i) as Channel;
  return { channel, sourceId: id.slice(i + 1) };
}

/** Build a canonical id from a channel + source id. */
export const canonicalId = (channel: Channel, sourceId: string): string => `${channel}:${sourceId}`;
