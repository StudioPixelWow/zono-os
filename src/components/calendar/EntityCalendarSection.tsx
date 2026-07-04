"use client";
// ============================================================================
// 🗓️ ZONO — Entity Calendar section (reusable). PHASE 43.2.
// Embeds the Calendar OS timeline + booking proposal + meeting prep into any
// entity page (property / buyer / seller / lead). REUSES Calendar OS actions —
// no duplicated timeline/planner logic. Booking is proposal → explicit confirm
// (approval-gated); nothing auto-books; no external sync.
// ============================================================================
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getEntityCalendarAction } from "@/lib/calendar-os/actions";
import { getMeetingPrepAction } from "@/lib/calendar-os/intelligence-actions";
import { proposeBookingAction, confirmBookingAction } from "@/lib/calendar-os/booking-actions";
import { EVENT_TYPE_HE, type CalendarEvent, type EntityKind } from "@/lib/calendar-os/types";
import { BOOKING_HE, type BookingKind } from "@/lib/calendar-os/booking";

const time = (iso: string) => new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const KINDS: Record<Exclude<EntityKind, null>, BookingKind[]> = {
  buyer: ["buyer_visit", "office_meeting"], seller: ["seller_meeting", "valuation"],
  property: ["property_visit", "open_house"], lead: ["office_meeting", "buyer_visit"],
  office: ["office_meeting"], broker: ["office_meeting"],
};

