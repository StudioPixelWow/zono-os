"use client";
// ============================================================================
// ZONO — המרכז היומי / Daily Command Center (client). A calm plan-and-execute
// screen: compact header + daily progress, a summary strip that FILTERS the day,
// an "עכשיו" card (the single next action), a two-column body (a time-anchored
// day timeline · a "בהמשך היום" side column), and ONE ZI recommendation. All data
// is the real getAgentDailyPlan() plan; every CTA opens the real entity engine
// (nothing is faked, completion is never mocked — the plan re-derives on reload).
// Persisting mark-done/snooze/reschedule/reorder + ZI re-plan are surfaced as
// deferred (they need a plan-item action layer that does not yet exist). RTL.
// ============================================================================
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { SurfaceTabs } from "@/components/navigation/SurfaceTabs";
import { recordUsageAction } from "@/lib/launch/server/actions";
import { type DailyPlan, type DailyPlanItem } from "@/lib/daily/daily-plan-core";
import type { DailyMarketing, DailyHeroSummary, DailyTeamException, DailyPipeline } from "@/lib/daily/priority";

interface RailData { marketing: DailyMarketing; hero: DailyHeroSummary; team: DailyTeamException[]; pipeline: DailyPipeline | null; isManager: boolean; userFirstName: string }

const TIME_FMT = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
const DATE_FMT = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" });
const HOUR_FMT = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: "Asia/Jerusalem" });
const timeHe = (iso: string | null) => (iso ? TIME_FMT.format(new Date(iso)) : null);
const hourOf = (iso: string) => parseInt(HOUR_FMT.format(new Date(iso)), 10) || 0;
const PRI_DOT: Record<string, string> = { P0: "bg-danger", P1: "bg-warning", P2: "bg-muted/50" };

function track(name: string, props?: Record<string, string | number | boolean>) { void recordUsageAction({ category: "feature", name, props }); }

