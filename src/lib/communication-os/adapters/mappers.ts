// ============================================================================
// 📡 Communication OS — channel MAPPERS (PURE). Batch 6.2.
//
// One pure function per (channel × shape): source record → canonical model.
// These are the whole point of an adapter — the mapping — isolated here so they
// are deterministic and unit-testable with NO server import. No SQL, no CRM/
// Journey logic, no AI, no scoring: adapters only COPY facts (including opaque
// CRM reference ids the source already carries) into the canonical model.
// ============================================================================
import type { WaConv, TimelineEvent } from "@/lib/whatsapp/inbox";
import type { CalendarEvent } from "@/lib/calendar-os/types";
import { canonicalId, type Attachment, type Conversation, type Message } from "../types";
import { emptyCrmLink, stateFlags, summarizeMessages } from "../compose";

// ── WhatsApp ────────────────────────────────────────────────────────────────
export function mapWhatsappConversation(wa: WaConv): Conversation {
  const id = canonicalId("whatsapp", wa.id);
  const participants = [
    { id: `whatsapp:person:${wa.id}`, kind: "person" as const, displayName: wa.contactName ?? "איש קשר", handle: null, channel: "whatsapp" as const },
    ...(wa.assignedAgentId ? [{ id: `whatsapp:broker:${wa.assignedAgentId}`, kind: "broker" as const, displayName: "הסוכן", handle: null, channel: "whatsapp" as const }] : []),
  ];
  const unreadCount = wa.unread ? 1 : 0;
  return {
    id, channel: "whatsapp", title: wa.contactName ?? "שיחת וואטסאפ",
    participants,
    lastActivityAt: wa.lastMessageAt,
    unreadCount,
    state: stateFlags({ unread: wa.unread, waiting: wa.needsResponse }),
    crmLinks: { ...emptyCrmLink(), lead: wa.leadId, buyer: wa.buyerId, seller: wa.sellerId, property: wa.propertyId },
    attachmentCount: 0, // the WhatsApp read model does not expose attachments
    summary: {
      latestMessagePreview: wa.lastMessage,
      latestMessageAt: wa.lastMessageAt,
      unread: unreadCount,
      lastReplyAt: null,          // unknown from the list model; enriched on load
      waiting: wa.needsResponse === true,
      participantCount: participants.length,
    },
  };
}

/** WhatsApp conversation timeline → canonical messages (whatsapp events only). */
export function mapWhatsappMessages(timeline: TimelineEvent[], sourceId: string): Message[] {
  return timeline
    .filter((t) => t.source === "whatsapp")
    .map((t, i) => ({
      id: canonicalId("whatsapp", `${sourceId}:${i}`),
      conversationId: canonicalId("whatsapp", sourceId),
      channel: "whatsapp" as const,
      direction: t.direction,
      authorId: t.direction === "outbound" ? `whatsapp:broker:${sourceId}` : `whatsapp:person:${sourceId}`,
      sentAt: t.at,
      preview: t.detail ?? t.title,
      attachments: [] as Attachment[],
      read: t.direction === "outbound",
    }));
}

// ── Calendar (events → conversations) ───────────────────────────────────────
const CAL_PERSON_KINDS = new Set(["buyer", "seller", "lead"]);

export function mapCalendarConversation(ev: CalendarEvent): Conversation {
  const id = canonicalId("calendar", ev.id);
  const participants = [
    { id: `calendar:system:${ev.id}`, kind: "system" as const, displayName: "יומן", handle: null, channel: "calendar" as const },
    ...(ev.entity.id && CAL_PERSON_KINDS.has(String(ev.entity.kind))
      ? [{ id: `calendar:person:${ev.entity.id}`, kind: "person" as const, displayName: ev.entity.name ?? "משתתף", handle: null, channel: "calendar" as const }]
      : []),
  ];
  const crm = emptyCrmLink();
  if (ev.entity.id) {
    if (ev.entity.kind === "buyer") crm.buyer = ev.entity.id;
    else if (ev.entity.kind === "seller") crm.seller = ev.entity.id;
    else if (ev.entity.kind === "lead") crm.lead = ev.entity.id;
    else if (ev.entity.kind === "property") crm.property = ev.entity.id;
  }
  if (ev.propertyId) crm.property = ev.propertyId;
  return {
    id, channel: "calendar", title: ev.title, participants,
    lastActivityAt: ev.start,
    unreadCount: 0,
    state: stateFlags({ resolved: ev.done }),
    crmLinks: crm,
    attachmentCount: 0,
    summary: {
      latestMessagePreview: ev.detail ?? ev.title,
      latestMessageAt: ev.start,
      unread: 0,
      lastReplyAt: null,
      waiting: false,
      participantCount: participants.length,
    },
  };
}

/** A calendar event is one canonical message (the agenda entry). No direction. */
export function mapCalendarMessages(ev: CalendarEvent): Message[] {
  return [{
    id: canonicalId("calendar", `${ev.id}:event`),
    conversationId: canonicalId("calendar", ev.id),
    channel: "calendar", direction: null, authorId: `calendar:system:${ev.id}`,
    sentAt: ev.start, preview: ev.detail ?? ev.title, attachments: [], read: true,
  }];
}

// ── Gmail (contract stub — no live source wired yet) ─────────────────────────
/** The minimal thread shape a future Gmail ingest would provide. Defined now so
 *  the canonical mapping is proven even before a live source connects. */
export interface GmailThreadLike {
  id: string;
  subject: string | null;
  fromName: string | null;
  fromAddress: string | null;
  lastAt: string;
  unread: number;
  snippet: string | null;
  crm?: { lead?: string | null; buyer?: string | null; seller?: string | null; property?: string | null };
}

export function mapGmailConversation(t: GmailThreadLike): Conversation {
  const id = canonicalId("gmail", t.id);
  const participants = [{ id: `gmail:person:${t.id}`, kind: "person" as const, displayName: t.fromName ?? t.fromAddress ?? "שולח", handle: t.fromAddress, channel: "gmail" as const }];
  return {
    id, channel: "gmail", title: t.subject ?? "(ללא נושא)", participants,
    lastActivityAt: t.lastAt,
    unreadCount: t.unread,
    state: stateFlags({ unread: t.unread > 0 }),
    crmLinks: { ...emptyCrmLink(), lead: t.crm?.lead ?? null, buyer: t.crm?.buyer ?? null, seller: t.crm?.seller ?? null, property: t.crm?.property ?? null },
    attachmentCount: 0,
    summary: {
      latestMessagePreview: t.snippet, latestMessageAt: t.lastAt, unread: t.unread,
      lastReplyAt: null, waiting: t.unread > 0, participantCount: participants.length,
    },
  };
}

/** Re-export so the WhatsApp adapter can build an enriched summary from loaded
 *  messages while keeping the authoritative conversation-level unread count. */
export function enrichSummary(messages: Message[], participantCount: number, unread: number) {
  return { ...summarizeMessages(messages, participantCount), unread };
}
