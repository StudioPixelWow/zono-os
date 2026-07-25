// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · LISTENING FEED (PURE). Phase 5.
// ----------------------------------------------------------------------------
// Deterministic filter / sort / paginate over canonical mention rows. The store
// applies the same predicates in SQL for the hot path; this pure module is the
// shared source of truth (and drives QA). Text search is a safe case-insensitive
// contains over the author display + public message text only — never over a raw
// payload. No token, no raw cursor, no Graph field.
// ============================================================================
import type { MentionFilter, MentionSort, MentionPage, MatchState } from "./domain";

export interface FeedRow {
  id: string; platform: "facebook" | "instagram"; mentionKind: string; matchState: MatchState; status: string;
  authorDisplaySafe: string | null; messageText: string; providerCreatedAt: string | null;
  sentiment: string | null; intent: string | null; urgency: string | null;
  hasInboxProjection: boolean; sourceId: string;
}

export function matchesFilter(row: FeedRow, f: MentionFilter): boolean {
  if (f.sourceId && row.sourceId !== f.sourceId) return false;
  if (f.platform && row.platform !== f.platform) return false;
  if (f.mentionKind && row.mentionKind !== f.mentionKind) return false;
  if (f.status && row.status !== f.status) return false;
  if (f.matchState) {
    if (f.matchState === "matched" && row.matchState === "unmatched") return false;
    else if (f.matchState === "unmatched" && row.matchState !== "unmatched") return false;
    else if (f.matchState !== "matched" && f.matchState !== "unmatched" && row.matchState !== f.matchState) return false;
  }
  if (f.sentiment && row.sentiment !== f.sentiment) return false;
  if (f.intent && row.intent !== f.intent) return false;
  if (f.urgency && row.urgency !== f.urgency) return false;
  if (f.sinceIso && (row.providerCreatedAt ?? "") < f.sinceIso) return false;
  if (f.untilIso && (row.providerCreatedAt ?? "") > f.untilIso) return false;
  if (f.query && f.query.trim()) {
    const q = f.query.trim().toLowerCase();
    if (!`${row.authorDisplaySafe ?? ""} ${row.messageText}`.toLowerCase().includes(q)) return false;
  }
  return true;
}

const cmp = (sort: MentionSort) => (a: FeedRow, b: FeedRow): number => {
  const ta = a.providerCreatedAt ?? "", tb = b.providerCreatedAt ?? "";
  if (sort === "oldest") return ta < tb ? -1 : ta > tb ? 1 : (a.id < b.id ? -1 : 1);
  return ta > tb ? -1 : ta < tb ? 1 : (a.id < b.id ? -1 : 1);
};

export function queryFeed(rows: readonly FeedRow[], filter: MentionFilter, sort: MentionSort, page: MentionPage): { items: FeedRow[]; total: number } {
  const filtered = rows.filter((r) => matchesFilter(r, filter));
  const sorted = [...filtered].sort(cmp(sort));
  const limit = Math.max(1, Math.min(100, page.limit));
  const offset = Math.max(0, page.offset);
  return { items: sorted.slice(offset, offset + limit), total: filtered.length };
}
