// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING SAFE READ MODELS (PURE). Phase 6.
// ----------------------------------------------------------------------------
// PURE mappers to client-safe DTOs. Message bodies ARE surfaced (that is the
// product) — but the SERVICE decrypts them server-side first; this module never
// receives a ciphertext or a key. NEVER a token, encryption key, raw Graph payload,
// raw cursor, lease token, idempotency key, or AI output appears in a DTO.
// ============================================================================
import type { ConversationRow, SendRow, DecryptedMessage } from "./ports";
import type { ConvRow } from "./feed";

export interface ConversationListItemDTO { id: string; platform: string; status: string; unread: boolean; assigneeUserId: string | null; participantDisplay: string | null; lastMessageAt: string | null }
export function toConversationListItem(r: ConvRow): ConversationListItemDTO {
  return { id: r.id, platform: r.platform, status: r.status, unread: r.unread, assigneeUserId: r.assigneeUserId, participantDisplay: r.participantDisplaySafe, lastMessageAt: r.lastMessageAt };
}

export interface ConversationDetailDTO { id: string; platform: string; status: string; unread: boolean; assigneeUserId: string | null; participantDisplay: string | null; lastInboundAt: string | null; lastMessageAt: string | null; inboxConversationId: string | null; windowOpen: boolean }
export function toConversationDetail(r: ConversationRow, windowOpen: boolean): ConversationDetailDTO {
  return { id: r.id, platform: r.platform, status: r.status, unread: r.unread, assigneeUserId: r.assigneeUserId, participantDisplay: r.participantDisplaySafe, lastInboundAt: r.lastInboundAt, lastMessageAt: r.lastMessageAt, inboxConversationId: r.inboxConversationId, windowOpen };
}

// The body here is ALREADY decrypted by the service (authorized read) — the mapper
// only shapes it; it never touches ciphertext.
export interface MessageDTO { id: string; direction: string; senderExternalId: string | null; body: string; policyTag: string | null; deliveryState: string | null; providerCreatedAt: string | null }
export function toMessageDTO(m: DecryptedMessage): MessageDTO {
  return { id: m.id, direction: m.direction, senderExternalId: m.senderExternalId, body: m.body, policyTag: m.policyTag, deliveryState: m.deliveryState, providerCreatedAt: m.providerCreatedAt };
}

export interface SendDTO { id: string; approvalState: string; status: string; windowState: string; policyTag: string | null; requestedBy: string | null; approvedBy: string | null; safeErrorKind: string | null }
export function toSendDTO(s: SendRow): SendDTO {
  return { id: s.id, approvalState: s.approvalState, status: s.status, windowState: s.windowState, policyTag: s.policyTag, requestedBy: s.requestedBy, approvedBy: s.approvedBy, safeErrorKind: s.safeErrorKind };
}
