"use client";
// ============================================================================
// 🗓️ ZONO — Calendar OS™ view. SCREEN 13. Premium scheduling command center.
// Cinematic hero + next-meeting spotlight + meeting prep + an intelligence rail
// (free slots, follow-ups, route, approval-gated reschedule proposal) + an honest
// provider-connection card. Agenda / Day / Week / Intel over the UNIFIED
// CalendarEvent stream. Read/propose only — nothing auto-books or auto-syncs.
// ============================================================================
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { EVENT_TYPE_HE, type CalendarEvent, type DayPlan, type BrokerAvailability, type CalendarProviderStatus, type AvailabilityState } from "@/lib/calendar-os/types";
import { optimizeRouteAction, proposeRescheduleAction, askCalendarAction } from "@/lib/calendar-os/actions";
import { getDayIntelligenceAction, getManagerViewAction, getMeetingPrepAction } from "@/lib/calendar-os/intelligence-actions";

type View = "agenda" | "day" | "week" | "intel";
type IntelState = Awaited<ReturnType<typeof getDayIntelligenceAction>>["intel"] | null;
type ManagerState = Awaited<ReturnType<typeof getManagerViewAction>>["view"] | null;
type RouteState = Awaited<ReturnType<typeof optimizeRouteAction>>["route"] | null;
type ReschedState = Awaited<ReturnType<typeof proposeRescheduleAction>>["proposal"] | null;
type AskState = Awaited<ReturnType<typeof askCalendarAction>>["result"] | null;
type PrepState = Awaited<ReturnType<typeof getMeetingPrepAction>>["prep"] | null;

const time = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "short" });
const MEETING_TYPES = new Set(["meeting", "property_visit", "buyer_visit", "seller_meeting", "open_house"]);

const TYPE_ICON: Record<string, string> = {
  meeting: "Calendar", property_visit: "MapPin", buyer_visit: "MapPin", seller_meeting: "Users",
  task: "Check", mission: "Sparkles", phone_call: "Phone", whatsapp_followup: "MessageCircle",
  photo_day: "Camera", open_house: "Home", facebook_publish: "Megaphone", marketing_campaign: "Megaphone",
  document_deadline: "FileText", signature: "FileText", reminder: "Clock",
};
const AVAIL_HE: Record<AvailabilityState, string> = { free: "פנוי", busy: "עסוק", meeting: "בפגישה", field: "בשטח", vacation: "חופשה", offline: "לא זמין" };
const AVAIL_TONE: Record<AvailabilityState, string> = { free: "bg-success-soft text-success", busy: "bg-warning-soft text-warning", meeting: "bg-brand-soft text-brand-strong", field: "bg-brand-soft text-brand-strong", vacation: "bg-line/70 text-muted", offline: "bg-line/70 text-muted" };
const PROVIDER_ICON: Record<string, string> = { google: "Calendar", microsoft: "Calendar", ical: "Calendar" };

function EventRow({ e }: { e: CalendarEvent }) {
  const body = (
    <div className={`bg-card border-line flex items-center gap-3 rounded-2xl border p-3 ${e.done ? "opacity-50" : ""}`}>
      <span className="bg-brand-soft text-brand-strong grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name={TYPE_ICON[e.type] ?? "Calendar"} size={16} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-ink truncate text-sm font-bold">{e.title}</p>
          <span className="text-muted shrink-0 text-[11px] font-bold tabular-nums">{e.allDay ? "כל היום" : time(e.start)}</span>
        </div>
        <p className="text-muted truncate text-[11px]">{EVENT_TYPE_HE[e.type]}{e.detail ? ` · ${e.detail}` : ""}{e.city ? ` · ${e.city}` : ""}</p>
      </div>
      {e.urgency >= 80 && !e.done && <span className="bg-danger-soft text-danger rounded-full px-2 py-0.5 text-[10px] font-bold">דחוף</span>}
    </div>
  );
  return e.href ? <Link href={e.href}>{body}</Link> : body;
}

function RailCard({ title, icon, children, tone = "brand" }: { title: string; icon: string; children: React.ReactNode; tone?: "brand" | "success" | "warning" }) {
  const iconCls = tone === "success" ? "bg-success-soft text-success" : tone === "warning" ? "bg-warning-soft text-warning" : "bg-brand-soft text-brand";
  return (
    <div className="bg-card border-line rounded-2xl border p-4">
      <div className="mb-2.5 flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-lg ${iconCls}`}><Icon name={icon} size={14} /></span><p className="text-ink text-[13px] font-extrabold">{title}</p></div>
      {children}
    </div>
  );
}

