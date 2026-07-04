"use client";
// ============================================================================
// 🗓️ ZONO — Calendar OS™ view. PHASE 43.0. Premium RTL glass, mobile-first.
// Agenda / Day / Week over the UNIFIED CalendarEvent stream + AI day plan +
// route optimization + smart reschedule (proposal only) + team availability +
// Ask (scheduling Q&A) + provider status. Read/propose only — nothing auto-changes.
// ============================================================================
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { EVENT_TYPE_HE, type CalendarEvent, type DayPlan, type BrokerAvailability, type CalendarProviderStatus, type AvailabilityState } from "@/lib/calendar-os/types";
import { optimizeRouteAction, proposeRescheduleAction, askCalendarAction } from "@/lib/calendar-os/actions";
import { getDayIntelligenceAction, getManagerViewAction } from "@/lib/calendar-os/intelligence-actions";

type View = "agenda" | "day" | "week" | "intel";
type IntelState = Awaited<ReturnType<typeof getDayIntelligenceAction>>["intel"] | null;
type ManagerState = Awaited<ReturnType<typeof getManagerViewAction>>["view"] | null;
type RouteState = Awaited<ReturnType<typeof optimizeRouteAction>>["route"] | null;
type ReschedState = Awaited<ReturnType<typeof proposeRescheduleAction>>["proposal"] | null;
type AskState = Awaited<ReturnType<typeof askCalendarAction>>["result"] | null;

const time = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "short" });

