// ============================================================================
// 📅 ZONO — Calendar OS™ · booking (pure). PHASE 43.2.
// Turns availability + free slots into discrete BOOKING PROPOSALS. The broker
// approves a slot; only then does the service create an internal meeting.
// External provider sync stays gated. Pure slot math — no I/O, no writes.
// ============================================================================
import { findFreeSlots, type WorkFrame } from "./intelligence";
import { frameFromPrefs, DEFAULT_PREFS, mergePrefs, isWorkingTime, type AvailabilityPrefs } from "./availability";
import { NoopConnector, type ProviderConnector } from "./connectors";
import type { CalendarEvent } from "./types";

export type BookingKind = "buyer_visit" | "seller_meeting" | "valuation" | "property_visit" | "office_meeting" | "open_house";

export const BOOKING_HE: Record<BookingKind, string> = {
  buyer_visit: "ביקור קונה", seller_meeting: "פגישת מוכר", valuation: "פגישת הערכת שווי",
  property_visit: "ביקור בנכס", office_meeting: "פגישה במשרד", open_house: "בית פתוח",
};
/** Booking kind → meeting_type enum value (viewing|open_house|meeting|call|signing|valuation|inspection|other). */
export const BOOKING_MEETING_TYPE: Record<BookingKind, string> = {
  buyer_visit: "viewing", property_visit: "viewing", open_house: "open_house",
  seller_meeting: "meeting", office_meeting: "meeting", valuation: "valuation",
};

export interface BookingSlot { start: string; end: string; label: string }

/**
 * Generate discrete bookable slots for a day: find free windows (respecting the
 * broker's frame), then carve them into meeting-sized slots with a travel buffer,
 * capped at maxDailyMeetings. Proposal only.
 */
export function generateBookingSlots(events: CalendarEvent[], dateIso: string, prefs: AvailabilityPrefs = DEFAULT_PREFS, kind: BookingKind = "buyer_visit"): BookingSlot[] {
  const frame: WorkFrame = frameFromPrefs(prefs);
  const durMin = prefs.defaultMeetingMinutes;
  const stepMs = (durMin + prefs.travelBufferMinutes) * 60_000;
  const durMs = durMin * 60_000;
  const windows = findFreeSlots(events, dateIso, frame, durMin);
  const slots: BookingSlot[] = [];
  for (const w of windows) {
    let cursor = Date.parse(w.start); const wEnd = Date.parse(w.end);
    while (cursor + durMs <= wEnd && slots.length < prefs.maxDailyMeetings) {
      const startIso = new Date(cursor).toISOString();
      if (isWorkingTime(startIso, prefs)) {
        const endIso = new Date(cursor + durMs).toISOString();
        const t = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
        slots.push({ start: startIso, end: endIso, label: `${t(startIso)}–${t(endIso)}` });
      }
      cursor += stepMs;
    }
    if (slots.length >= prefs.maxDailyMeetings) break;
  }
  return slots;
}

// ── Combined self-check for connectors + availability + booking ──────────────
export interface BCheck { name: string; pass: boolean }
export interface BSelfCheck { ok: boolean; total: number; passed: number; checks: BCheck[] }
export async function runBookingSelfCheck(): Promise<BSelfCheck> {
  const checks: BCheck[] = []; const add = (n: string, p: boolean) => checks.push({ name: n, pass: p });

  // Connectors: absent/gated, never auto-create
  const g: ProviderConnector = new NoopConnector("google", "Google Calendar");
  const health = await g.health();
  const create = await g.createDraftEvent({} as CalendarEvent);
  add("connector absent: google not connected", !health.connected && health.syncStatus === "not_connected" && health.lastSyncAt === null);
  add("connector: createDraft gated (no auto-create)", create.ok === false && create.requiresConnection === true);

  // Availability: merge clamps bad input, frame, working-time
  const prefs = mergePrefs({ startHour: 99, endHour: 3, workDays: [0, 1, 2, 3, 4], maxDailyMeetings: 5, defaultMeetingMinutes: 60, travelBufferMinutes: 15 });
  add("availability: invalid hours clamped to defaults", prefs.startHour === DEFAULT_PREFS.startHour && prefs.endHour === DEFAULT_PREFS.endHour);
  add("availability: overrides respected (maxDaily/dur)", prefs.maxDailyMeetings === 5 && prefs.defaultMeetingMinutes === 60);
  const frame = frameFromPrefs(prefs);
  add("availability: frame built", frame.startHour === prefs.startHour && frame.endHour === prefs.endHour);
  // A Sunday 10:00 is working; Saturday is not
  add("availability: isWorkingTime respects work days/hours",
    isWorkingTime(new Date(2026, 6, 5, 10, 0).toISOString(), prefs) === true &&   // Sun 2026-07-05 10:00
    isWorkingTime(new Date(2026, 6, 4, 10, 0).toISOString(), prefs) === false &&  // Sat
    isWorkingTime(new Date(2026, 6, 5, 21, 0).toISOString(), prefs) === false);   // after hours

  // Booking: empty day → many slots, all inside work hours, capped
  const slots = generateBookingSlots([], new Date(2026, 6, 5, 9, 0).toISOString(), prefs, "buyer_visit");
  add("booking: generates slots on a free day", slots.length > 0 && slots.length <= prefs.maxDailyMeetings);
  add("booking: every slot is working-time + correct duration", slots.every((s) => isWorkingTime(s.start, prefs) && (Date.parse(s.end) - Date.parse(s.start)) === prefs.defaultMeetingMinutes * 60_000));
  add("booking: kind→meeting_type mapping valid", BOOKING_MEETING_TYPE.buyer_visit === "viewing" && BOOKING_MEETING_TYPE.valuation === "valuation" && BOOKING_MEETING_TYPE.open_house === "open_house");

  // Booking around an existing meeting: no slot overlaps the busy block
  const busy: CalendarEvent = { id: "m", source: "meeting", type: "meeting", title: "תפוס", detail: null, start: new Date(2026, 6, 5, 11, 0).toISOString(), end: new Date(2026, 6, 5, 12, 0).toISOString(), allDay: false, status: null, done: false, priority: 60, urgency: 60, entity: { kind: null, id: null, name: null }, propertyId: null, city: null, lat: null, lng: null, href: null, locked: true };
  const slots2 = generateBookingSlots([busy], new Date(2026, 6, 5, 9, 0).toISOString(), prefs, "buyer_visit");
  const overlaps = slots2.some((s) => Date.parse(s.start) < Date.parse(busy.end!) && Date.parse(s.end) > Date.parse(busy.start));
  add("booking: no slot overlaps an existing meeting (no dup events)", !overlaps);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
