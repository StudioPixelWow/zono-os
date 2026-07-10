// ============================================================================
// 📅 ZONO — Calendar OS™ · availability + booking service (server-only). 43.2.
// Availability prefs live in the EXISTING users.settings jsonb (no schema).
// Booking PROPOSES slots (read) and CONFIRMS into the EXISTING meetings table
// only on an explicit broker action (approval-gated). NO external sync, NO
// auto-booking. Calendar OS stays the single scheduling engine.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getCalendarEvents } from "./service";
import { normalizeMeeting } from "./engine";
import { mergePrefs, type AvailabilityPrefs } from "./availability";
import { generateBookingSlots, BOOKING_MEETING_TYPE, type BookingKind, type BookingSlot } from "./booking";
import { getConnectorHealthAll, type ConnectorHealth } from "./connectors";
import { logMeetingScheduled } from "@/lib/activity/service";
import type { CalendarEvent, EntityKind } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
async function ctx() { const sc = await getSessionContext(); return { orgId: sc.profile?.org_id ?? sc.organization?.id ?? null, userId: sc.user?.id ?? null }; }

// ── Availability preferences (users.settings.calendar) ───────────────────────
export async function getAvailabilityPrefs(brokerId?: string | null): Promise<AvailabilityPrefs> {
  const { userId } = await ctx(); const uid = brokerId ?? userId;
  if (!uid) return mergePrefs(null);
  try {
    const db = await createClient();
    const { data } = await db.from("users").select("settings").eq("id", uid).limit(1).maybeSingle();
    const settings = (data as { settings?: Row } | null)?.settings ?? {};
    return mergePrefs((settings as Row).calendar);
  } catch { return mergePrefs(null); }
}

export async function saveAvailabilityPrefs(prefs: AvailabilityPrefs): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await ctx(); if (!userId) return { ok: false, error: "אין הרשאה." };
  const clean = mergePrefs(prefs);
  try {
    const db = await createClient();
    const { data } = await db.from("users").select("settings").eq("id", userId).limit(1).maybeSingle();
    const current = ((data as { settings?: Row } | null)?.settings) ?? {};
    const { error } = await db.from("users").update({ settings: { ...current, calendar: clean } } as never).eq("id", userId);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "שמירה נכשלה." }; }
}

// ── Booking proposals (read) ─────────────────────────────────────────────────
export interface BookingProposal { kind: BookingKind; dateIso: string; slots: BookingSlot[]; note: string }
export async function proposeBooking(input: { kind: BookingKind; dateIso: string; brokerId?: string | null }): Promise<BookingProposal> {
  const { userId } = await ctx(); const broker = input.brokerId ?? userId;
  const d = new Date(input.dateIso);
  const startIso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString();
  const endIso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
  const [events, prefs] = await Promise.all([getCalendarEvents({ brokerId: broker, startIso, endIso }), getAvailabilityPrefs(broker)]);
  const slots = generateBookingSlots(events, input.dateIso, prefs, input.kind);
  return { kind: input.kind, dateIso: input.dateIso, slots, note: "הצעת מועדים בלבד — לא נקבע כלום עד אישור." };
}

// ── Booking confirm (WRITE — approval = the explicit broker action) ──────────
export interface ConfirmBookingInput { kind: BookingKind; slotStart: string; slotEnd: string; title: string; entity?: { kind: EntityKind; id: string } }
export interface ConfirmBookingResult { ok: boolean; event?: CalendarEvent; meetingId?: string; error?: string }
export async function confirmBooking(input: ConfirmBookingInput): Promise<ConfirmBookingResult> {
  const { orgId, userId } = await ctx();
  if (!orgId) return { ok: false, error: "אין הרשאה." };
  if (!input.slotStart || !input.title) return { ok: false, error: "חסרים פרטי הפגישה." };
  const row: Row = {
    org_id: orgId, organizer_id: userId, title: input.title, start_at: input.slotStart, end_at: input.slotEnd || null,
    type: BOOKING_MEETING_TYPE[input.kind] ?? "meeting", status: "scheduled",
  };
  const e = input.entity;
  if (e?.kind === "buyer") row.buyer_id = e.id; else if (e?.kind === "seller") row.seller_id = e.id;
  else if (e?.kind === "lead") row.lead_id = e.id; else if (e?.kind === "property") row.property_id = e.id;
  try {
    const db = await createClient();
    const { data, error } = await db.from("meetings").insert(row as never).select("id,title,status,start_at,end_at,type,buyer_id,seller_id,lead_id,property_id").maybeSingle();
    if (error) return { ok: false, error: error.message };
    const created = data as Row | null;
    const event = created ? normalizeMeeting(created) : null;
    // Timeline + KPI: record the scheduling on the unified activity layer.
    if (created?.id) {
      await logMeetingScheduled({
        id: String(created.id),
        title: String(created.title ?? input.title),
        property_id: (created.property_id as string | null) ?? null,
        buyer_id: (created.buyer_id as string | null) ?? null,
      });
      try {
        const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
        await emitBusinessEvent({ type: DOMAIN_EVENTS.meetingCreated, entityType: "meeting", entityId: String(created.id), payload: { kind: input.kind, entity: input.entity ?? null } });
      } catch { /* best-effort */ }
    }
    return { ok: true, meetingId: s(created?.id) ?? undefined, event: event ?? undefined };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : "קביעת הפגישה נכשלה." }; }
}

// ── Connector health (foundation — nothing connected) ────────────────────────
export async function getConnectorHealth(): Promise<ConnectorHealth[]> { return getConnectorHealthAll(); }
