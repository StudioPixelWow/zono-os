// ============================================================================
// 💬 ZONO OS 2.0 — STAGE 6 · Batch 6.3 · COMMUNICATION WORKSPACE — filters (PURE).
//
// The workspace's only logic — and none of it is business logic. It FILTERS,
// SEARCHES and GROUPS the conversations the Communication Provider already
// returned. No SQL, no synchronization, no AI, no scoring: search runs over the
// provider's own output (provider search), grouping is by CANONICAL PERSON
// (one customer · one inbox · multiple channels), never by channel.
// ============================================================================
import type { CanonicalPerson, Channel, Conversation } from "@/lib/communication-os/types";

export type InboxFilter = "all" | "unread" | "waiting" | "pinned" | "resolved";
export const INBOX_FILTERS: InboxFilter[] = ["all", "unread", "waiting", "pinned", "resolved"];

/** Build a workspace href from the current params + a patch (null clears a key).
 *  Pure — used to keep selection/filter/channel/search in the URL so the three
 *  panels stay server-rendered and stream independently. */
export function wsHref(params: Record<string, string | undefined>, patch: Record<string, string | null>): string {
  const merged: Record<string, string | undefined> = { ...params };
  for (const [k, v] of Object.entries(patch)) merged[k] = v === null ? undefined : v;
  const entries = Object.entries(merged).filter(([, v]) => v != null && v !== "") as [string, string][];
  const qs = new URLSearchParams(entries).toString();
  return `/communication-workspace${qs ? `?${qs}` : ""}`;
}

/** Filter conversations by state flag + channel, then provider-search by text.
 *  Every predicate reads a FACT already on the conversation — nothing computed. */
export function filterConversations(
  convs: Conversation[],
  opts: { filter?: InboxFilter; channel?: Channel | "all"; q?: string },
): Conversation[] {
  const filter = opts.filter ?? "all";
  const channel = opts.channel ?? "all";
  const q = (opts.q ?? "").trim().toLowerCase();
  return convs.filter((c) => {
    if (channel !== "all" && c.channel !== channel) return false;
    if (filter === "unread" && c.unreadCount <= 0) return false;
    if (filter === "waiting" && !c.state.flags.includes("waiting")) return false;
    if (filter === "pinned" && !c.state.flags.includes("pinned")) return false;
    if (filter === "resolved" && !c.state.flags.includes("resolved")) return false;
    if (q) {
      const hay = [c.title, c.summary.latestMessagePreview ?? "", ...c.participants.map((p) => p.displayName)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** One inbox row per canonical person, carrying that person's conversations
 *  (possibly across several channels). Grouping is by PERSON, never by channel.
 *  Persons are ordered by their most recent conversation activity. */
export interface PersonGroup {
  person: CanonicalPerson;
  conversations: Conversation[];
  lastActivityAt: string | null;
}

export function groupByPerson(convs: Conversation[], people: CanonicalPerson[]): PersonGroup[] {
  const byId = new Map(convs.map((c) => [c.id, c]));
  const claimed = new Set<string>();
  const groups: PersonGroup[] = [];

  for (const person of people) {
    const conversations = person.channels
      .map((ch) => byId.get(ch.conversationId))
      .filter((c): c is Conversation => c !== undefined);
    if (conversations.length === 0) continue;
    conversations.forEach((c) => claimed.add(c.id));
    groups.push({ person, conversations: sortByActivity(conversations), lastActivityAt: latest(conversations) });
  }

  // Any conversation not covered by a resolved person becomes its own row —
  // never dropped, never duplicated (a conversation belongs to exactly one row).
  for (const c of convs) {
    if (claimed.has(c.id)) continue;
    claimed.add(c.id);
    groups.push({
      person: { personId: `conversation:${c.id}`, displayName: c.title, channels: [{ channel: c.channel, handle: null, conversationId: c.id }] },
      conversations: [c],
      lastActivityAt: c.lastActivityAt,
    });
  }

  return groups.sort((a, b) => {
    const av = a.lastActivityAt ?? "", bv = b.lastActivityAt ?? "";
    return av < bv ? 1 : av > bv ? -1 : 0;
  });
}

const latest = (convs: Conversation[]): string | null =>
  convs.reduce<string | null>((m, c) => (c.lastActivityAt && (!m || c.lastActivityAt > m) ? c.lastActivityAt : m), null);
const sortByActivity = (convs: Conversation[]): Conversation[] =>
  [...convs].sort((a, b) => ((a.lastActivityAt ?? "") < (b.lastActivityAt ?? "") ? 1 : (a.lastActivityAt ?? "") > (b.lastActivityAt ?? "") ? -1 : 0));
