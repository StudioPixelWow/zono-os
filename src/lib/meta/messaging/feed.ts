// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING CONVERSATION FEED (PURE). Phase 6.
// ----------------------------------------------------------------------------
// Deterministic filter / sort / paginate over DM conversation rows. Text search is
// over the participant display ONLY — never over a (sensitive, encrypted) message
// body. The store applies the same predicates in SQL; this pure module is the shared
// source of truth (and drives QA). No token, no ciphertext, no raw payload.
// ============================================================================
import type { ConversationFilter, ConversationSort, ConversationPage } from "./domain";

export interface ConvRow {
  id: string; platform: "facebook" | "instagram"; status: string; assigneeUserId: string | null; unread: boolean;
  participantDisplaySafe: string | null; lastMessageAt: string | null;
}

export function matchesFilter(row: ConvRow, f: ConversationFilter): boolean {
  if (f.platform && row.platform !== f.platform) return false;
  if (f.status && row.status !== f.status) return false;
  if (f.assigneeUserId !== undefined) { if (f.assigneeUserId === null ? row.assigneeUserId !== null : row.assigneeUserId !== f.assigneeUserId) return false; }
  if (f.unreadOnly && !row.unread) return false;
  if (f.query && f.query.trim()) { if (!`${row.participantDisplaySafe ?? ""}`.toLowerCase().includes(f.query.trim().toLowerCase())) return false; }
  return true;
}

const cmp = (sort: ConversationSort) => (a: ConvRow, b: ConvRow): number => {
  const ta = a.lastMessageAt ?? "", tb = b.lastMessageAt ?? "";
  if (sort === "oldest") return ta < tb ? -1 : ta > tb ? 1 : (a.id < b.id ? -1 : 1);
  return ta > tb ? -1 : ta < tb ? 1 : (a.id < b.id ? -1 : 1);
};

export function queryConversations(rows: readonly ConvRow[], filter: ConversationFilter, sort: ConversationSort, page: ConversationPage): { items: ConvRow[]; total: number } {
  const filtered = rows.filter((r) => matchesFilter(r, filter));
  const sorted = [...filtered].sort(cmp(sort));
  const limit = Math.max(1, Math.min(100, page.limit));
  const offset = Math.max(0, page.offset);
  return { items: sorted.slice(offset, offset + limit), total: filtered.length };
}
