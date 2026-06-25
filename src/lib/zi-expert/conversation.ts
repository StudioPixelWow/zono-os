// ============================================================================
// ZI Expert™ — conversation helpers (Phase 22, PURE / client-safe).
// Title generation, search filtering and grouping for the history panel.
// ============================================================================
import type { ZiConversation, ZiMessage } from "./types";

/** Derive a short, readable conversation title from the first question. */
export function deriveTitle(firstQuestion: string): string {
  const clean = firstQuestion.replace(/\s+/g, " ").trim();
  if (!clean) return "שיחה חדשה";
  const cut = clean.length > 48 ? `${clean.slice(0, 47).trim()}…` : clean;
  return cut;
}

/** Case-insensitive search over conversation titles. Pure. */
export function searchConversations(list: ZiConversation[], query: string): ZiConversation[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) => c.title.toLowerCase().includes(q) || (c.moduleId ?? "").toLowerCase().includes(q));
}

/** Sort: pinned first, then most-recent activity. Pure (returns a new array). */
export function sortConversations(list: ZiConversation[]): ZiConversation[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const at = a.lastMessageAt ?? a.updatedAt;
    const bt = b.lastMessageAt ?? b.updatedAt;
    return bt.localeCompare(at);
  });
}

export interface ConversationGroup { label: string; items: ZiConversation[] }

/** Group conversations by recency buckets for the history list. */
export function groupConversationsByRecency(list: ZiConversation[], now = Date.now()): ConversationGroup[] {
  const day = 86_400_000;
  const buckets: Record<string, ZiConversation[]> = { pinned: [], today: [], week: [], older: [] };
  for (const c of list) {
    if (c.pinned) { buckets.pinned.push(c); continue; }
    const t = new Date(c.lastMessageAt ?? c.updatedAt).getTime();
    const age = now - t;
    if (age < day) buckets.today.push(c);
    else if (age < day * 7) buckets.week.push(c);
    else buckets.older.push(c);
  }
  const out: ConversationGroup[] = [];
  if (buckets.pinned.length) out.push({ label: "מועדפים", items: buckets.pinned });
  if (buckets.today.length) out.push({ label: "היום", items: buckets.today });
  if (buckets.week.length) out.push({ label: "השבוע", items: buckets.week });
  if (buckets.older.length) out.push({ label: "קודם לכן", items: buckets.older });
  return out;
}

/** Split a flat message list into ordered turns (oldest → newest). Pure. */
export function orderMessages(messages: ZiMessage[]): ZiMessage[] {
  return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
