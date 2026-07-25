// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INBOX SAFE READ MODELS. Phase 3.
// ----------------------------------------------------------------------------
// PURE mappers to client-safe DTOs. Canonical conversation fields (participant
// display, safe subject preview, status, unread, assignee, labels) ARE the
// product and are surfaced; but NEVER a token, raw Graph body, signed URL, lease
// token, or a Graph model. No secret ever appears.
// ============================================================================
import type { InboxRow } from "./search";
import type { ConversationFull } from "./ports";

export interface ConversationListItemDTO {
  id: string; platform: string; status: string; unread: boolean; assigneeUserId: string | null; labelIds: readonly string[];
  participantDisplay: string | null; subjectPreview: string; lastActivityAt: string | null; priority: number;
}
export function toConversationListItem(r: InboxRow): ConversationListItemDTO {
  return { id: r.id, platform: r.platform, status: r.status, unread: r.unread, assigneeUserId: r.assigneeUserId, labelIds: r.labelIds, participantDisplay: r.participantDisplay, subjectPreview: r.subjectPreview, lastActivityAt: r.lastActivityAt, priority: r.priority };
}

export interface ConversationDetailDTO {
  id: string; sourceKind: string; platform: string; providerObjectId: string | null; participantDisplay: string | null;
  subjectPreview: string; replyCount: number; status: string; unread: boolean; snoozedUntil: string | null; assigneeUserId: string | null; lastActivityAt: string | null; lastReadAt: string | null; priority: number;
}
export function toConversationDetail(c: ConversationFull): ConversationDetailDTO {
  return { id: c.id, sourceKind: c.sourceKind, platform: c.platform, providerObjectId: c.providerObjectId, participantDisplay: c.participantDisplay, subjectPreview: c.subjectPreview, replyCount: c.replyCount, status: c.status, unread: (c as unknown as { unread?: boolean }).unread ?? false, snoozedUntil: c.snoozedUntil, assigneeUserId: c.assigneeUserId, lastActivityAt: c.lastActivityAt, lastReadAt: c.lastReadAt, priority: c.priority };
}

export interface LabelDTO { id: string; name: string; color: string | null }
export function toLabelDTO(l: { id: string; name: string; color: string | null }): LabelDTO { return { id: l.id, name: l.name, color: l.color }; }
