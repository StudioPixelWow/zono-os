"use client";
// ============================================================================
// ZONO — Daily Autopilot board (client). Premium daily operating screen: primary
// "הדבר הבא", a time-anchored timeline bucketed into דורש טיפול / קבוע בזמן / כדאי
// היום / אם נשאר זמן, plus a side rail (summary, calendar anchors, progress, ZI
// shortcuts). Execution routes into the EXISTING engines (open lead / viewing /
// marketing plan / deal …) — nothing is mutated here and completion is never faked;
// the plan replans from real state on the next load. Desktop uses width; mobile is
// one chronological stack with a sticky primary action. RTL.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { SurfaceTabs } from "@/components/navigation/SurfaceTabs";
import { recordUsageAction } from "@/lib/launch/server/actions";
import { PLAN_BUCKET_LABEL, type DailyPlan, type DailyPlanItem } from "@/lib/daily/daily-plan-core";
import type { DailyMarketing, DailyHeroSummary, DailyTeamException, DailyPipeline } from "@/lib/daily/priority";

interface RailData { marketing: DailyMarketing; hero: DailyHeroSummary; team: DailyTeamException[]; pipeline: DailyPipeline | null; isManager: boolean; userFirstName: string }

const TIME_FMT = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
const DATE_FMT = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" });
const timeHe = (iso: string | null) => (iso ? TIME_FMT.format(new Date(iso)) : null);
const PRI_DOT: Record<string, string> = { P0: "bg-danger", P1: "bg-warning", P2: "bg-muted/50" };

function track(name: string, props?: Record<string, string | number | boolean>) {
  // Fire-and-forget product analytics; never blocks navigation.
  void recordUsageAction({ category: "feature", name, props });
}

