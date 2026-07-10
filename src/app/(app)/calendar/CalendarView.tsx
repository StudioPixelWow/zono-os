"use client";
// ============================================================================
// 🗓️ ZONO — Calendar OS™ view. Calendar-FIRST workspace: the calendar is the
// primary surface (Month / Week / Day / Agenda over the REAL unified event
// stream), a simplified cinematic hero, a create dialog on the EXISTING
// confirmBooking action, and a right intelligence rail (meeting prep, free
// slots, follow-ups, route, Ask ZONO, team availability, connections).
// Reuse-only — no new engine, no mock events, no fake sync. Nothing auto-books.
// Drag & drop is intentionally disabled (no event-time update action exists).
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { EVENT_TYPE_HE, type CalendarEvent, type DayPlan, type BrokerAvailability, type CalendarProviderStatus, type AvailabilityState } from "@/lib/calendar-os/types";
import type { ConnectorHealth } from "@/lib/calendar-os/connectors";
import type { BookingKind } from "@/lib/calendar-os/booking";
import { getCalendarAction, optimizeRouteAction, askCalendarAction } from "@/lib/calendar-os/actions";
import { getDayIntelligenceAction, getMeetingPrepAction } from "@/lib/calendar-os/intelligence-actions";
import { confirmBookingAction } from "@/lib/calendar-os/booking-actions";
import { MeetingLifecycleControls } from "./MeetingLifecycleControls";

type CalView = "month" | "week" | "day" | "agenda";
type IntelState = Awaited<ReturnType<typeof getDayIntelligenceAction>>["intel"] | null;
type RouteState = Awaited<ReturnType<typeof optimizeRouteAction>>["route"] | null;
type AskState = Awaited<ReturnType<typeof askCalendarAction>>["result"] | null;
type PrepState = Awaited<ReturnType<typeof getMeetingPrepAction>>["prep"] | null;

// ── date helpers (all deterministic; "now" comes from the todayIso prop) ──────
const HE_DAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const START_HOUR = 7, END_HOUR = 21, HOUR_PX = 56;
const pad = (n: number) => String(n).padStart(2, "0");
const time = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const iso = (d: Date) => d.toISOString();
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay());
const gridStartOf = (d: Date) => { const f = new Date(d.getFullYear(), d.getMonth(), 1); return addDays(startOfDay(f), -f.getDay()); };
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const minsSinceStart = (d: Date) => (d.getHours() - START_HOUR) * 60 + d.getMinutes();

const MEETING_TYPES = new Set(["meeting", "property_visit", "buyer_visit", "seller_meeting", "open_house"]);
const TYPE_ICON: Record<string, string> = {
  meeting: "Calendar", property_visit: "MapPin", buyer_visit: "MapPin", seller_meeting: "Users",
  task: "Check", mission: "Sparkles", phone_call: "Phone", whatsapp_followup: "MessageCircle",
  photo_day: "Camera", open_house: "Home", facebook_publish: "Megaphone", marketing_campaign: "Megaphone",
  document_deadline: "FileText", signature: "FileText", reminder: "Clock",
};
/** Status color derived from the real event (no colour is stored). */
function tone(e: CalendarEvent): { bar: string; chip: string; dot: string } {
  if (e.done) return { bar: "bg-line", chip: "bg-surface text-muted", dot: "bg-muted/50" };
  if (e.urgency >= 80) return { bar: "bg-danger", chip: "bg-danger-soft text-danger", dot: "bg-danger" };
  if (MEETING_TYPES.has(e.type)) return { bar: "bg-brand", chip: "bg-brand-soft text-brand-strong", dot: "bg-brand" };
  if (e.source === "followup" || e.type === "whatsapp_followup") return { bar: "bg-warning", chip: "bg-warning-soft text-warning", dot: "bg-warning" };
  return { bar: "bg-brand-light", chip: "bg-surface text-ink", dot: "bg-brand-light" };
}
const AVAIL_HE: Record<AvailabilityState, string> = { free: "פנוי", busy: "עסוק", meeting: "בפגישה", field: "בשטח", vacation: "חופשה", offline: "לא זמין" };
const AVAIL_TONE: Record<AvailabilityState, string> = { free: "bg-success-soft text-success", busy: "bg-warning-soft text-warning", meeting: "bg-brand-soft text-brand-strong", field: "bg-brand-soft text-brand-strong", vacation: "bg-line/70 text-muted", offline: "bg-line/70 text-muted" };

const BOOKING_KINDS: { kind: BookingKind; label: string }[] = [
  { kind: "buyer_visit", label: "ביקור קונה" },
  { kind: "seller_meeting", label: "פגישת מוכר" },
  { kind: "property_visit", label: "ביקור בנכס" },
  { kind: "valuation", label: "הערכת שווי" },
  { kind: "office_meeting", label: "פגישת משרד" },
  { kind: "open_house", label: "בית פתוח" },
];

