// ============================================================================
// 📡 Communication OS — Calendar adapter. Batch 6.2.
//
// Maps the FROZEN Calendar OS events (getCalendarEvents) into canonical
// Conversations (a calendar event is a conversation whose single message is the
// agenda entry). NO SQL — it consumes the service, inheriting org RLS; broker
// isolation is applied via the scope (non-managers pass their own brokerId, so
// getCalendarEvents returns only their events). It knows NOTHING about CRM/
// Journey — it only copies the event's own linked-entity reference.
// ============================================================================
import "server-only";
import { getCalendarEvents } from "@/lib/calendar-os/service";
import type { CalendarEvent } from "@/lib/calendar-os/types";
import type { ChannelAdapter, CommunicationScope, Conversation, Message } from "../types";
import { mapCalendarConversation, mapCalendarMessages } from "./mappers";

// A read window around now. Calendar events are the "conversations" surfaced.
const WINDOW_BACK_MS = 30 * 86_400_000;
const WINDOW_FWD_MS = 60 * 86_400_000;

async function loadEvents(scope: CommunicationScope): Promise<CalendarEvent[]> {
  const now = Date.now();
  const startIso = new Date(now - WINDOW_BACK_MS).toISOString();
  const endIso = new Date(now + WINDOW_FWD_MS).toISOString();
  // Managers: org-wide (brokerId null). Brokers: their own events only.
  const brokerId = scope.isManager ? null : scope.brokerId;
  return getCalendarEvents({ brokerId, startIso, endIso }).catch(() => []);
}

export const calendarAdapter: ChannelAdapter = {
  channel: "calendar",

  async listConversations(scope) {
    const events = await loadEvents(scope);
    return events.map(mapCalendarConversation);
  },

  async loadConversation(sourceId, scope): Promise<Conversation | null> {
    const events = await loadEvents(scope);
    const ev = events.find((e) => e.id === sourceId);
    return ev ? mapCalendarConversation(ev) : null;
  },

  async loadMessages(sourceId, scope): Promise<Message[]> {
    const events = await loadEvents(scope);
    const ev = events.find((e) => e.id === sourceId);
    return ev ? mapCalendarMessages(ev) : [];
  },
};
