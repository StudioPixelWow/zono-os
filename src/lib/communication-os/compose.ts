// ============================================================================
// 📡 ZONO OS 2.0 — STAGE 6 · Batch 6.2 · COMMUNICATION OS — composition (PURE).
//
// The ONLY logic the runtime adds — and none of it is business logic:
//   · summarizeMessages: SELECTS facts (latest / unread / last reply / waiting)
//     into a Communication Summary. No AI, no interpretation, no scoring.
//   · stateFlags: turns source booleans into the allowed state-flag set.
//   · resolvePeople: GROUPS conversations that share a CRM reference into one
//     canonical person (one customer, multiple channels). Deterministic
//     union-find — no fuzzy matching, no scoring.
// Deterministic and side-effect free — safe to unit test offline.
// ============================================================================
import type {
  CanonicalPerson, CommunicationState, CommunicationStateFlag, CommunicationSummary,
  Conversation, CrmLink, Message,
} from "./types";

/** Compose a summary from a conversation's messages — pure SELECTION only. */
export function summarizeMessages(messages: Message[], participantCount: number): CommunicationSummary {
  const sorted = [...messages].sort((a, b) => (a.sentAt < b.sentAt ? 1 : a.sentAt > b.sentAt ? -1 : 0));
  const latest = sorted[0] ?? null;
  const lastReply = sorted.find((m) => m.direction === "outbound") ?? null;
  const unread = messages.filter((m) => !m.read).length;
  // "waiting" is a FACT: the newest message is inbound and newer than our last
  // outbound reply. It is not a judgment about what to do.
  const waiting = latest?.direction === "inbound" && (!lastReply || lastReply.sentAt < latest.sentAt);
  return {
    latestMessagePreview: latest?.preview ?? null,
    latestMessageAt: latest?.sentAt ?? null,
    unread,
    lastReplyAt: lastReply?.sentAt ?? null,
    waiting: waiting === true,
    participantCount,
  };
}

/** Build the allowed state-flag set from source booleans. Only the five allowed
 *  flags may ever appear — anything else is dropped by construction. */
export function stateFlags(f: Partial<Record<CommunicationStateFlag, boolean>>): CommunicationState {
  const order: CommunicationStateFlag[] = ["unread", "waiting", "archived", "pinned", "resolved"];
  return { flags: order.filter((k) => f[k] === true) };
}

/** An empty CRM link (all references null). */
export const emptyCrmLink = (): CrmLink => ({ lead: null, buyer: null, seller: null, journey: null, deal: null, property: null });

// ── Canonical identity — union-find over shared CRM person references ────────
const PERSON_REFS: (keyof CrmLink)[] = ["buyer", "seller", "lead"];
const refKeys = (l: CrmLink): string[] => PERSON_REFS.map((k) => (l[k] ? `${k}:${l[k]}` : null)).filter((x): x is string => x !== null);

/**
 * Group conversations into canonical people. Two conversations are the SAME
 * person iff they share a buyer / seller / lead reference. Deterministic
 * union-find — no scoring, no fuzzy AI matching. A conversation with no CRM
 * reference becomes its own standalone person (never merged by guesswork).
 */
export function resolvePeople(conversations: Conversation[]): CanonicalPerson[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!; return r; };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };

  // Node per conversation; also a node per CRM ref key so shared refs link convs.
  for (const c of conversations) {
    if (!parent.has(c.id)) parent.set(c.id, c.id);
    for (const rk of refKeys(c.crmLinks)) {
      if (!parent.has(rk)) parent.set(rk, rk);
      union(c.id, rk);
    }
  }

  // Bucket conversations by their component root.
  const byRoot = new Map<string, Conversation[]>();
  for (const c of conversations) {
    const root = find(c.id);
    (byRoot.get(root) ?? byRoot.set(root, []).get(root)!).push(c);
  }

  const people: CanonicalPerson[] = [];
  for (const [, convs] of byRoot) {
    const sorted = [...convs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    // Prefer a shared CRM ref as the stable person id; else the first conv id.
    const shared = sorted.flatMap((c) => refKeys(c.crmLinks)).sort()[0] ?? sorted[0].id;
    const displayName = sorted.map((c) => c.participants.find((p) => p.kind === "person")?.displayName).find(Boolean)
      ?? sorted[0].title;
    people.push({
      personId: `person:${shared}`,
      displayName,
      channels: sorted.map((c) => ({
        channel: c.channel,
        handle: c.participants.find((p) => p.kind === "person")?.handle ?? null,
        conversationId: c.id,
      })),
    });
  }
  return people.sort((a, b) => (a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0));
}