// ── main ──────────────────────────────────────────────────────────────────────
export function CalendarView({ plan, initialEvents, initialStartIso, initialEndIso, team, providers, connectors, todayIso }: {
  plan: DayPlan; initialEvents: CalendarEvent[]; initialStartIso: string; initialEndIso: string;
  team: BrokerAvailability[]; providers: CalendarProviderStatus[]; connectors: ConnectorHealth[]; todayIso: string;
}) {
  const now = useMemo(() => new Date(todayIso), [todayIso]);
  const [view, setView] = useState<CalView>("month");
  const [cursor, setCursor] = useState<Date>(() => new Date(todayIso));

  // Event cache keyed by id; track fetched ranges to avoid duplicate queries.
  const [events, setEvents] = useState<Map<string, CalendarEvent>>(() => new Map(initialEvents.map((e) => [e.id, e])));
  const fetched = useRef<{ s: number; e: number }[]>([{ s: Date.parse(initialStartIso), e: Date.parse(initialEndIso) }]);
  const [loading, setLoading] = useState(false);

  const ensureRange = useCallback(async (start: Date, end: Date) => {
    const s = start.getTime(), e = end.getTime();
    if (fetched.current.some((r) => r.s <= s && r.e >= e)) return; // already covered
    setLoading(true);
    try {
      const r = await getCalendarAction({ startIso: iso(start), endIso: iso(end) });
      setEvents((prev) => { const m = new Map(prev); for (const ev of r.events) m.set(ev.id, ev); return m; });
      fetched.current.push({ s, e });
    } catch { /* keep cache */ }
    finally { setLoading(false); }
  }, []);

  // Visible range per view → lazily ensure events are loaded.
  const range = useMemo(() => {
    if (view === "month") { const gs = gridStartOf(cursor); return { start: gs, end: addDays(gs, 42) }; }
    if (view === "week") { const ws = startOfWeek(cursor); return { start: ws, end: addDays(ws, 7) }; }
    if (view === "day") return { start: startOfDay(cursor), end: endOfDay(cursor) };
    return { start: startOfDay(cursor), end: addDays(cursor, 30) }; // agenda
  }, [view, cursor]);
  // Defer the (state-setting) range fetch out of the effect body to avoid
  // synchronous setState-in-effect; the fetch itself is idempotent per range.
  useEffect(() => { const id = setTimeout(() => { void ensureRange(range.start, range.end); }, 0); return () => clearTimeout(id); }, [range, ensureRange]);

  const allEvents = useMemo(() => [...events.values()].sort((a, b) => a.start.localeCompare(b.start)), [events]);

  // ── intelligence (today) ────────────────────────────────────────────────────
  const [intel, setIntel] = useState<IntelState>(null);
  useEffect(() => { let live = true; getDayIntelligenceAction({ dateIso: todayIso }).then((r) => { if (live) setIntel(r.intel); }).catch(() => {}); return () => { live = false; }; }, [todayIso]);

  // ── selection / meeting prep ────────────────────────────────────────────────
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [prep, setPrep] = useState<PrepState>(null);
  const [prepPending, startPrep] = useTransition();
  const onEventClick = (e: CalendarEvent) => {
    setSelected(e); setPrep(null);
    if (e.entity.kind && e.entity.id) startPrep(async () => { try { const r = await getMeetingPrepAction({ kind: e.entity.kind, id: e.entity.id as string }); setPrep(r.prep); } catch { /* ignore */ } });
  };

  // ── create dialog ───────────────────────────────────────────────────────────
  const [dialog, setDialog] = useState<{ date: Date; hour?: number } | null>(null);
  const openCreate = (date: Date, hour?: number) => setDialog({ date, hour });
  const onCreated = (e?: CalendarEvent) => { if (e) setEvents((prev) => new Map(prev).set(e.id, e)); setDialog(null); };

  // ── navigation ──────────────────────────────────────────────────────────────
  const step = (dir: 1 | -1) => setCursor((c) => view === "month" ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : view === "week" ? addDays(c, 7 * dir) : addDays(c, dir));
  const periodLabel = useMemo(() => {
    if (view === "month") return cursor.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
    if (view === "week") { const ws = startOfWeek(cursor); return `${ws.toLocaleDateString("he-IL", { day: "numeric", month: "short" })} – ${addDays(ws, 6).toLocaleDateString("he-IL", { day: "numeric", month: "short" })}`; }
    if (view === "day") return cursor.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
    return "סדר יום";
  }, [view, cursor]);

  const nextMeeting = useMemo(() => allEvents.find((e) => !e.done && MEETING_TYPES.has(e.type) && Date.parse(e.start) >= now.getTime()) ?? null, [allEvents, now]);

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-3 py-5 sm:px-5">
      <Hero plan={plan} nextMeeting={nextMeeting} intel={intel} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[7fr_3fr]">
        {/* MAIN — the calendar */}
        <section className="bg-card border-line flex min-w-0 flex-col overflow-hidden rounded-[22px] border shadow-[var(--shadow-card)]">
          <Toolbar view={view} setView={setView} periodLabel={periodLabel} onPrev={() => step(-1)} onNext={() => step(1)} onToday={() => setCursor(new Date(todayIso))} onCreate={() => openCreate(startOfDay(cursor))} loading={loading} />
          <AnimatePresence mode="wait">
            <motion.div key={view} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="min-w-0">
              {view === "month" && <MonthGrid cursor={cursor} events={allEvents} now={now} onDay={openCreate} onEvent={onEventClick} onPickDay={(d) => { setCursor(d); setView("day"); }} />}
              {view === "week" && <WeekGrid cursor={cursor} events={allEvents} now={now} onSlot={openCreate} onEvent={onEventClick} />}
              {view === "day" && <DayGrid cursor={cursor} events={allEvents} now={now} onSlot={openCreate} onEvent={onEventClick} />}
              {view === "agenda" && <AgendaList events={allEvents} now={now} onEvent={onEventClick} />}
            </motion.div>
          </AnimatePresence>
        </section>

        {/* RAIL — intelligence */}
        <aside className="flex flex-col gap-3">
          <MeetingPrepCard selected={selected} prep={prep} pending={prepPending} />
          {selected?.source === "meeting" && <MeetingLifecycleControls eventId={selected.id} status={selected.status} />}
          <FreeSlotsCard intel={intel} />
          <FollowUpsCard events={allEvents} now={now} onEvent={onEventClick} />
          <RouteCard cursor={cursor} />
          <AskCard />
          <TeamCard team={team} />
          <ConnectionsCard connectors={connectors} providers={providers} />
        </aside>
      </div>

      {/* AGENDA on mobile (below the rail), per responsive spec */}
      <section className="bg-card border-line rounded-[22px] border p-3 lg:hidden">
        <p className="text-ink mb-2 px-1 text-sm font-black">סדר יום</p>
        <AgendaList events={allEvents} now={now} onEvent={onEventClick} compact />
      </section>

      <AnimatePresence>
        {dialog && <CreateDialog date={dialog.date} hour={dialog.hour} onClose={() => setDialog(null)} onCreated={onCreated} />}
      </AnimatePresence>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero({ plan, nextMeeting, intel }: { plan: DayPlan; nextMeeting: CalendarEvent | null; intel: IntelState }) {
  const nba = intel?.nextBest?.[0] ?? null;
  const freeCount = intel?.freeSlots?.length ?? null;
  const stats: { label: string; value: string; icon: string }[] = [
    { label: "פגישות היום", value: String(plan.summary.meetings), icon: "Calendar" },
    { label: "חלונות פנויים", value: freeCount === null ? "—" : String(freeCount), icon: "Clock" },
    { label: "מעקבים באיחור", value: String(plan.summary.overdue), icon: "AlertTriangle" },
  ];
  return (
    <section className="relative overflow-hidden rounded-[22px] border border-[#243056] bg-[linear-gradient(120deg,#0b1220,#111a33_55%,#0b1220)] p-5 text-white shadow-[var(--shadow-card)] sm:p-6">
      <div className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.35),transparent_70%)] blur-2xl" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-white/60"><Icon name="Calendar" size={13} /> ZONO Calendar OS</div>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">מרכז השליטה ביומן</h1>
          <p className="mt-1 text-[13px] text-white/70">
            {nextMeeting ? <>הפגישה הבאה: <span className="font-bold text-white">{nextMeeting.title}</span> · {time(nextMeeting.start)}</> : "אין פגישות קרובות ביומן."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {stats.map((s) => (
            <div key={s.label} className="min-w-[104px] rounded-2xl bg-white/5 px-3.5 py-2.5 ring-1 ring-white/10">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-white/60"><Icon name={s.icon} size={12} /> {s.label}</div>
              <p className="mt-0.5 text-2xl font-black tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
      {nba && (
        <div className="relative mt-3 flex items-center gap-2.5 rounded-2xl bg-white/[0.06] px-3.5 py-2.5 ring-1 ring-white/10">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand/30"><Icon name="Sparkles" size={15} /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-black">{nba.title}</p><p className="truncate text-[11px] text-white/60">{nba.why}</p></div>
          {nba.href && <Link href={nba.href} className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-bold hover:bg-white/20">פתח</Link>}
        </div>
      )}
    </section>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
function Toolbar({ view, setView, periodLabel, onPrev, onNext, onToday, onCreate, loading }: {
  view: CalView; setView: (v: CalView) => void; periodLabel: string; onPrev: () => void; onNext: () => void; onToday: () => void; onCreate: () => void; loading: boolean;
}) {
  const tabs: { v: CalView; label: string }[] = [{ v: "month", label: "חודש" }, { v: "week", label: "שבוע" }, { v: "day", label: "יום" }, { v: "agenda", label: "סדר יום" }];
  return (
    <div className="border-line flex flex-wrap items-center justify-between gap-2 border-b p-3">
      <div className="flex items-center gap-1.5">
        <button onClick={onPrev} aria-label="הקודם" className="border-line hover:border-brand-light grid h-8 w-8 place-items-center rounded-lg border"><Icon name="ChevronRight" size={16} /></button>
        <button onClick={onToday} className="border-line hover:border-brand-light rounded-lg border px-3 py-1.5 text-[12px] font-bold">היום</button>
        <button onClick={onNext} aria-label="הבא" className="border-line hover:border-brand-light grid h-8 w-8 place-items-center rounded-lg border"><Icon name="ChevronLeft" size={16} /></button>
        <span className="text-ink mr-1 text-sm font-black">{periodLabel}</span>
        {loading && <span className="text-muted text-[11px]">טוען…</span>}
      </div>
      <div className="flex items-center gap-2">
        <div className="bg-surface flex rounded-xl p-0.5" role="tablist">
          {tabs.map((t) => (
            <button key={t.v} role="tab" aria-selected={view === t.v} onClick={() => setView(t.v)} className={`zono-focus-ring rounded-lg px-3 py-1.5 text-[12px] font-bold transition ${view === t.v ? "bg-card text-ink shadow-[var(--shadow-card)]" : "text-muted hover:text-ink"}`}>{t.label}</button>
          ))}
        </div>
        <button onClick={onCreate} className="btn-zono-primary zono-focus-ring inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-black text-white"><Icon name="Plus" size={15} /> פגישה חדשה</button>
      </div>
    </div>
  );
}

// ── Month ─────────────────────────────────────────────────────────────────────
function MonthGrid({ cursor, events, now, onDay, onEvent, onPickDay }: { cursor: Date; events: CalendarEvent[]; now: Date; onDay: (d: Date) => void; onEvent: (e: CalendarEvent) => void; onPickDay: (d: Date) => void }) {
  const gs = gridStartOf(cursor);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gs, i));
  const byDay = useMemo(() => { const m = new Map<string, CalendarEvent[]>(); for (const e of events) { const k = dayKey(new Date(e.start)); (m.get(k) ?? m.set(k, []).get(k)!).push(e); } return m; }, [events]);
  return (
    <div className="p-2 sm:p-3">
      <div className="mb-1 grid grid-cols-7 text-center">
        {HE_DAYS.map((d) => <div key={d} className="text-muted py-1 text-[11px] font-black">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const list = byDay.get(dayKey(d)) ?? [];
          const outside = d.getMonth() !== cursor.getMonth();
          const today = sameDay(d, now);
          return (
            <div key={dayKey(d)} className={`group relative min-h-[92px] rounded-xl border p-1.5 text-right transition ${outside ? "border-line/50 bg-surface/40" : "border-line bg-card hover:border-brand-light"}`}>
              <div className="flex items-center justify-between">
                <button onClick={() => onDay(d)} aria-label="הוסף פגישה" className="text-muted opacity-0 transition group-hover:opacity-100"><Icon name="Plus" size={13} /></button>
                <button onClick={() => onPickDay(d)} className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12px] font-black ${today ? "bg-brand text-white" : outside ? "text-muted" : "text-ink"}`}>{d.getDate()}</button>
              </div>
              <div className="mt-1 flex flex-col gap-0.5">
                {list.slice(0, 3).map((e) => {
                  const t = tone(e);
                  return (
                    <button key={e.id} onClick={() => onEvent(e)} className={`flex items-center gap-1 truncate rounded-md px-1 py-0.5 text-right text-[10.5px] font-bold ${t.chip} ${e.done ? "line-through" : ""}`}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} />
                      <span className="truncate">{e.allDay ? "" : time(e.start) + " "}{e.title}</span>
                    </button>
                  );
                })}
                {list.length > 3 && <button onClick={() => onPickDay(d)} className="text-muted px-1 text-[10px] font-bold">+{list.length - 3} נוספות</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── hourly layout (week/day) ──────────────────────────────────────────────────
type Positioned = { e: CalendarEvent; top: number; height: number; col: number; cols: number };
function layoutDay(dayEvents: CalendarEvent[]): { timed: Positioned[]; allDay: CalendarEvent[] } {
  const allDay = dayEvents.filter((e) => e.allDay);
  const timed = dayEvents.filter((e) => !e.allDay).sort((a, b) => a.start.localeCompare(b.start));
  // greedy column packing for overlaps
  const spans = timed.map((e) => { const s = new Date(e.start); const en = e.end ? new Date(e.end) : new Date(Date.parse(e.start) + 45 * 60000); return { e, s: minsSinceStart(s), en: Math.max(minsSinceStart(s) + 20, minsSinceStart(en)) }; });
  const cols: number[] = []; // end-min per column
  const placed = spans.map((sp) => {
    let col = cols.findIndex((endMin) => endMin <= sp.s);
    if (col === -1) { col = cols.length; cols.push(sp.en); } else cols[col] = sp.en;
    return { ...sp, col };
  });
  // count concurrency for width
  const out: Positioned[] = placed.map((p) => {
    const overlaps = placed.filter((q) => q.s < p.en && q.en > p.s);
    const cCount = Math.max(...overlaps.map((q) => q.col)) + 1;
    return { e: p.e, top: (p.s / 60) * HOUR_PX, height: Math.max(22, ((p.en - p.s) / 60) * HOUR_PX - 2), col: p.col, cols: cCount };
  });
  return { timed: out, allDay };
}

function HourColumn({ date, events, now, onSlot, onEvent, wide }: { date: Date; events: CalendarEvent[]; now: Date; onSlot: (d: Date, h: number) => void; onEvent: (e: CalendarEvent) => void; wide?: boolean }) {
  const dayEvents = events.filter((e) => sameDay(new Date(e.start), date));
  const { timed, allDay } = useMemo(() => layoutDay(dayEvents), [dayEvents]);
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const isToday = sameDay(date, now);
  const nowTop = isToday ? (minsSinceStart(now) / 60) * HOUR_PX : -1;
  return (
    <div className="relative flex-1">
      {allDay.length > 0 && (
        <div className="border-line flex flex-wrap gap-1 border-b p-1">
          {allDay.map((e) => <button key={e.id} onClick={() => onEvent(e)} className={`truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${tone(e).chip}`}>{e.title}</button>)}
        </div>
      )}
      <div className="relative" style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}>
        {hours.map((h) => (
          <button key={h} onClick={() => onSlot(date, h)} aria-label={`הוסף פגישה ${pad(h)}:00`} className="border-line/70 absolute inset-x-0 block border-t hover:bg-brand-soft/30" style={{ top: (h - START_HOUR) * HOUR_PX, height: HOUR_PX }} />
        ))}
        {nowTop >= 0 && nowTop <= (END_HOUR - START_HOUR) * HOUR_PX && (
          <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowTop }}>
            <span className="bg-danger h-2 w-2 rounded-full" /><span className="bg-danger h-px flex-1" />
          </div>
        )}
        {timed.map((p) => {
          const t = tone(p.e); const w = 100 / p.cols;
          return (
            <button key={p.e.id} onClick={() => onEvent(p.e)} title={p.e.title}
              className={`absolute overflow-hidden rounded-lg border-r-[3px] p-1 text-right text-[11px] shadow-sm ${t.chip} ${p.e.done ? "opacity-50" : ""}`}
              style={{ top: p.top, height: p.height, right: `${p.col * w}%`, width: `calc(${w}% - 3px)`, borderRightColor: "currentColor" }}>
              <span className="block truncate font-black">{p.e.title}</span>
              {wide && p.height > 34 && <span className="text-muted block truncate text-[10px]">{time(p.e.start)}{p.e.detail ? ` · ${p.e.detail}` : ""}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({ cursor, events, now, onSlot, onEvent }: { cursor: Date; events: CalendarEvent[]; now: Date; onSlot: (d: Date, h: number) => void; onEvent: (e: CalendarEvent) => void }) {
  const ws = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="border-line grid grid-cols-[44px_repeat(7,1fr)] border-b">
          <div />
          {days.map((d) => (
            <div key={dayKey(d)} className="p-1.5 text-center">
              <div className="text-muted text-[11px] font-bold">{HE_DAYS[d.getDay()]}</div>
              <div className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-[13px] font-black ${sameDay(d, now) ? "bg-brand text-white" : "text-ink"}`}>{d.getDate()}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[44px_repeat(7,1fr)]">
          <div className="relative" style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}>
            {hours.map((h) => <div key={h} className="text-muted absolute inset-x-0 pl-1 text-left text-[10px] tabular-nums" style={{ top: (h - START_HOUR) * HOUR_PX - 6 }}>{pad(h)}:00</div>)}
          </div>
          {days.map((d) => <div key={dayKey(d)} className="border-line border-r"><HourColumn date={d} events={events} now={now} onSlot={onSlot} onEvent={onEvent} /></div>)}
        </div>
      </div>
    </div>
  );
}

function DayGrid({ cursor, events, now, onSlot, onEvent }: { cursor: Date; events: CalendarEvent[]; now: Date; onSlot: (d: Date, h: number) => void; onEvent: (e: CalendarEvent) => void }) {
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  return (
    <div className="max-h-[64vh] overflow-y-auto">
      <div className="grid grid-cols-[52px_1fr]">
        <div className="relative" style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}>
          {hours.map((h) => <div key={h} className="text-muted absolute inset-x-0 pl-1.5 text-left text-[11px] tabular-nums" style={{ top: (h - START_HOUR) * HOUR_PX - 6 }}>{pad(h)}:00</div>)}
        </div>
        <div className="border-line border-r"><HourColumn date={cursor} events={events} now={now} onSlot={onSlot} onEvent={onEvent} wide /></div>
      </div>
    </div>
  );
}

// ── Agenda ────────────────────────────────────────────────────────────────────
function AgendaList({ events, now, onEvent, compact }: { events: CalendarEvent[]; now: Date; onEvent: (e: CalendarEvent) => void; compact?: boolean }) {
  const groups = useMemo(() => {
    const today = startOfDay(now), tomorrow = addDays(today, 1), nextWeek = addDays(today, 7);
    const g: { key: string; label: string; items: CalendarEvent[] }[] = [
      { key: "today", label: "היום", items: [] }, { key: "tomorrow", label: "מחר", items: [] },
      { key: "week", label: "השבוע הקרוב", items: [] }, { key: "later", label: "בהמשך", items: [] },
    ];
    for (const e of events) {
      const d = new Date(e.start);
      if (d < today) continue;
      if (sameDay(d, today)) g[0].items.push(e);
      else if (sameDay(d, tomorrow)) g[1].items.push(e);
      else if (d < nextWeek) g[2].items.push(e);
      else g[3].items.push(e);
    }
    return g.filter((x) => x.items.length > 0);
  }, [events, now]);
  if (groups.length === 0) return <Empty label="אין אירועים קרובים." />;
  return (
    <div className={`flex flex-col gap-3 ${compact ? "" : "p-3"}`}>
      {groups.map((grp) => (
        <div key={grp.key}>
          <p className="text-muted mb-1.5 px-1 text-[12px] font-black">{grp.label} · {grp.items.length}</p>
          <div className="flex flex-col gap-1.5">{grp.items.map((e) => <EventRow key={e.id} e={e} onClick={() => onEvent(e)} showDay />)}</div>
        </div>
      ))}
    </div>
  );
}

function EventRow({ e, onClick, showDay }: { e: CalendarEvent; onClick: () => void; showDay?: boolean }) {
  const t = tone(e);
  return (
    <button onClick={onClick} className={`bg-card border-line hover:border-brand-light flex w-full items-center gap-3 rounded-2xl border p-2.5 text-right transition ${e.done ? "opacity-50" : ""}`}>
      <span className={`h-9 w-1 shrink-0 rounded-full ${t.bar}`} />
      <span className="bg-surface text-ink grid h-8 w-8 shrink-0 place-items-center rounded-lg"><Icon name={TYPE_ICON[e.type] ?? "Calendar"} size={15} /></span>
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-sm font-bold">{e.title}</span>
        <span className="text-muted block truncate text-[11px]">{EVENT_TYPE_HE[e.type]}{e.detail ? ` · ${e.detail}` : ""}{e.city ? ` · ${e.city}` : ""}</span>
      </span>
      <span className="text-muted shrink-0 text-left text-[11px] font-bold tabular-nums">{showDay && <span className="block">{new Date(e.start).toLocaleDateString("he-IL", { day: "numeric", month: "short" })}</span>}{e.allDay ? "כל היום" : time(e.start)}</span>
    </button>
  );
}

// ── Create dialog (reuses confirmBookingAction — the only existing create) ─────
function CreateDialog({ date, hour, onClose, onCreated }: { date: Date; hour?: number; onClose: () => void; onCreated: (e?: CalendarEvent) => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<BookingKind>("buyer_visit");
  const [dateStr, setDateStr] = useState(dayKey(date));
  const [timeStr, setTimeStr] = useState(`${pad(hour ?? 10)}:00`);
  const [duration, setDuration] = useState(60);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () => {
    setErr(null);
    if (!title.trim()) { setErr("יש להזין כותרת."); return; }
    const [y, m, dd] = dateStr.split("-").map(Number);
    const [hh, mm] = timeStr.split(":").map(Number);
    const s = new Date(y, m - 1, dd, hh, mm);
    const e = new Date(s.getTime() + duration * 60000);
    start(async () => {
      try {
        const r = await confirmBookingAction({ kind, slotStart: s.toISOString(), slotEnd: e.toISOString(), title: title.trim() });
        if (r.ok) onCreated(r.event); else setErr(r.error ?? "יצירת הפגישה נכשלה.");
      } catch { setErr("יצירת הפגישה נכשלה."); }
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <motion.div dir="rtl" initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} transition={{ duration: 0.16 }} onClick={(ev) => ev.stopPropagation()} className="bg-card border-line w-full max-w-md rounded-3xl border p-5 shadow-[var(--shadow-lift)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-ink text-lg font-black">פגישה חדשה</h2>
          <button onClick={onClose} aria-label="סגור" className="text-muted hover:text-ink"><Icon name="X" size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="כותרת"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: ביקור בנכס ברחוב הרצל" className="bg-surface border-line focus:border-brand w-full rounded-xl border px-3 py-2 text-sm outline-none" /></Field>
          <Field label="סוג פגישה">
            <div className="flex flex-wrap gap-1.5">
              {BOOKING_KINDS.map((k) => <button key={k.kind} onClick={() => setKind(k.kind)} className={`rounded-lg px-2.5 py-1.5 text-[12px] font-bold ${kind === k.kind ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink"}`}>{k.label}</button>)}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="תאריך"><input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className="bg-surface border-line focus:border-brand w-full rounded-xl border px-3 py-2 text-sm outline-none" /></Field>
            <Field label="שעה"><input type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} className="bg-surface border-line focus:border-brand w-full rounded-xl border px-3 py-2 text-sm outline-none" /></Field>
          </div>
          <Field label="משך">
            <div className="flex gap-1.5">
              {[30, 45, 60, 90, 120].map((d) => <button key={d} onClick={() => setDuration(d)} className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${duration === d ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink"}`}>{d} ד׳</button>)}
            </div>
          </Field>
          {err && <p className="text-danger text-[12px] font-bold">{err}</p>}
          <p className="text-muted text-[11px] leading-relaxed">שיוך קונה/מוכר/ליד/נכס לפגישה מתבצע מכרטיס הישות. פגישות נשמרות בלוח היומן של ZONO בלבד (ללא חיבור ליומן חיצוני).</p>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="border-line rounded-xl border px-4 py-2 text-sm font-bold">ביטול</button>
            <button onClick={save} disabled={pending} className="btn-zono-primary zono-focus-ring inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-60">{pending ? <Icon name="Clock" size={15} /> : <Icon name="Check" size={15} />} שמור פגישה</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-muted mb-1 block text-[12px] font-bold">{label}</span>{children}</label>;
}

// ── Rail cards ────────────────────────────────────────────────────────────────
function RailCard({ title, icon, children, tone: t = "brand", action }: { title: string; icon: string; children: React.ReactNode; tone?: "brand" | "success" | "warning"; action?: React.ReactNode }) {
  const iconCls = t === "success" ? "bg-success-soft text-success" : t === "warning" ? "bg-warning-soft text-warning" : "bg-brand-soft text-brand";
  return (
    <div className="bg-card border-line rounded-2xl border p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-lg ${iconCls}`}><Icon name={icon} size={14} /></span><p className="text-ink text-[13px] font-extrabold">{title}</p></div>
        {action}
      </div>
      {children}
    </div>
  );
}

function MeetingPrepCard({ selected, prep, pending }: { selected: CalendarEvent | null; prep: PrepState; pending: boolean }) {
  return (
    <RailCard title="הכנה לפגישה" icon="Sparkles" action={selected?.href ? <Link href={selected.href} className="text-brand text-[11px] font-bold">פתח</Link> : undefined}>
      {!selected ? <p className="text-muted text-[12px]">בחר אירוע ביומן כדי לראות הכנה חכמה.</p> : (
        <div className="flex flex-col gap-2">
          <p className="text-ink text-sm font-bold">{selected.title}</p>
          <p className="text-muted text-[11px]">{EVENT_TYPE_HE[selected.type]}{selected.allDay ? "" : ` · ${time(selected.start)}`}{selected.detail ? ` · ${selected.detail}` : ""}</p>
          {pending && <p className="text-muted text-[12px]">טוען הכנה…</p>}
          {prep && (
            <>
              <div className="flex gap-2 text-[11px] font-bold"><span className="bg-warning-soft text-warning rounded-lg px-2 py-0.5">סיכון {prep.riskLevel}</span><span className="bg-success-soft text-success rounded-lg px-2 py-0.5">הזדמנות {prep.opportunityLevel}</span></div>
              {prep.talkingPoints.length > 0 && <ul className="text-ink flex list-inside list-disc flex-col gap-0.5 text-[12px]">{prep.talkingPoints.slice(0, 4).map((p, i) => <li key={i} className="truncate">{p}</li>)}</ul>}
            </>
          )}
          {selected.entity.kind == null && <p className="text-muted text-[11px]">אין ישות מקושרת לאירוע זה.</p>}
        </div>
      )}
    </RailCard>
  );
}

function FreeSlotsCard({ intel }: { intel: IntelState }) {
  const slots = intel?.freeSlots ?? [];
  return (
    <RailCard title="חלונות פנויים היום" icon="Clock" tone="success">
      {slots.length === 0 ? <p className="text-muted text-[12px]">{intel ? "אין חלונות פנויים משמעותיים היום." : "טוען…"}</p> : (
        <div className="flex flex-col gap-1.5">
          {slots.slice(0, 4).map((s, i) => (
            <div key={i} className="bg-surface flex items-center justify-between rounded-xl px-2.5 py-1.5">
              <span className="text-ink text-[12px] font-bold tabular-nums">{time(s.start)}–{time(s.end)}</span>
              <span className="text-muted text-[11px]">{s.minutes} ד׳</span>
            </div>
          ))}
        </div>
      )}
    </RailCard>
  );
}

function FollowUpsCard({ events, now, onEvent }: { events: CalendarEvent[]; now: Date; onEvent: (e: CalendarEvent) => void }) {
  const items = useMemo(() => events.filter((e) => !e.done && (e.source === "followup" || e.type === "whatsapp_followup" || (e.urgency >= 80 && Date.parse(e.start) <= now.getTime()))).slice(0, 5), [events, now]);
  return (
    <RailCard title="מעקבים" icon="AlertTriangle" tone="warning">
      {items.length === 0 ? <p className="text-muted text-[12px]">אין מעקבים פתוחים.</p> : (
        <div className="flex flex-col gap-1.5">{items.map((e) => (
          <button key={e.id} onClick={() => onEvent(e)} className="bg-surface hover:bg-warning-soft/40 flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-right">
            <span className="min-w-0 flex-1"><span className="text-ink block truncate text-[12px] font-bold">{e.title}</span><span className="text-muted block truncate text-[10.5px]">{e.detail ?? EVENT_TYPE_HE[e.type]}</span></span>
            <span className="text-muted shrink-0 text-[10.5px] tabular-nums">{new Date(e.start).toLocaleDateString("he-IL", { day: "numeric", month: "short" })}</span>
          </button>
        ))}</div>
      )}
    </RailCard>
  );
}

function RouteCard({ cursor }: { cursor: Date }) {
  const [route, setRoute] = useState<RouteState>(null);
  const [pending, start] = useTransition();
  const run = () => start(async () => { try { const r = await optimizeRouteAction({ dateIso: iso(startOfDay(cursor)) }); setRoute(r.route); } catch { /* ignore */ } });
  return (
    <RailCard title="מסלול מוצע" icon="MapPin" action={<button onClick={run} disabled={pending} className="text-brand text-[11px] font-bold">{pending ? "מחשב…" : "חשב"}</button>}>
      {!route ? <p className="text-muted text-[12px]">חשב מסלול נסיעה יעיל לביקורים של היום שנבחר.</p> : route.order.length === 0 ? <p className="text-muted text-[12px]">אין ביקורים עם מיקום ליום זה.</p> : (
        <div className="flex flex-col gap-1">
          <p className="text-muted mb-1 text-[11px] font-bold">{route.order.length} עצירות · {Math.round(route.totalKm)} ק״מ</p>
          {route.order.slice(0, 5).map((s, i) => <div key={s.eventId} className="flex items-center gap-2 text-[12px]"><span className="bg-brand-soft text-brand-strong grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black">{i + 1}</span><span className="text-ink truncate">{s.title}</span>{s.city && <span className="text-muted shrink-0 text-[10.5px]">{s.city}</span>}</div>)}
        </div>
      )}
    </RailCard>
  );
}

function AskCard() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<AskState>(null);
  const [pending, start] = useTransition();
  const ask = (question: string) => { if (!question.trim()) return; setQ(question); start(async () => { try { const r = await askCalendarAction(question); setRes(r.result); } catch { /* ignore */ } }); };
  const chips = ["מה הפגישה הבאה?", "למי להתקשר היום?", "מתי יש לי זמן פנוי?", "מה באיחור?"];
  return (
    <RailCard title="שאל את ZONO" icon="MessageCircle">
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex gap-1.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="שאל על היומן…" className="bg-surface border-line focus:border-brand min-w-0 flex-1 rounded-xl border px-3 py-2 text-[13px] outline-none" />
        <button type="submit" disabled={pending} aria-label="שאל" className="btn-zono-primary grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"><Icon name={pending ? "Clock" : "Send"} size={15} /></button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">{chips.map((c) => <button key={c} onClick={() => ask(c)} className="bg-surface text-muted hover:text-ink rounded-lg px-2 py-1 text-[11px] font-bold">{c}</button>)}</div>
      {res && (
        <div className="mt-2.5 flex flex-col gap-1.5">
          <p className="text-ink text-[13px] leading-relaxed">{res.answer}</p>
          {res.events.slice(0, 3).map((e) => e.href ? <Link key={e.id} href={e.href} className="bg-surface text-ink truncate rounded-lg px-2 py-1 text-[11px] font-bold">{e.title} · {time(e.at)}</Link> : <span key={e.id} className="bg-surface text-ink truncate rounded-lg px-2 py-1 text-[11px] font-bold">{e.title} · {time(e.at)}</span>)}
        </div>
      )}
    </RailCard>
  );
}

function TeamCard({ team }: { team: BrokerAvailability[] }) {
  return (
    <RailCard title="זמינות הצוות" icon="Users">
      {team.length === 0 ? <p className="text-muted text-[12px]">אין נתוני זמינות.</p> : (
        <div className="flex flex-col gap-1.5">{team.slice(0, 6).map((b) => (
          <div key={b.brokerId} className="flex items-center justify-between gap-2">
            <span className="text-ink truncate text-[12px] font-bold">{b.name ?? "סוכן"}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-black ${AVAIL_TONE[b.state]}`}>{AVAIL_HE[b.state]}</span>
          </div>
        ))}</div>
      )}
    </RailCard>
  );
}

// ── Connections (premium, honest) ─────────────────────────────────────────────
function ConnectionsCard({ connectors, providers }: { connectors: ConnectorHealth[]; providers: CalendarProviderStatus[] }) {
  // Prefer the richer connector health; fall back to simple provider statuses.
  const rows = connectors.length > 0 ? connectors : providers.map((p) => ({ id: p.id, label: p.label, connected: p.connected, lastSyncAt: null, syncStatus: (p.connected ? "idle" : "not_connected") as ConnectorHealth["syncStatus"], capabilities: { list: false, create: false, update: false, delete: false }, note: p.note }));
  const LABEL: Record<string, string> = { google: "Google Calendar", microsoft: "Outlook", ical: "Apple Calendar" };
  return (
    <RailCard title="חיבורי יומן" icon="Calendar">
      <div className="flex flex-col gap-2">
        {rows.map((c) => (
          <div key={c.id} className="border-line rounded-xl border p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2"><span className="bg-surface text-ink grid h-7 w-7 place-items-center rounded-lg"><Icon name="Calendar" size={14} /></span><span className="text-ink text-[12px] font-black">{LABEL[c.id] ?? c.label}</span></div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${c.connected ? "bg-success-soft text-success" : "bg-line/70 text-muted"}`}>{c.connected ? "מחובר" : "לא מחובר"}</span>
            </div>
            <p className="text-muted mt-1 text-[10.5px]">{c.lastSyncAt ? `סונכרן: ${new Date(c.lastSyncAt).toLocaleString("he-IL")}` : "טרם סונכרן"}</p>
            <div className="mt-2 flex gap-1.5">
              {/* No OAuth connect / sync action exists yet — honest disabled state (never fake a connection). */}
              <button disabled title="בקרוב — חיבור יומן חיצוני" className="border-line text-muted flex-1 cursor-not-allowed rounded-lg border px-2 py-1 text-[11px] font-bold opacity-60">{c.connected ? "נהל" : "חבר"}</button>
              <button disabled title="בקרוב" className="border-line text-muted flex-1 cursor-not-allowed rounded-lg border px-2 py-1 text-[11px] font-bold opacity-60">סנכרן</button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-muted mt-2 text-[10.5px] leading-relaxed">חיבור ליומני Google / Outlook / Apple יופעל בהמשך. עד אז מוצג סטטוס אמיתי בלבד — ללא סנכרון מדומה.</p>
    </RailCard>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="border-line text-muted grid place-items-center rounded-2xl border border-dashed p-10 text-center text-[13px]">{label}</div>;
}