function ItemRow({ it, primary }: { it: DailyPlanItem; primary?: boolean }) {
  const t = timeHe(it.dueAt);
  return (
    <Link
      href={it.route}
      onClick={() => track(primary ? "daily_primary_action_clicked" : it.type === "marketing_plan" ? "daily_marketing_opened" : it.type === "viewing" ? "daily_viewing_opened" : "daily_item_opened", { type: it.type, priority: it.priority })}
      className={`bg-card border-line flex items-center gap-3 rounded-2xl border p-4 transition hover:shadow-[var(--shadow-card)] ${it.status === "done" ? "opacity-60" : ""}`}
    >
      {t ? (
        <div className="bg-brand-soft text-brand grid h-12 w-14 shrink-0 place-items-center rounded-xl text-sm font-black">{t}</div>
      ) : (
        <div className="bg-surface text-muted grid h-12 w-12 shrink-0 place-items-center rounded-xl"><Icon name={it.icon} size={18} /></div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${PRI_DOT[it.priority]}`} />
          <p className="text-ink truncate text-sm font-extrabold">{it.title}</p>
          {it.canPrepare && <span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[10px] font-bold">ZONO יכול להכין</span>}
          {it.status === "done" && <span className="bg-success-soft text-success rounded-full px-2 py-0.5 text-[10px] font-bold">בוצע</span>}
        </div>
        <p className="text-muted truncate text-xs">{it.reason}</p>
      </div>
      <div className="text-muted flex shrink-0 flex-col items-end gap-1 text-[11px]">
        <span>{it.estimatedMinutes} ד׳</span>
        <span className="text-brand font-bold">{it.cta} ←</span>
      </div>
    </Link>
  );
}

function Bucket({ label, icon, items }: { label: string; icon: string; items: DailyPlanItem[] }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-ink flex items-center gap-1.5 text-sm font-black"><Icon name={icon} size={15} className="text-muted" />{label} <span className="text-muted font-normal">· {items.length}</span></h2>
      <div className="flex flex-col gap-2">{items.map((it) => <ItemRow key={it.id} it={it} />)}</div>
    </section>
  );
}

export function DailyPlanBoard({ plan, rail }: { plan: DailyPlan; rail: RailData }) {
  const today = DATE_FMT.format(new Date());
  const primary = plan.primaryAction;
  const anchors = plan.buckets.fixedTime.filter((m) => m.status !== "done");

  return (
    <div dir="rtl" className="mx-auto grid max-w-6xl grid-cols-1 gap-6 pb-24 lg:grid-cols-3">
      {/* MAIN */}
      <div className="flex flex-col gap-5 lg:col-span-2">
        {/* Shared operating-surface nav — office tabs appear for managers only */}
        <SurfaceTabs active="today" isManager={rail.isManager} />
        <header>
          <p className="text-muted text-sm font-semibold">{today}</p>
          <h1 className="text-ink mt-1 text-2xl font-black">{plan.headline}</h1>
        </header>

        {plan.health.conflicts.length > 0 && (
          <div className="bg-danger-soft text-danger flex items-start gap-2 rounded-2xl p-4 text-sm font-bold">
            <Icon name="AlertTriangle" size={18} />
            <div>{plan.health.conflicts.map((c) => <p key={c.aId + c.bId}>{c.label}</p>)}</div>
          </div>
        )}

        {/* Primary next action */}
        {primary ? (
          <div className="bg-brand text-white rounded-[24px] p-5">
            <p className="text-xs font-bold opacity-80">הדבר הבא</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-black">{timeHe(primary.dueAt) ? `${timeHe(primary.dueAt)} · ` : ""}{primary.title}</p>
                <p className="truncate text-sm opacity-90">{primary.reason}</p>
              </div>
              <Link href={primary.route} onClick={() => track("daily_primary_action_clicked", { type: primary.type })} className="text-brand shrink-0 rounded-xl bg-white px-5 py-2.5 text-sm font-extrabold">{primary.cta}</Link>
            </div>
          </div>
        ) : (
          <div className="bg-success-soft rounded-[24px] p-6 text-center">
            <div className="text-3xl">✓</div>
            <p className="text-ink mt-2 text-base font-black">הכול בשליטה להיום</p>
            <p className="text-muted mt-1 text-sm">אין פעולות דחופות. אם בא לך להתקדם — יש הזדמנויות בהמשך.</p>
          </div>
        )}

        {/* Buckets */}
        <Bucket label={PLAN_BUCKET_LABEL.needs_attention} icon="AlertTriangle" items={plan.buckets.needsAttention} />
        <Bucket label={PLAN_BUCKET_LABEL.fixed_time} icon="Calendar" items={anchors} />
        <Bucket label={PLAN_BUCKET_LABEL.should_today} icon="CheckSquare" items={plan.buckets.shouldToday} />
        <Bucket label={PLAN_BUCKET_LABEL.if_time} icon="Clock" items={plan.buckets.ifTime} />
      </div>

      {/* RAIL */}
      <aside className="flex flex-col gap-4 lg:col-span-1">
        <div className="bg-card border-line rounded-[22px] border p-5">
          <p className="text-ink mb-3 text-sm font-black">היום במספרים</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <RailStat n={plan.summary.mustDo} label="דורש טיפול" tone="danger" />
            <RailStat n={plan.summary.fixed} label="קבוע בזמן" tone="brand" />
            <RailStat n={plan.summary.shouldToday} label="כדאי היום" tone="warning" />
          </div>
        </div>

        {anchors.length > 0 && (
          <div className="bg-card border-line rounded-[22px] border p-5">
            <p className="text-ink mb-3 text-sm font-black">לוח הזמנים</p>
            <ul className="flex flex-col gap-2">
              {anchors.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-sm">
                  <span className="text-brand w-12 shrink-0 font-bold">{timeHe(m.dueAt)}</span>
                  <span className="text-ink truncate">{m.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {plan.doneToday.length > 0 && (
          <div className="bg-card border-line rounded-[22px] border p-5">
            <p className="text-ink mb-3 text-sm font-black">היום כבר הספקת</p>
            <ul className="flex flex-col gap-2">
              {plan.doneToday.map((d) => <li key={d.id} className="text-ink flex items-center gap-2 text-sm"><Icon name={d.icon} size={15} className="text-success" />{d.label}</li>)}
            </ul>
          </div>
        )}

        {rail.isManager && rail.team.length > 0 && (
          <div className="bg-card border-line rounded-[22px] border p-5">
            <p className="text-ink mb-1 text-sm font-black">ויש דברים במשרד</p>
            <p className="text-muted mb-3 text-xs">משני להיום שלך — כשיתאפשר.</p>
            <ul className="flex flex-col gap-2">
              {rail.team.map((t) => <li key={t.id}><Link href={t.href ?? "#"} className="text-ink flex items-center justify-between text-sm hover:underline"><span>{t.label}</span><span className="text-muted">←</span></Link></li>)}
            </ul>
          </div>
        )}

        <div className="bg-card border-line rounded-[22px] border p-5">
          <p className="text-ink mb-3 text-sm font-black">שאל את ZI</p>
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-muted">{`מה הכי דחוף? · על מי לחזור? · מה נשאר לי היום?`}</p>
          </div>
        </div>
      </aside>

      {/* Sticky mobile primary */}
      {primary && (
        <div className="border-line bg-card/95 fixed inset-x-0 bottom-0 z-20 border-t p-3 backdrop-blur lg:hidden">
          <Link href={primary.route} onClick={() => track("daily_primary_action_clicked", { type: primary.type, surface: "mobile" })} className="bg-brand block rounded-xl px-6 py-3 text-center text-sm font-extrabold text-white">{primary.cta}: {primary.title}</Link>
        </div>
      )}
    </div>
  );
}

function RailStat({ n, label, tone }: { n: number; label: string; tone: "danger" | "brand" | "warning" }) {
  const c = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-brand";
  return <div className="bg-surface rounded-2xl p-3"><p className={`text-2xl font-black ${c}`}>{n}</p><p className="text-muted text-[11px] font-semibold">{label}</p></div>;
}