export function EntityCalendarSection({ kind, id, name }: { kind: EntityKind; id: string; name?: string | null }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [bookKind, setBookKind] = useState<BookingKind>(kind && KINDS[kind] ? KINDS[kind][0] : "office_meeting");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<{ start: string; end: string; label: string }[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [prep, setPrep] = useState<Awaited<ReturnType<typeof getMeetingPrepAction>>["prep"] | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => { let alive = true; getEntityCalendarAction({ kind, id }).then((r) => { if (alive) { setEvents(r.events); setLoaded(true); } }).catch(() => setLoaded(true)); return () => { alive = false; }; }, [kind, id]);

  const [now] = useState(() => Date.now());
  const upcoming = events.filter((e) => Date.parse(e.start) >= now && !e.done);
  const past = events.filter((e) => Date.parse(e.start) < now || e.done);

  const findSlots = () => start(async () => { setMsg(null); const r = await proposeBookingAction({ kind: bookKind, dateIso: `${date}T09:00:00` }); setSlots(r.proposal.slots); });
  const confirm = (slot: { start: string; end: string }) => start(async () => {
    const r = await confirmBookingAction({ kind: bookKind, slotStart: slot.start, slotEnd: slot.end, title: `${BOOKING_HE[bookKind]}${name ? ` · ${name}` : ""}`, entity: id ? { kind, id } : undefined });
    if (r.ok) { setMsg("הפגישה נקבעה ביומן ✓"); setSlots(null); setShowBooking(false); if (r.event) setEvents((p) => [...p, r.event!].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))); }
    else setMsg(r.error ?? "קביעת הפגישה נכשלה");
  });
  const loadPrep = () => start(async () => { const r = await getMeetingPrepAction({ kind, id }); setPrep(r.prep); });

  return (
    <div dir="rtl" className="bg-card border-line rounded-[18px] border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-ink flex items-center gap-1.5 text-[15px] font-black"><Icon name="Calendar" size={16} /> יומן</h3>
        <button onClick={() => setShowBooking((v) => !v)} className="zono-gradient rounded-xl px-3 py-1.5 text-xs font-bold text-white">קבע פגישה</button>
      </div>

      {showBooking && (
        <div className="bg-surface mt-3 rounded-2xl p-3">
          <div className="flex flex-wrap items-center gap-2">
            {kind && KINDS[kind]?.map((k) => <button key={k} onClick={() => { setBookKind(k); setSlots(null); }} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${bookKind === k ? "zono-gradient text-white" : "bg-card text-muted"}`}>{BOOKING_HE[k]}</button>)}
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSlots(null); }} className="border-line bg-card text-ink rounded-lg border px-2 py-1 text-[12px]" />
            <button onClick={findSlots} disabled={pending} className="bg-brand-soft text-brand-strong rounded-lg px-3 py-1 text-[12px] font-bold disabled:opacity-50">הצג מועדים</button>
          </div>
          {slots && (slots.length === 0 ? <p className="text-muted mt-2 text-[12px]">אין מועדים פנויים ביום זה.</p> : (
            <div className="mt-2 flex flex-wrap gap-1.5">{slots.map((sl) => <button key={sl.start} onClick={() => confirm(sl)} disabled={pending} className="bg-card border-line rounded-lg border px-2.5 py-1 text-[12px] font-bold disabled:opacity-50">{sl.label}</button>)}</div>
          ))}
          <p className="text-muted mt-2 text-[10px]">הצעת מועדים — נקבע רק לאחר בחירה מפורשת. אין סנכרון אוטומטי ליומנים חיצוניים.</p>
        </div>
      )}
      {msg && <p className="text-success mt-2 text-[12px] font-bold">{msg}</p>}

      {!loaded ? <p className="text-muted mt-3 text-[12px]">טוען…</p> : (
        <>
          <div className="mt-3">
            <p className="text-muted mb-1 text-[11px] font-bold">קרובים ({upcoming.length})</p>
            {upcoming.length === 0 ? <p className="text-muted text-[12px]">אין אירועים קרובים.</p> : (
              <div className="space-y-1.5">{upcoming.slice(0, 6).map((e) => <Row key={e.id} e={e} />)}</div>
            )}
          </div>
          {past.length > 0 && (
            <div className="mt-3">
              <p className="text-muted mb-1 text-[11px] font-bold">עבר ({past.length})</p>
              <div className="space-y-1.5">{past.slice(0, 4).map((e) => <Row key={e.id} e={e} muted />)}</div>
            </div>
          )}
        </>
      )}

      {kind !== "property" && (
        <div className="mt-3">
          <button onClick={loadPrep} disabled={pending} className="bg-surface text-ink inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold disabled:opacity-50"><Icon name="Sparkles" size={13} /> הכנה לפגישה</button>
          {prep && (
            <div className="bg-brand-soft/30 mt-2 rounded-2xl p-3">
              <p className="text-ink text-[12px] font-black">נקודות לשיחה</p>
              <ul className="mt-1 space-y-0.5">{prep.talkingPoints.map((t, i) => <li key={i} className="text-muted text-[11px]">• {t}</li>)}</ul>
              <p className="text-muted mt-1.5 text-[11px]">סיכון {prep.riskLevel} · הזדמנות {prep.opportunityLevel}</p>
              <p className="text-ink mt-2 text-[12px] font-black">אחרי הפגישה</p>
              <div className="mt-1 flex flex-wrap gap-1.5">{prep.afterMeeting.map((a, i) => a.href ? <Link key={i} href={a.href} className="bg-card text-brand-strong rounded-full px-2.5 py-0.5 text-[11px] font-bold">{a.label}</Link> : <span key={i} className="bg-card text-muted rounded-full px-2.5 py-0.5 text-[11px] font-bold">{a.label}</span>)}</div>
              <p className="text-muted mt-1.5 text-[10px]">הצעות בלבד — שום דבר לא מבוצע אוטומטית.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ e, muted }: { e: CalendarEvent; muted?: boolean }) {
  const body = (
    <div className={`bg-surface flex items-center gap-2 rounded-xl p-2 ${muted ? "opacity-60" : ""}`}>
      <Icon name="Clock" size={13} className="text-muted shrink-0" />
      <div className="min-w-0 flex-1"><p className="text-ink truncate text-[12px] font-bold">{e.title}</p><p className="text-muted truncate text-[10px]">{EVENT_TYPE_HE[e.type]} · {time(e.start)}</p></div>
    </div>
  );
  return e.href ? <Link href={e.href}>{body}</Link> : body;
}
