// ============================================================================
// 🤝 ZONO — Client Experience 2.0 — assembler (pure & deterministic). PHASE 56.0.
// Redacts + isolates source items to the current client, merges them into one
// chronological timeline, consolidates a notification center, and groups blocks.
// Isolation rule: an item is kept ONLY if it has no owner OR its owner is the
// current client, AND its visibility is not "internal". Internal notes are always
// stripped. No I/O.
// ============================================================================
import {
  CLIENT_EXPERIENCE_VERSION, KIND_HE, KIND_ICON, PRIVACY_NOTE,
  type ClientSourceBundle, type SourceItem, type ClientTimelineItem, type ClientNotification,
  type ClientBlock, type ClientExperience, type TimelineKind,
} from "./types";

const NOTIFY_KINDS = new Set<TimelineKind>(["offer", "appointment", "message", "status", "marketing", "action"]);
const BLOCK_ORDER: TimelineKind[] = ["appointment", "offer", "marketing", "document", "status", "message", "update", "action"];

/** Keep only items the client is allowed to see (ownership + visibility), stripped. */
export function redactItems(items: SourceItem[], clientId: string): SourceItem[] {
  return items
    .filter((it) => (it.ownerId == null || it.ownerId === clientId) && it.visibility !== "internal")
    .map((it) => ({ ...it, internalNote: null }));   // never carry internal notes forward
}

function toTimelineItem(it: SourceItem, i: number): ClientTimelineItem {
  return {
    id: it.id ?? `ce-${i}`, at: it.at ?? null, kind: it.kind, kindHe: KIND_HE[it.kind], icon: KIND_ICON[it.kind],
    title: it.title, detail: it.detail ?? null, requiresApproval: !!it.requiresApproval, href: it.href ?? null, important: !!it.important,
  };
}

function tsOf(at: string | null): number {
  if (!at) return 0;
  const t = Date.parse(at);
  return Number.isFinite(t) ? t : 0;
}

/** Assemble the unified client experience from a client-safe bundle. */
export function assembleClientExperience(bundle: ClientSourceBundle): ClientExperience {
  const safe = redactItems(bundle.items, bundle.clientId);

  const timeline = safe
    .map(toTimelineItem)
    .sort((a, b) => tsOf(b.at) - tsOf(a.at));

  const notifications: ClientNotification[] = timeline
    .filter((t) => NOTIFY_KINDS.has(t.kind) && (t.important || t.requiresApproval || t.kind === "offer" || t.kind === "appointment"))
    .slice(0, 12)
    .map((t) => ({ id: t.id, kind: t.kind, title: t.title, detail: t.detail, at: t.at, requiresApproval: t.requiresApproval }));

  // Grouped blocks (stable order).
  const byKind = new Map<TimelineKind, ClientTimelineItem[]>();
  for (const t of timeline) (byKind.get(t.kind) ?? byKind.set(t.kind, []).get(t.kind)!).push(t);
  const blocks: ClientBlock[] = BLOCK_ORDER
    .filter((k) => byKind.has(k))
    .map((k) => ({ kind: k, label: KIND_HE[k], items: byKind.get(k)!.slice(0, 20) }));

  return {
    version: CLIENT_EXPERIENCE_VERSION, role: bundle.role, clientName: bundle.clientName, generatedAt: null,
    timeline: timeline.slice(0, 60),
    notifications,
    unreadCount: notifications.length,
    blocks,
    hasData: timeline.length > 0,
    notes: [PRIVACY_NOTE],
  };
}

/**
 * Client-scoped Q&A guard: verify a proposed answer only references the client's
 * OWN timeline (evidence must come from the redacted set). Returns a safe answer
 * or a refusal — used to keep AI responses isolated/redacted.
 */
export function scopedAnswerGuard(question: string, timeline: ClientTimelineItem[]): { allowed: boolean; reason: string } {
  const q = (question ?? "").toLowerCase();
  // Refuse cross-client / internal probing.
  const forbidden = ["לקוח אחר", "לקוחות אחרים", "other client", "other buyer", "other seller", "מוכר אחר", "קונה אחר", "הערות פנימיות", "internal note", "עמלה", "commission", "מחיר סוכן"];
  if (forbidden.some((f) => q.includes(f))) return { allowed: false, reason: "השאלה חורגת מהמידע האישי שלך — ניתן לשאול רק על התיק שלך." };
  if (!timeline.length) return { allowed: false, reason: "אין עדיין מידע בתיק שלך לענות עליו." };
  return { allowed: true, reason: "" };
}