export function CalendarView({ plan, weekEvents, team, providers, todayIso }: {
  plan: DayPlan; weekEvents: CalendarEvent[]; team: BrokerAvailability[]; providers: CalendarProviderStatus[]; todayIso: string;
}) {
  const [view, setView] = useState<View>("agenda");
  const [route, setRoute] = useState<RouteState>(null);
  const [resched, setResched] = useState<ReschedState>(null);
  const [ask, setAsk] = useState<AskState>(null);
  const [q, setQ] = useState("");
  const [intel, setIntel] = useState<IntelState>(null);
  const [manager, setManager] = useState<ManagerState>(null);
  const [prep, setPrep] = useState<PrepState>(null);
  const [prepOpen, setPrepOpen] = useState(false);
  const [pending, start] = useTransition();

  // Auto-load day intelligence so the rail (free slots / follow-ups / route) is
  // ready without hunting. One read; nothing is written.
  useEffect(() => { start(async () => { const r = await getDayIntelligenceAction({ dateIso: todayIso }); setIntel(r.intel); }); }, [todayIso]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of weekEvents) { const k = dayKey(e.start); (map.get(k) ?? map.set(k, []).get(k)!).push(e); }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [weekEvents]);
  const todayEvents = useMemo(() => weekEvents.filter((e) => dayKey(e.start) === dayKey(todayIso)), [weekEvents, todayIso]);

  const nextMeeting = useMemo(() => {
    const now = new Date(todayIso).getTime() - 15 * 60000;
    const upcoming = weekEvents.filter((e) => !e.done && !e.allDay && new Date(e.start).getTime() >= now).sort((a, b) => a.start.localeCompare(b.start));
    return upcoming.find((e) => MEETING_TYPES.has(e.type)) ?? upcoming[0] ?? null;
  }, [weekEvents, todayIso]);
  const followUps = useMemo(() => (intel?.nextBest ?? []).filter((a) => a.kind === "followup" || a.kind === "reschedule"), [intel]);

  const loadManager = () => start(async () => { const r = await getManagerViewAction(); setManager(r.view); });
  const runRoute = () => start(async () => { const r = await optimizeRouteAction({ dateIso: todayIso }); setRoute(r.route); });
  const runResched = () => start(async () => { const r = await proposeRescheduleAction({ trigger: "manual", dateIso: todayIso }); setResched(r.proposal); });
  const runAsk = (question: string) => { if (!question.trim()) return; start(async () => { const r = await askCalendarAction(question); setAsk(r.result); }); };
  const loadPrep = (e: CalendarEvent) => {
    setPrepOpen((v) => !v || prep?.entity.id !== e.entity.id);
    if (e.entity.kind && e.entity.id) start(async () => { const r = await getMeetingPrepAction({ kind: e.entity.kind, id: e.entity.id! }); setPrep(r.prep); });
  };

  const anyConnected = providers.some((p) => p.connected);

  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-4 pb-20 pt-5">
      {/* ── Cinematic hero ──────────────────────────────────────────────────── */}
      <div className="bg-card border-line overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)]">
        <div className="bg-brand-soft p-5">
          <p className="text-brand text-xs font-bold">ZONO Calendar OS</p>
          <h1 className="text-ink mt-0.5 text-2xl font-black sm:text-3xl">מרכז השליטה ביומן</h1>
          <p className="text-muted mt-1 text-sm">
            {nextMeeting ? <>הפגישה הבאה שלך {nextMeeting.allDay ? "היום" : `בשעה ${time(nextMeeting.start)}`} · {nextMeeting.title}</> : "אין פגישות קרובות בלו״ז"}
          </p>
        </div>
        <div className="grid grid-cols-4">
          {[["אירועים היום", plan.summary.total], ["פגישות", plan.summary.meetings], ["משימות", plan.summary.tasks], ["באיחור", plan.summary.overdue]].map(([l, v], i) => (
            <div key={String(l)} className={`px-2 py-3 text-center ${i > 0 ? "border-line border-r" : ""}`}>
              <div className={`text-2xl font-black ${l === "באיחור" && (v as number) > 0 ? "text-danger" : "text-brand-strong"}`}>{v as number}</div>
              <div className="text-muted text-[10px] font-bold">{l as string}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Next meeting spotlight + prep ───────────────────────────────────── */}
      {nextMeeting && (
        <div className="bg-card border-line mt-5 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="zono-gradient grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white"><Icon name={TYPE_ICON[nextMeeting.type] ?? "Calendar"} size={20} /></span>
              <div className="min-w-0">
                <p className="text-brand text-[11px] font-bold">הפגישה הבאה</p>
                <p className="text-ink text-lg font-black leading-tight">{nextMeeting.title}</p>
                <p className="text-muted text-[12px] font-semibold">{nextMeeting.allDay ? "כל היום" : `${dayLabel(nextMeeting.start)} · ${time(nextMeeting.start)}`}{nextMeeting.city ? ` · ${nextMeeting.city}` : ""}{nextMeeting.detail ? ` · ${nextMeeting.detail}` : ""}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {nextMeeting.entity.kind && nextMeeting.entity.id && (
                <button onClick={() => loadPrep(nextMeeting)} disabled={pending} className="bg-brand-soft text-brand-strong inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50"><Icon name="Sparkles" size={14} /> הכנה לפגישה</button>
              )}
              {nextMeeting.href && <Link href={nextMeeting.href} className="bg-surface text-ink inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold"><Icon name="ArrowUpRight" size={14} /> פתח כרטיס</Link>}
            </div>
          </div>

          {prepOpen && prep && prep.entity.id === nextMeeting.entity.id && (
            <div className="border-line mt-4 rounded-2xl border p-4">
              <div className="mb-2 flex flex-wrap gap-2">
                <span className="bg-warning-soft text-warning rounded-full px-2.5 py-1 text-[11px] font-bold">סיכון {prep.riskLevel}</span>
                <span className="bg-success-soft text-success rounded-full px-2.5 py-1 text-[11px] font-bold">הזדמנות {prep.opportunityLevel}</span>
              </div>
              <p className="text-ink text-[12px] font-extrabold">נקודות לשיחה</p>
              <ul className="mt-1 flex flex-col gap-1">{prep.talkingPoints.map((tp, i) => <li key={i} className="text-muted flex items-start gap-2 text-[12px]"><span className="bg-brand mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />{tp}</li>)}</ul>
              {prep.afterMeeting.length > 0 && (
                <>
                  <p className="text-ink mt-3 text-[12px] font-extrabold">אחרי הפגישה</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">{prep.afterMeeting.map((a, i) => a.href ? <Link key={i} href={a.href} className="bg-surface text-ink rounded-full px-2.5 py-1 text-[11px] font-bold">{a.label}</Link> : <span key={i} className="bg-surface text-muted rounded-full px-2.5 py-1 text-[11px] font-bold">{a.label}</span>)}</div>
                </>
              )}
            </div>
          )}
          {prepOpen && pending && !prep && <p className="text-muted mt-3 text-[12px]">מכין נקודות לפגישה…</p>}
        </div>
      )}

      {/* ── Main grid: agenda / rail ────────────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Left — views */}
        <div>
          <div className="bg-card border-line flex gap-1 rounded-2xl border p-1">
            {(["agenda", "day", "week", "intel"] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`flex-1 rounded-xl py-2 text-[12px] font-bold transition ${view === v ? "zono-gradient text-white" : "text-muted"}`}>
                {v === "agenda" ? "סדר יום" : v === "day" ? "היום" : v === "week" ? "שבוע" : "אינטליגנציה"}
              </button>
            ))}
          </div>

          {view === "agenda" && (
            <section className="mt-4">
              <h2 className="text-ink mb-2 text-[15px] font-black">סדר היום המומלץ</h2>
              {plan.slots.length === 0 ? <Empty icon="Calendar" label="אין אירועים מתוזמנים להיום" hint="כשייקבעו פגישות, ביקורים ומשימות — הם יופיעו כאן לפי סדר עדיפות חכם." /> : (
                <div className="space-y-2">{plan.slots.map((sl) => (
                  <div key={sl.event.id} className="flex items-start gap-2">
                    <span className="zono-gradient mt-3 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black text-white">{sl.rank}</span>
                    <div className="min-w-0 flex-1"><EventRow e={sl.event} />{sl.reason && <p className="text-muted mt-0.5 pr-1 text-[10px]">{sl.reason}</p>}</div>
                  </div>
                ))}</div>
              )}
            </section>
          )}

          {view === "day" && (
            <section className="mt-4">
              <h2 className="text-ink mb-2 text-[15px] font-black">{dayLabel(todayIso)}</h2>
              {todayEvents.length === 0 ? <Empty icon="Calendar" label="אין אירועים היום" hint="יום פנוי — הזדמנות טובה לקבוע צפיות או לתאם מעקבים." /> : <div className="space-y-2">{todayEvents.map((e) => <EventRow key={e.id} e={e} />)}</div>}
            </section>
          )}

          {view === "week" && (
            <section className="mt-4 space-y-4">
              {byDay.length === 0 ? <Empty icon="Calendar" label="אין אירועים השבוע" hint="השבוע פנוי — תכננו קדימה." /> : byDay.map(([k, evs]) => (
                <div key={k}>
                  <h3 className="text-ink mb-1.5 text-[13px] font-black">{dayLabel(k)} <span className="text-muted font-bold">({evs.length})</span></h3>
                  <div className="space-y-2">{evs.map((e) => <EventRow key={e.id} e={e} />)}</div>
                </div>
              ))}
            </section>
          )}

          {view === "intel" && (
            <section className="mt-4 space-y-4">
              {!intel ? <Empty icon="Sparkles" label={pending ? "מחשב אינטליגנציה…" : "טוען…"} /> : (
                <>
                  <div className="bg-card border-line rounded-2xl border p-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-ink text-[15px] font-black">בריאות היומן</h2>
                      <span className="zono-gradient rounded-full px-3 py-1 text-[13px] font-black text-white">{intel.health.calendarScore} · {intel.health.grade}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {[["עומס", intel.health.busyPct], ["נסיעות", intel.health.travelPct], ["פגישות", intel.health.meetingsPct], ["מעקבים", intel.health.followupsPct]].map(([l, v]) => (
                        <div key={String(l)} className="bg-surface rounded-xl px-1 py-2 text-center"><div className="text-brand text-base font-black">{v as number}%</div><div className="text-muted text-[9px] font-bold">{l as string}</div></div>
                      ))}
                    </div>
                    {(intel.health.lateResponses > 0 || intel.health.missedOpportunities > 0) && <p className="text-warning mt-2 text-[11px] font-bold">{intel.health.lateResponses} תגובות באיחור · {intel.health.missedOpportunities} הזדמנויות שפוספסו</p>}
                  </div>

                  <div>
                    <h2 className="text-ink mb-2 text-[15px] font-black">מה לעשות עכשיו</h2>
                    {intel.nextBest.length === 0 ? <Empty icon="Check" label="אין פעולות דחופות." /> : (
                      <div className="space-y-2">{intel.nextBest.map((a, i) => (
                        a.href ? <Link key={i} href={a.href} className="bg-card border-line flex items-center gap-3 rounded-2xl border p-3">
                          <span className="bg-brand-soft text-brand-strong grid h-8 w-8 shrink-0 place-items-center rounded-xl"><Icon name={a.kind === "call" ? "Phone" : a.kind === "drive" ? "MapPin" : a.kind === "followup" ? "Clock" : "Calendar"} size={15} /></span>
                          <div className="min-w-0 flex-1"><p className="text-ink truncate text-[13px] font-bold">{a.title}</p><p className="text-muted truncate text-[11px]">{a.why}</p></div>
                          {a.urgency >= 90 && <span className="bg-danger-soft text-danger rounded-full px-2 py-0.5 text-[10px] font-bold">דחוף</span>}
                        </Link> : <div key={i} className="bg-card border-line rounded-2xl border p-3 text-[13px]">{a.title}</div>
                      ))}</div>
                    )}
                  </div>

                  {intel.routing.merges.length > 0 && (
                    <div className="bg-card border-line rounded-2xl border p-3">
                      <h2 className="text-ink text-[14px] font-black">מסלול חכם · {intel.routing.route.totalKm} ק״מ</h2>
                      {intel.routing.merges.map((m, i) => <p key={i} className="text-muted mt-1 text-[12px]">• {m}</p>)}
                      <p className="text-muted mt-1 text-[10px]">{intel.routing.note}</p>
                    </div>
                  )}

                  {intel.optimization.warnings.length > 0 && (
                    <div className="bg-warning-soft/40 border-warning/30 rounded-2xl border p-3">
                      <h2 className="text-ink text-[14px] font-black">שיפורים מוצעים</h2>
                      {intel.optimization.warnings.map((w, i) => <p key={i} className="text-muted mt-1 text-[12px]">• {w}</p>)}
                      <p className="text-warning mt-1 text-[10px] font-bold">{intel.optimization.note}</p>
                    </div>
                  )}

                  <div>
                    <button onClick={loadManager} disabled={pending} className="bg-surface text-ink inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50"><Icon name="Users" size={14} /> מבט מנהל — עומסי צוות</button>
                    {manager && (
                      <div className="bg-card border-line mt-2 rounded-2xl border p-3">
                        <p className="text-ink text-[13px] font-black">{manager.freeBrokers} פנויים · {manager.overloadedBrokers} עמוסים · כיסוי {manager.coveragePct}%</p>
                        <div className="mt-2 flex flex-wrap gap-2">{manager.brokers.map((b) => (
                          <span key={b.brokerId} className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${b.state === "overloaded" ? "bg-danger-soft text-danger" : b.state === "free" ? "bg-success-soft text-success" : "bg-surface text-muted"}`}>{b.name ?? "ברוקר"} · {b.events}</span>
                        ))}</div>
                        <p className="text-muted mt-1 text-[11px]">{manager.note}</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          )}
        </div>

        {/* Right — command rail */}
        <aside className="space-y-4">
          {/* Free slots — where a viewing can fit */}
          <RailCard title="חלונות פנויים לצפייה" icon="Clock" tone="success">
            {intel && intel.freeSlots.length > 0 ? (
              <div className="space-y-1.5">{intel.freeSlots.map((sl, i) => (
                <div key={i} className="bg-success-soft/40 flex items-center justify-between rounded-xl px-3 py-2">
                  <span className="text-ink text-[12px] font-bold tabular-nums">{time(sl.start)}–{time(sl.end)} ({sl.minutes}′)</span>
                  <span className="text-success text-[10px] font-bold">{sl.suggestion}</span>
                </div>
              ))}</div>
            ) : <p className="text-muted text-[12px]">{intel ? "אין חלונות פנויים משמעותיים היום." : "טוען…"}</p>}
          </RailCard>

          {/* Overdue follow-ups */}
          <RailCard title="מעקבים ודחיפויות" icon="Clock" tone="warning">
            {followUps.length > 0 ? (
              <div className="space-y-1.5">{followUps.map((a, i) => (
                a.href ? <Link key={i} href={a.href} className="bg-surface flex items-center justify-between gap-2 rounded-xl px-3 py-2"><span className="text-ink truncate text-[12px] font-bold">{a.title}</span><span className="text-warning shrink-0 text-[10px] font-bold">{a.why}</span></Link>
                  : <div key={i} className="bg-surface rounded-xl px-3 py-2 text-[12px]">{a.title}</div>
              ))}</div>
            ) : <p className="text-muted text-[12px]">{intel ? "אין מעקבים באיחור ✓" : "טוען…"}</p>}
          </RailCard>

          {/* Planning tools — route + approval-gated reschedule proposal */}
          <RailCard title="תכנון היום" icon="Route">
            <div className="flex flex-wrap gap-2">
              <button onClick={runRoute} disabled={pending} className="bg-brand-soft text-brand-strong inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold disabled:opacity-50"><Icon name="Route" size={13} /> מסלול</button>
              <button onClick={runResched} disabled={pending} className="bg-surface text-ink inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold disabled:opacity-50"><Icon name="Clock" size={13} /> הצע שינוי סדר יום</button>
            </div>
            {route && (
              <div className="mt-2.5">
                <p className="text-ink text-[12px] font-black">מסלול · {route.totalKm} ק״מ</p>
                <ol className="mt-1 space-y-1">{route.order.map((st, i) => <li key={st.eventId} className="text-muted flex items-center gap-2 text-[11px]"><span className="bg-brand-soft text-brand-strong grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold">{i + 1}</span>{st.title}{st.city ? ` · ${st.city}` : ""}</li>)}</ol>
              </div>
            )}
            {resched && (
              <div className="bg-warning-soft/40 mt-2.5 rounded-xl p-2.5">
                <p className="text-ink text-[12px] font-black">הצעת שינוי (דורשת אישורך)</p>
                {resched.moved.map((m) => <p key={m.eventId} className="text-muted mt-0.5 text-[11px]">• {m.title} — {m.why}</p>)}
                <p className="text-warning mt-1 text-[10px] font-bold">{resched.note}</p>
              </div>
            )}
          </RailCard>

          {/* Ask the calendar */}
          <RailCard title="שאל את היומן" icon="Sparkles">
            <div className="flex flex-wrap gap-1.5">
              {["מה הפגישה הבאה?", "למי להתקשר?", "לאן לנסוע?", "מתי אני פנוי?"].map((sug) => (
                <button key={sug} onClick={() => runAsk(sug)} className="bg-surface text-ink rounded-full px-2.5 py-1 text-[11px] font-bold">{sug}</button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runAsk(q)} placeholder="שאלה על היומן…" className="border-line bg-surface text-ink w-full rounded-xl border px-3 py-2 text-[13px] outline-none" />
              <button onClick={() => runAsk(q)} disabled={pending} className="zono-gradient shrink-0 rounded-xl px-3 text-white disabled:opacity-50"><Icon name="Send" size={15} /></button>
            </div>
            {ask && (
              <div className="mt-2">
                <p className="text-ink text-[12px] font-bold">{ask.answer}</p>
                <div className="mt-1.5 space-y-1">{ask.events.map((e) => e.href ? <Link key={e.id} href={e.href} className="bg-surface flex items-center justify-between rounded-lg px-2.5 py-1.5"><span className="text-ink text-[11px] font-bold">{e.title}</span><span className="text-muted text-[10px]">{e.at ? time(e.at) : ""}</span></Link> : <div key={e.id} className="bg-surface rounded-lg px-2.5 py-1.5 text-[11px]">{e.title}</div>)}</div>
              </div>
            )}
          </RailCard>

          {/* Team availability */}
          {team.length > 0 && (
            <RailCard title="זמינות הצוות" icon="Users">
              <div className="flex flex-wrap gap-2">{team.map((t) => (
                <span key={t.brokerId} className="bg-surface inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${AVAIL_TONE[t.state]}`}>{AVAIL_HE[t.state]}</span>
                  <span className="text-ink text-[11px] font-bold">{t.name ?? "ברוקר"}</span>
                  <span className="text-muted text-[10px]">{t.todayEvents}</span>
                </span>
              ))}</div>
            </RailCard>
          )}

          {/* Provider connection — honest state, no dead sync buttons */}
          <div className="bg-card border-line rounded-2xl border p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2"><span className="bg-brand-soft text-brand grid h-7 w-7 place-items-center rounded-lg"><Icon name="Calendar" size={14} /></span><p className="text-ink text-[13px] font-extrabold">יומנים חיצוניים</p></div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${anyConnected ? "bg-success-soft text-success" : "bg-surface text-muted"}`}>{anyConnected ? "מחובר" : "לא מחובר"}</span>
            </div>
            <div className="space-y-1.5">
              {providers.map((p) => (
                <div key={p.id} className="bg-surface flex items-center justify-between rounded-xl px-3 py-2">
                  <span className="text-ink inline-flex items-center gap-1.5 text-[12px] font-bold"><Icon name={PROVIDER_ICON[p.id] ?? "Calendar"} size={13} /> {p.label}</span>
                  <span className={`text-[10px] font-bold ${p.connected ? "text-success" : "text-muted"}`}>{p.connected ? "מסונכרן" : "בקרוב"}</span>
                </div>
              ))}
            </div>
            {!anyConnected && <p className="text-muted mt-2 text-[11px] leading-relaxed">סנכרון דו-כיווני ל-Google ו-Outlook יתווסף בקרוב. עד אז, Calendar OS כבר מאחד את כל הפגישות, המשימות והמעקבים במקום אחד — ללא צורך בסנכרון חיצוני.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Empty({ icon = "Calendar", label, hint }: { icon?: string; label: string; hint?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border px-6 py-10 text-center">
      <span className="bg-brand-soft text-brand mx-auto grid h-12 w-12 place-items-center rounded-2xl"><Icon name={icon} size={22} /></span>
      <p className="text-ink mt-3 text-sm font-extrabold">{label}</p>
      {hint && <p className="text-muted mx-auto mt-1 max-w-xs text-[12px] leading-relaxed">{hint}</p>}
    </div>
  );
}