// One plan item as a real link into its engine (open lead / viewing / deal …).
function ItemRow({ it }: { it: DailyPlanItem }) {
  const t = timeHe(it.dueAt);
  return (
    <Link href={it.route} onClick={() => track("daily_item_opened", { type: it.type, priority: it.priority })}
      className={`bg-card border-line flex items-center gap-3 rounded-2xl border p-3 transition hover:shadow-[var(--shadow-card)] ${it.status === "done" ? "opacity-60" : ""}`}>
      {t
        ? <div className="bg-brand-soft text-brand grid h-11 w-12 shrink-0 place-items-center rounded-xl text-[13px] font-black tabular-nums">{t}</div>
        : <div className="bg-surface text-muted grid h-11 w-11 shrink-0 place-items-center rounded-xl"><Icon name={it.icon} size={17} /></div>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${PRI_DOT[it.priority]}`} />
          <p className="text-ink truncate text-[13px] font-extrabold">{it.title}</p>
          {it.fixedTime && <span className="bg-brand-soft text-brand rounded-full px-1.5 py-0.5 text-[9.5px] font-bold">קבוע</span>}
          {it.status === "done" && <span className="bg-success-soft text-success rounded-full px-1.5 py-0.5 text-[9.5px] font-bold">בוצע</span>}
        </div>
        <p className="text-muted truncate text-[11.5px]">{it.reason}</p>
      </div>
      <div className="text-muted flex shrink-0 flex-col items-end gap-0.5 text-[10.5px]">
        <span>{it.estimatedMinutes} ד׳</span>
        <span className="text-brand font-bold">{it.cta} ←</span>
      </div>
    </Link>
  );
}

function SideList({ title, icon, items, empty, tone }: { title: string; icon: string; items: DailyPlanItem[]; empty: string; tone: string }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-3.5">
      <p className="text-ink mb-2 flex items-center gap-1.5 text-[12.5px] font-black"><Icon name={icon} size={14} className={tone} />{title}{items.length > 0 && <span className="text-muted font-normal">· {items.length}</span>}</p>
      {items.length === 0 ? <p className="text-muted py-1 text-[11.5px]">{empty}</p> : <div className="flex flex-col gap-2">{items.map((it) => <ItemRow key={it.id} it={it} />)}</div>}
    </div>
  );
}

export function DailyPlanBoard({ plan, rail }: { plan: DailyPlan; rail: RailData }) {
  const today = DATE_FMT.format(new Date());
  const primary = plan.primaryAction;
  const [filter, setFilter] = useState<"all" | "attention" | "fixed" | "should" | "done">("all");

  const doneCount = plan.doneToday.length;
  const pendingCount = plan.items.filter((i) => i.status !== "done").length;
  const totalCount = doneCount + pendingCount;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // Timed items → the day timeline, grouped morning / noon / afternoon.
  const timed = useMemo(() => plan.items.filter((i) => i.dueAt && i.status !== "done").sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!)), [plan.items]);
  const groups = useMemo(() => ({
    morning: timed.filter((i) => hourOf(i.dueAt!) < 12),
    noon: timed.filter((i) => { const h = hourOf(i.dueAt!); return h >= 12 && h < 16; }),
    afternoon: timed.filter((i) => hourOf(i.dueAt!) >= 16),
  }), [timed]);

  // Side column (untimed, prioritized). "הבא בתור" = first pending after primary.
  const nextUp = plan.items.find((i) => i.status !== "done" && i.id !== primary?.id) ?? null;
  const attention = plan.buckets.needsAttention.filter((i) => i.id !== primary?.id).slice(0, 3);
  const quickWins = [...plan.buckets.ifTime].sort((a, b) => a.estimatedMinutes - b.estimatedMinutes).slice(0, 3);

  const CHIPS = [
    { key: "attention" as const, label: "דורש טיפול", n: plan.summary.mustDo, dot: "bg-danger" },
    { key: "fixed" as const, label: "פגישות", n: plan.summary.fixed, dot: "bg-brand" },
    { key: "should" as const, label: "כדאי היום", n: plan.summary.shouldToday, dot: "bg-warning" },
    { key: "done" as const, label: "הושלמו", n: doneCount, dot: "bg-success" },
  ];
  const filteredFlat: DailyPlanItem[] | null =
    filter === "attention" ? plan.buckets.needsAttention
    : filter === "fixed" ? plan.buckets.fixedTime.filter((i) => i.status !== "done")
    : filter === "should" ? plan.buckets.shouldToday
    : null;

  // One ZI recommendation, grounded in the real plan (no generic AI text).
  const ziRec = attention.length > 0
    ? { title: `${plan.summary.mustDo} ${plan.summary.mustDo === 1 ? "פעולה דורשת" : "פעולות דורשות"} טיפול`, text: "טיפול עכשיו יכול לקדם עסקאות עוד היום.", href: attention[0].route, cta: "פתח את הפעולה" }
    : primary
      ? { title: primary.title, text: primary.reason, href: primary.route, cta: primary.cta }
      : null;

  return (
    <div dir="rtl" className="mx-auto flex max-w-6xl flex-col gap-4 pb-24">
      <SurfaceTabs active="today" isManager={rail.isManager} />

      {/* ── Compact header + daily progress ─────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-ink text-xl font-black leading-tight">היום שלך, {rail.userFirstName} 👋</h1>
          <p className="text-muted text-[13px] font-medium">{today} · הנה התכנית החכמה שלך להיום</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/brain" className="border-line text-ink hover:border-brand-light bg-card flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold transition"><Icon name="Sparkles" size={14} className="text-brand" />תכנון מחדש עם ZI</Link>
          <Link href="/calendar" className="border-line text-muted hover:text-ink hover:border-brand-light bg-card flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold transition"><Icon name="Plus" size={14} />הוסף פעולה</Link>
        </div>
      </header>
      {totalCount > 0 && (
        <div className="flex items-center gap-3">
          <div className="bg-surface h-2 flex-1 overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full transition-[width]" style={{ width: `${pct}%` }} /></div>
          <span className="text-ink shrink-0 text-[12.5px] font-black">{pct}% הושלם · {doneCount} מתוך {totalCount}</span>
        </div>
      )}

      {/* ── Daily summary strip (filters the timeline) ──────────────────────── */}
      <div className="border-line bg-card shadow-[var(--shadow-soft)] flex flex-wrap items-stretch divide-x divide-x-reverse divide-[var(--line)] overflow-hidden rounded-2xl">
        {CHIPS.map((c) => {
          const on = filter === c.key;
          return (
            <button key={c.key} type="button" onClick={() => setFilter(on ? "all" : c.key)}
              className={`flex min-w-[120px] flex-1 items-center gap-2 px-4 py-2.5 text-right transition ${on ? "bg-brand-soft" : "hover:bg-brand-soft/40"}`}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.dot}`} />
              <span className="text-ink text-[16px] font-black tabular-nums">{c.n}</span>
              <span className="text-muted truncate text-[11.5px] font-semibold">{c.label}</span>
            </button>
          );
        })}
      </div>

      {plan.health.conflicts.length > 0 && (
        <div className="bg-danger-soft text-danger flex items-start gap-2 rounded-2xl p-3 text-[12.5px] font-bold">
          <Icon name="AlertTriangle" size={16} /><div>{plan.health.conflicts.map((c) => <p key={c.aId + c.bId}>{c.label}</p>)}</div>
        </div>
      )}

      {/* ── "עכשיו" — the single next action ────────────────────────────────── */}
      {primary ? (
        <section className="border-brand-light overflow-hidden rounded-[22px] border bg-gradient-to-l from-[var(--color-brand-soft)] via-card to-card p-4 shadow-[var(--shadow-card)]">
          <div className="mb-1.5 flex items-center gap-2"><span className="bg-brand grid h-6 w-6 place-items-center rounded-lg text-white"><Icon name="Zap" size={13} /></span><span className="text-brand-strong text-[12px] font-black">עכשיו</span>{timeHe(primary.dueAt) && <span className="text-muted text-[12px] font-bold tabular-nums">· {timeHe(primary.dueAt)}</span>}</div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-ink truncate text-[16px] font-black">{primary.title}</p>
              <p className="text-muted truncate text-[12.5px]">{primary.reason}</p>
              <p className="text-muted mt-0.5 text-[11px]">זמן משוער: {primary.estimatedMinutes} דקות</p>
            </div>
            <Link href={primary.route} onClick={() => track("daily_primary_action_clicked", { type: primary.type })} className="bg-brand shrink-0 rounded-xl px-5 py-2.5 text-[13.5px] font-black text-white transition hover:opacity-95">{primary.cta}</Link>
          </div>
        </section>
      ) : (
        <section className="bg-success-soft rounded-[22px] p-5 text-center">
          <div className="text-2xl">🎉</div>
          <p className="text-ink mt-1.5 text-[15px] font-black">סיימת את כל הפעולות החשובות להיום</p>
          <p className="text-muted mt-1 text-[12.5px]">רוצה ש-ZI ימצא הזדמנות נוספת שאפשר לקדם?</p>
          <Link href="/brain" className="text-brand-strong mt-2 inline-block text-[12.5px] font-bold">בקש מ-ZI →</Link>
        </section>
      )}

      {/* ── Body: day timeline · side column ───────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* timeline */}
        <div className="flex flex-col gap-4">
          {filteredFlat ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between"><h2 className="text-ink text-[13px] font-black">{CHIPS.find((c) => c.key === filter)?.label} · {filteredFlat.length}</h2><button type="button" onClick={() => setFilter("all")} className="text-brand-strong text-[11.5px] font-bold">הצג את כל היום</button></div>
              {filteredFlat.length === 0 ? <p className="text-muted py-3 text-center text-[12px]">אין פריטים בקטגוריה זו</p> : filteredFlat.map((it) => <ItemRow key={it.id} it={it} />)}
            </div>
          ) : filter === "done" ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between"><h2 className="text-ink text-[13px] font-black">הושלמו · {doneCount}</h2><button type="button" onClick={() => setFilter("all")} className="text-brand-strong text-[11.5px] font-bold">הצג את כל היום</button></div>
              {plan.doneToday.length === 0 ? <p className="text-muted py-3 text-center text-[12px]">עדיין לא הושלמו פעולות היום</p> : plan.doneToday.map((d) => <div key={d.id} className="bg-card border-line flex items-center gap-2.5 rounded-2xl border p-3 opacity-70"><span className="bg-success-soft text-success grid h-8 w-8 place-items-center rounded-xl"><Icon name={d.icon} size={15} /></span><span className="text-ink text-[12.5px] font-bold">{d.label}</span><Icon name="Check" size={15} className="text-success ms-auto" /></div>)}
            </div>
          ) : (
            <>
              <TimeGroup label="בוקר" items={groups.morning} />
              <TimeGroup label="צהריים" items={groups.noon} />
              <TimeGroup label="אחר הצהריים" items={groups.afternoon} />
              {timed.length === 0 && <p className="text-muted bg-card border-line rounded-2xl border py-6 text-center text-[12.5px]">אין פעילויות עם שעה קבועה היום — הפעולות מופיעות בצד ←</p>}
            </>
          )}
        </div>

        {/* side column */}
        <aside className="flex flex-col gap-3">
          {nextUp && <SideList title="הבא בתור" icon="ArrowLeft" items={[nextUp]} empty="—" tone="text-brand" />}
          <SideList title="דורש תשומת לב" icon="AlertTriangle" items={attention} empty="אין פעולות דחופות כרגע 🎉" tone="text-danger" />
          <SideList title="אפשר להשלים במהירות" icon="Zap" items={quickWins} empty="—" tone="text-warning" />
          <Link href="/action-center" className="text-brand-strong text-center text-[12px] font-bold hover:underline">הצג את כל הפעולות ←</Link>

          {ziRec && (
            <div className="border-brand-light rounded-[20px] border bg-gradient-to-l from-[var(--color-brand-soft)] to-card p-3.5">
              <p className="text-brand-strong mb-1 flex items-center gap-1.5 text-[12px] font-black"><Icon name="Sparkles" size={13} />ZI ממליץ</p>
              <p className="text-ink text-[13px] font-black">{ziRec.title}</p>
              <p className="text-muted mt-0.5 text-[11.5px]">{ziRec.text}</p>
              <Link href={ziRec.href} className="bg-brand mt-2 inline-block rounded-lg px-3 py-1.5 text-[11.5px] font-black text-white">{ziRec.cta}</Link>
            </div>
          )}
        </aside>
      </div>

      {/* Sticky mobile primary */}
      {primary && (
        <div className="border-line bg-card/95 fixed inset-x-0 bottom-0 z-20 border-t p-3 backdrop-blur lg:hidden">
          <Link href={primary.route} onClick={() => track("daily_primary_action_clicked", { type: primary.type, surface: "mobile" })} className="bg-brand block truncate rounded-xl px-6 py-3 text-center text-[13px] font-extrabold text-white">{primary.cta}: {primary.title}</Link>
        </div>
      )}
    </div>
  );
}

function TimeGroup({ label, items }: { label: string; items: DailyPlanItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-muted flex items-center gap-1.5 text-[12px] font-black"><span className="bg-line h-px flex-1" />{label}<span className="bg-line h-px flex-1" /></h2>
      <div className="flex flex-col gap-2">{items.map((it) => <ItemRow key={it.id} it={it} />)}</div>
    </section>
  );
}
