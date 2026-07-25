// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INBOX SEARCH / FILTER / SORT (PURE). Phase 3.
// ----------------------------------------------------------------------------
// Deterministic filtering, sorting and pagination over canonical inbox rows. The
// store applies the same predicates in SQL for the hot path; this pure module is
// the shared source of truth (and drives QA). Text search is a safe case-
// insensitive contains over the participant display + subject preview only —
// never over a raw payload. No Graph model, no secret.
// ============================================================================
import type { InboxFilter, InboxSort, InboxPage } from "./domain";

export interface InboxRow {
  id: string;
  status: "open" | "snoozed" | "archived" | "resolved";
  platform: "facebook" | "instagram";
  assigneeUserId: string | null;
  unread: boolean;
  labelIds: readonly string[];
  participantDisplay: string | null;
  subjectPreview: string;
  lastActivityAt: string | null;
  priority: number;
}

/** Apply a filter to a single row (pure). */
export function matchesFilter(row: InboxRow, f: InboxFilter): boolean {
  if (f.status && row.status !== f.status) return false;
  if (f.platform && row.platform !== f.platform) return false;
  if (f.assigneeUserId !== undefined) { if (f.assigneeUserId === null ? row.assigneeUserId !== null : row.assigneeUserId !== f.assigneeUserId) return false; }
  if (f.unreadOnly && !row.unread) return false;
  if (f.labelId && !row.labelIds.includes(f.labelId)) return false;
  if (f.query && f.query.trim()) {
    const q = f.query.trim().toLowerCase();
    const hay = `${row.participantDisplay ?? ""} ${row.subjectPreview}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

const cmp = (sort: InboxSort) => (a: InboxRow, b: InboxRow): number => {
  if (sort === "priority") { if (a.priority !== b.priority) return a.priority - b.priority; }
  const ta = a.lastActivityAt ?? "", tb = b.lastActivityAt ?? "";
  if (sort === "oldest") return ta < tb ? -1 : ta > tb ? 1 : (a.id < b.id ? -1 : 1);
  return ta > tb ? -1 : ta < tb ? 1 : (a.id < b.id ? -1 : 1); // recent (default)
};

/** Filter + sort + paginate (pure, deterministic). */
export function queryInbox(rows: readonly InboxRow[], filter: InboxFilter, sort: InboxSort, page: InboxPage): { items: InboxRow[]; total: number } {
  const filtered = rows.filter((r) => matchesFilter(r, filter));
  const sorted = [...filtered].sort(cmp(sort));
  const limit = Math.max(1, Math.min(100, page.limit));
  const offset = Math.max(0, page.offset);
  return { items: sorted.slice(offset, offset + limit), total: filtered.length };
}