const TYPE_ICON: Record<string, string> = {
  meeting: "Calendar", property_visit: "MapPin", buyer_visit: "MapPin", seller_meeting: "Users",
  task: "Check", mission: "Sparkles", phone_call: "Phone", whatsapp_followup: "MessageCircle",
  photo_day: "Camera", open_house: "Home", facebook_publish: "Megaphone", marketing_campaign: "Megaphone",
  document_deadline: "FileText", signature: "FileText", reminder: "Clock",
};
const AVAIL_HE: Record<AvailabilityState, string> = { free: "פנוי", busy: "עסוק", meeting: "בפגישה", field: "בשטח", vacation: "חופשה", offline: "לא זמין" };
const AVAIL_TONE: Record<AvailabilityState, string> = { free: "bg-success-soft text-success", busy: "bg-warning-soft text-warning", meeting: "bg-brand-soft text-brand-strong", field: "bg-brand-soft text-brand-strong", vacation: "bg-line/70 text-muted", offline: "bg-line/70 text-muted" };

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
  const [pending, start] = useTransition();

  const openIntel = () => { setView("intel"); if (!intel) start(async () => { const r = await getDayIntelligenceAction({ dateIso: todayIso }); setIntel(r.intel); }); };
  const loadManager = () => start(async () => { const r = await getManagerViewAction(); setManager(r.view); });

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of weekEvents) { const k = dayKey(e.start); (map.get(k) ?? map.set(k, []).get(k)!).push(e); }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [weekEvents]);
  const todayEvents = useMemo(() => weekEvents.filter((e) => dayKey(e.start) === dayKey(todayIso)), [weekEvents, todayIso]);

  const runRoute = () => start(async () => { const r = await optimizeRouteAction({ dateIso: todayIso }); setRoute(r.route); });
  const runResched = () => start(async () => { const r = await proposeRescheduleAction({ trigger: "manual", dateIso: todayIso }); setResched(r.proposal); });
  const runAsk = (question: string) => { if (!question.trim()) return; start(async () => { const r = await askCalendarAction(question); setAsk(r.result); }); };

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 pb-20 pt-5">
      {/* Header */}
      <div className="bg-brand-soft rounded-[22px] p-4">
        <p className="text-brand text-xs font-bold">ZONO Calendar OS</p>
        <h1 className="text-ink mt-0.5 text-2xl font-black">🗓️ היומן שלי</h1>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[["אירועים", plan.summary.total], ["פגישות", plan.summary.meetings], ["משימות", plan.summary.tasks], ["באיחור", plan.summary.overdue]].map(([l, v]) => (
            <div key={String(l)} className="bg-card rounded-xl px-1 py-2 text-center"><div className="text-brand text-lg font-black">{v as number}</div><div className="text-muted text-[9px] font-bold">{l as string}</div></div>
          ))}
        </div>
      </div>

      {/* View switcher */}
      <div className="bg-card border-line mt-4 flex gap-1 rounded-2xl border p-1">
        {(["agenda", "day", "week", "intel"] as View[]).map((v) => (
          <button key={v} onClick={() => (v === "intel" ? openIntel() : setView(v))} className={`flex-1 rounded-xl py-2 text-[12px] font-bold transition ${view === v ? "zono-gradient text-white" : "text-muted"}`}>
            {v === "agenda" ? "סדר יום" : v === "day" ? "היום" : v === "week" ? "שבוע" : "אינטליגנציה"}
          </button>
        ))}
      </div>

      {/* Quick actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={runRoute} disabled={pending} className="bg-brand-soft text-brand-strong inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50"><Icon name="Route" size={14} /> אופטימיזציית מסלול</button>
        <button onClick={runResched} disabled={pending} className="bg-surface text-ink inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50"><Icon name="Clock" size={14} /> הצעת שינוי סדר יום</button>
      </div>

      {/* Route result */}
      {route && (
        <div className="bg-card border-line mt-3 rounded-2xl border p-3">
          <p className="text-ink text-sm font-black">מסלול מומלץ · {route.totalKm} ק״מ</p>
          <ol className="mt-2 space-y-1">
            {route.order.map((st, i) => <li key={st.eventId} className="text-muted flex items-center gap-2 text-[12px]"><span className="bg-brand-soft text-brand-strong grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold">{i + 1}</span> {st.title}{st.city ? ` · ${st.city}` : ""}</li>)}
          </ol>
          {route.unlocated.length > 0 && <p className="text-muted mt-1 text-[11px]">{route.unlocated.length} אירועים ללא מיקום גיאוגרפי.</p>}
        </div>
      )}
      {/* Reschedule proposal */}
      {resched && (
        <div className="bg-warning-soft/40 border-warning/30 mt-3 rounded-2xl border p-3">
          <p className="text-ink text-sm font-black">הצעת שינוי</p>
          {resched.moved.map((m) => <p key={m.eventId} className="text-muted mt-1 text-[12px]">• {m.title} — {m.why}</p>)}
          <p className="text-warning mt-2 text-[11px] font-bold">{resched.note}</p>
        </div>
      )}

      {/* Ask */}
      <div className="bg-card border-line mt-4 rounded-2xl border p-3">
        <div className="text-brand text-[13px] font-black">✨ שאל את היומן</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["מה הפגישה הבאה שלי?", "למי להתקשר עכשיו?", "לאן לנסוע?", "מתי אני פנוי?", "מה כדאי לדחות?"].map((sug) => (
            <button key={sug} onClick={() => runAsk(sug)} className="bg-surface text-ink rounded-full px-2.5 py-1 text-[11px] font-bold">{sug}</button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runAsk(q)} placeholder="שאלה על היומן…" className="border-line bg-surface text-ink w-full rounded-xl border px-3 py-2 text-sm outline-none" />
          <button onClick={() => runAsk(q)} disabled={pending} className="zono-gradient rounded-xl px-3 text-white disabled:opacity-50"><Icon name="Send" size={16} /></button>
        </div>
        {ask && (
          <div className="mt-2">
            <p className="text-ink text-[13px] font-bold">{ask.answer}</p>
            <div className="mt-1.5 space-y-1">{ask.events.map((e) => e.href ? <Link key={e.id} href={e.href} className="bg-surface flex items-center justify-between rounded-lg px-2.5 py-1.5"><span className="text-ink text-[12px] font-bold">{e.title}</span><span className="text-muted text-[10px]">{e.at ? time(e.at) : ""}</span></Link> : <div key={e.id} className="bg-surface rounded-lg px-2.5 py-1.5 text-[12px]">{e.title}</div>)}</div>
          </div>
        )}
      </div>

      {/* Main content */}
      {view === "agenda" && (
        <section className="mt-5">
          <h2 className="text-ink mb-2 text-[15px] font-black">סדר היום המומלץ</h2>
          {plan.slots.length === 0 ? <Empty label="אין אירועים מתוזמנים להיום" /> : (
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
        <section className="mt-5">
          <h2 className="text-ink mb-2 text-[15px] font-black">{dayLabel(todayIso)}</h2>
          {todayEvents.length === 0 ? <Empty label="אין אירועים היום" /> : <div className="space-y-2">{todayEvents.map((e) => <EventRow key={e.id} e={e} />)}</div>}
        </section>
      )}

      {view === "week" && (
        <section className="mt-5 space-y-4">
          {byDay.length === 0 ? <Empty label="אין אירועים השבוע" /> : byDay.map(([k, evs]) => (
            <div key={k}>
              <h3 className="text-ink mb-1.5 text-[13px] font-black">{dayLabel(k)} <span className="text-muted font-bold">({evs.length})</span></h3>
              <div className="space-y-2">{evs.map((e) => <EventRow key={e.id} e={e} />)}</div>
            </div>
          ))}
        </section>
      )}

      {view === "intel" && (
        <section className="mt-5 space-y-4">
          {!intel ? <Empty label={pending ? "מחשב אינטליגנציה…" : "טוען…"} /> : (
            <>
              {/* Calendar health */}
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
                {(intel.health.lateResponses > 0 || intel.health.missedOpportunities > 0) && (
                  <p className="text-warning mt-2 text-[11px] font-bold">{intel.health.lateResponses} תגובות באיחור · {intel.health.missedOpportunities} הזדמנויות שפוספסו</p>
                )}
              </div>

              {/* Next best actions */}
              <div>
                <h2 className="text-ink mb-2 text-[15px] font-black">מה לעשות עכשיו</h2>
                {intel.nextBest.length === 0 ? <Empty label="אין פעולות דחופות." /> : (
                  <div className="space-y-2">{intel.nextBest.map((a, i) => (
                    a.href ? <Link key={i} href={a.href} className="bg-card border-line flex items-center gap-3 rounded-2xl border p-3">
                      <span className="bg-brand-soft text-brand-strong grid h-8 w-8 shrink-0 place-items-center rounded-xl"><Icon name={a.kind === "call" ? "Phone" : a.kind === "drive" ? "MapPin" : a.kind === "followup" ? "Clock" : "Calendar"} size={15} /></span>
                      <div className="min-w-0 flex-1"><p className="text-ink truncate text-[13px] font-bold">{a.title}</p><p className="text-muted truncate text-[11px]">{a.why}</p></div>
                      {a.urgency >= 90 && <span className="bg-danger-soft text-danger rounded-full px-2 py-0.5 text-[10px] font-bold">דחוף</span>}
                    </Link> : <div key={i} className="bg-card border-line rounded-2xl border p-3 text-[13px]">{a.title}</div>
                  ))}</div>
                )}
              </div>

              {/* Free slots */}
              {intel.freeSlots.length > 0 && (
                <div>
                  <h2 className="text-ink mb-2 text-[15px] font-black">חלונות פנויים</h2>
                  <div className="space-y-2">{intel.freeSlots.map((sl, i) => (
                    <div key={i} className="bg-success-soft/40 border-success/20 flex items-center justify-between rounded-2xl border p-3">
                      <span className="text-ink text-[13px] font-bold">{time(sl.start)}–{time(sl.end)} ({sl.minutes} דק׳)</span>
                      <span className="text-success text-[11px] font-bold">{sl.suggestion}</span>
                    </div>
                  ))}</div>
                </div>
              )}

              {/* Smart routing merges */}
              {intel.routing.merges.length > 0 && (
                <div className="bg-card border-line rounded-2xl border p-3">
                  <h2 className="text-ink text-[14px] font-black">מסלול חכם · {intel.routing.route.totalKm} ק״מ</h2>
                  {intel.routing.merges.map((m, i) => <p key={i} className="text-muted mt-1 text-[12px]">• {m}</p>)}
                  <p className="text-muted mt-1 text-[10px]">{intel.routing.note}</p>
                </div>
              )}

              {/* Day optimizer warnings */}
              {intel.optimization.warnings.length > 0 && (
                <div className="bg-warning-soft/40 border-warning/30 rounded-2xl border p-3">
                  <h2 className="text-ink text-[14px] font-black">שיפורים מוצעים</h2>
                  {intel.optimization.warnings.map((w, i) => <p key={i} className="text-muted mt-1 text-[12px]">• {w}</p>)}
                  <p className="text-warning mt-1 text-[10px] font-bold">{intel.optimization.note}</p>
                </div>
              )}

              {/* Manager view */}
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

      {/* Team availability */}
      {team.length > 0 && (
        <section className="mt-6">
          <h2 className="text-ink mb-2 text-[15px] font-black">זמינות הצוות</h2>
          <div className="flex flex-wrap gap-2">
            {team.map((t) => (
              <div key={t.brokerId} className="bg-card border-line flex items-center gap-2 rounded-xl border px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${AVAIL_TONE[t.state]}`}>{AVAIL_HE[t.state]}</span>
                <span className="text-ink text-[12px] font-bold">{t.name ?? "ברוקר"}</span>
                <span className="text-muted text-[10px]">{t.todayEvents} אירועים</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Providers (foundation — not connected) */}
      <section className="mt-6">
        <h2 className="text-muted mb-2 text-[12px] font-black">סנכרון יומנים חיצוניים</h2>
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => (
            <span key={p.id} className="bg-surface text-muted inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold"><Icon name="Calendar" size={12} /> {p.label} — {p.connected ? "מחובר" : "בקרוב"}</span>
          ))}
        </div>
      </section>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="bg-card border-line rounded-2xl border p-8 text-center"><p className="text-muted text-sm font-bold">{label}</p></div>;
}
