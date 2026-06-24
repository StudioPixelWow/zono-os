"use client";

import Link from "next/link";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { DEAL_STAGE_LABEL, DEAL_STAGE_ORDER, OBJECTION_LABEL, type DealStage } from "@/lib/deals/engine";
import { advanceDealStageAction, recomputeDealsAction, resolveObjectionAction, setDealTaskStatusAction } from "@/lib/deals/actions";
import type { DealsBoard, DealRow } from "@/lib/deals/service";
import { CreateLegalDocumentButton } from "@/components/legal/CreateLegalDocumentButton";

const PRIORITY: Record<string, string> = { high: "text-danger", medium: "text-warning", low: "text-muted" };
const SEVERITY: Record<string, string> = { critical: "text-danger", high: "text-danger", medium: "text-warning", low: "text-muted" };
const healthTone = (n: number) => (n >= 65 ? "text-success" : n >= 40 ? "text-warning" : "text-danger");
const riskTone = (n: number) => (n >= 60 ? "text-danger" : n >= 35 ? "text-warning" : "text-success");
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }) : "—");
const nextStage = (s: string): DealStage | null => { const i = DEAL_STAGE_ORDER.indexOf(s as DealStage); return i >= 0 && i < DEAL_STAGE_ORDER.length - 1 ? DEAL_STAGE_ORDER[i + 1] : null; };

export function DealsView({ board }: { board: DealsBoard }) {
  const { deals, pipeline, negotiations, objections, tasks, atRisk, upcomingClosings, revenue } = board;
  const runner = useActionRunner();
  const { pending } = runner;
  const run = (fn: () => Promise<unknown>) => runner.run(fn);
  const build = () => runner.run(recomputeDealsAction, {
    id: "build",
    pendingMessage: "בונה Deal Twin לכל התאמה פעילה (מסע, משימות, התנגדויות)…",
    success: (r) => `נבנו ${r.deals} עסקאות · ${r.tasks} משימות.`,
  });

  const empty = deals.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Deal Execution OS</p>
          <h1 className="text-ink mt-1 text-2xl font-black">ניהול עסקאות</h1>
          <p className="text-muted mt-1 text-sm">כל הזדמנות הופכת לעסקה מנוהלת — מסע, משא ומתן, התנגדויות ומשימות. דטרמיניסטי, ללא יצירת קשר אוטומטית.</p>
        </div>
        <Button onClick={build} loading={runner.busyId === "build"} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>{runner.busyId === "build" ? "בונה…" : "בנה עסקאות"}</Button>
      </div>
      <ActionFeedback runner={runner} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="עסקאות פעילות" value={String(deals.length)} icon="Handshake" tone="text-brand-strong" />
        <Stat label="צנרת" value={formatShekels(revenue.pipelineValue)} icon="BarChart3" tone="text-brand-strong" />
        <Stat label="עמלות צפויות" value={formatShekels(revenue.expectedCommission)} icon="TrendingUp" tone="text-success" />
        <Stat label="עמלה משוקללת" value={formatShekels(revenue.weightedRevenue)} icon="TrendingUp" tone="text-success" />
        <Stat label="בסיכון" value={String(atRisk.length)} icon="AlertTriangle" tone="text-danger" />
      </div>

      {empty ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Handshake" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין עסקאות מנוהלות</p>
          <p className="text-muted max-w-sm text-sm">עסקאות נבנות מהתאמות פעילות (Match Intelligence). לחץ ״בנה עסקאות״ כדי ליצור Deal Twin לכל הזדמנות פעילה עם מסע, משימות והתנגדויות.</p>
        </div>
      ) : (
        <>
          {/* Pipeline funnel */}
          <Panel title="צנרת עסקאות" icon="BarChart3">
            <div className="flex flex-wrap gap-2">
              {pipeline.map((s) => (
                <div key={s.stage} className="bg-surface border-line min-w-[120px] flex-1 rounded-xl border p-3">
                  <p className="text-muted text-[11px] font-bold">{s.label}</p>
                  <p className="text-ink text-lg font-black">{s.count}</p>
                  <p className="text-muted text-[10px]">{formatShekels(s.value)}</p>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Deals list */}
            <div className="lg:col-span-2">
              <p className="text-ink mb-3 text-sm font-extrabold">עסקאות ({deals.length})</p>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {deals.slice(0, 40).map((d) => <DealCard key={d.id} d={d} pending={pending} run={run} />)}
              </div>
            </div>

            {/* At risk */}
            <Panel title={`עסקאות בסיכון (${atRisk.length})`} icon="AlertTriangle">
              {atRisk.length === 0 ? <p className="text-muted text-sm">אין עסקאות בסיכון ✓</p> : (
                <ul className="flex flex-col gap-1.5">{atRisk.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink min-w-0 flex-1 truncate font-semibold">{d.buyerName ?? "קונה"} <span className="text-muted text-[10px]">· {d.propertyTitle ?? "נכס"}</span></span>
                    <span className={cn("shrink-0 text-xs font-black", riskTone(d.deal_risk))}>סיכון {d.deal_risk}</span>
                  </li>
                ))}</ul>
              )}
            </Panel>

            {/* Upcoming closings */}
            <Panel title={`סגירות קרובות (${upcomingClosings.length})`} icon="Clock">
              {upcomingClosings.length === 0 ? <p className="text-muted text-sm">—</p> : (
                <ul className="flex flex-col gap-1.5">{upcomingClosings.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink min-w-0 flex-1 truncate font-semibold">{d.buyerName ?? "קונה"} <span className="text-muted text-[10px]">· {DEAL_STAGE_LABEL[d.deal_stage as DealStage] ?? d.deal_stage}</span></span>
                    <span className="text-muted shrink-0 text-[11px] font-bold">{fmtDate(d.expected_close_date)}</span>
                  </li>
                ))}</ul>
              )}
            </Panel>

            {/* Negotiations */}
            <Panel title={`משא ומתן (${negotiations.length})`} icon="TrendingUp">
              {negotiations.length === 0 ? <p className="text-muted text-sm">אין רישומי משא ומתן</p> : (
                <ul className="flex flex-col gap-2">{negotiations.slice(0, 10).map((n) => (
                  <li key={n.id} className="border-line rounded-xl border p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink min-w-0 flex-1 truncate font-semibold">{n.dealTitle}</span>
                      <span className={cn("shrink-0 text-xs font-black", healthTone(n.agreement_probability))}>{n.agreement_probability}%</span>
                    </div>
                    <p className="text-muted mt-0.5 text-[11px]">פער: {formatShekels(n.current_gap)}{n.buyer_offer ? ` · הצעת קונה ${formatShekels(n.buyer_offer)}` : ""}</p>
                  </li>
                ))}</ul>
              )}
            </Panel>

            {/* Objections */}
            <Panel title={`התנגדויות פתוחות (${objections.length})`} icon="AlertTriangle">
              {objections.length === 0 ? <p className="text-muted text-sm">אין התנגדויות פתוחות ✓</p> : (
                <ul className="flex flex-col gap-2">{objections.slice(0, 10).map((o) => (
                  <li key={o.id} className="border-line flex flex-wrap items-center gap-2 rounded-xl border p-2 text-sm">
                    <span className="text-ink min-w-0 flex-1 font-semibold">{o.dealTitle} <span className={cn("text-[10px]", SEVERITY[o.severity])}>· {OBJECTION_LABEL[o.objection_type] ?? o.objection_type} · {o.severity}</span></span>
                    <button className="text-success text-[11px] font-bold" disabled={pending} onClick={() => run(() => resolveObjectionAction(o.id))}>פתור</button>
                  </li>
                ))}</ul>
              )}
            </Panel>

            {/* Tasks */}
            <Panel title={`משימות עסקה (${tasks.length})`} icon="Flame">
              {tasks.length === 0 ? <p className="text-muted text-sm">אין משימות פתוחות</p> : (
                <ul className="flex flex-col gap-2">{tasks.slice(0, 12).map((t) => (
                  <li key={t.id} className="border-line flex flex-wrap items-center gap-2 rounded-xl border p-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="text-ink font-semibold">{t.title}</span>
                      <span className="text-muted block text-[10px]">{t.dealTitle} · <span className={PRIORITY[t.priority]}>{t.priority}</span> · השפעה {t.impact_score}</span>
                    </span>
                    <button className="text-success text-[11px] font-bold" disabled={pending} onClick={() => run(() => setDealTaskStatusAction(t.id, "done"))}>בוצע</button>
                    <button className="text-muted text-[11px] font-bold" disabled={pending} onClick={() => run(() => setDealTaskStatusAction(t.id, "dismissed"))}>בטל</button>
                  </li>
                ))}</ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function DealCard({ d, pending, run }: { d: DealRow; pending: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const ns = nextStage(d.deal_stage);
  return (
    <div className="bg-card border-line flex flex-col gap-2 rounded-[18px] border p-3 shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink truncate text-sm font-extrabold">{d.buyerName ?? "קונה"} ← {d.propertyTitle ?? "נכס"}</p>
          <p className="text-muted text-[11px]">{DEAL_STAGE_LABEL[d.deal_stage as DealStage] ?? d.deal_stage}{d.locality ? ` · ${d.locality}` : ""}{d.agentName ? ` · ${d.agentName}` : ""}</p>
        </div>
        <span className={cn("shrink-0 text-lg font-black", healthTone(d.deal_health))}>{d.deal_probability}%</span>
      </div>
      <div className="text-muted flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
        <span>בריאות <b className={healthTone(d.deal_health)}>{d.deal_health}</b></span>
        <span>סיכון <b className={riskTone(d.deal_risk)}>{d.deal_risk}</b></span>
        <span>מהירות {d.deal_velocity}</span>
        <span>שווי {formatShekels(d.deal_value)}</span>
        <span>עמלה {formatShekels(d.commission_value)}</span>
        {d.expected_close_date && <span>סגירה צפויה {fmtDate(d.expected_close_date)}</span>}
      </div>
      {d.next_best_action && <p className="text-brand-strong text-[11px] font-bold">→ {d.next_best_action}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {ns && <button className="text-brand-strong text-[11px] font-bold" disabled={pending} onClick={() => run(() => advanceDealStageAction(d.id, ns))}>קדם ל{DEAL_STAGE_LABEL[ns]}</button>}
        <button className="text-success text-[11px] font-bold" disabled={pending} onClick={() => run(() => advanceDealStageAction(d.id, "closed"))}>סגור בהצלחה</button>
        <button className="text-danger text-[11px] font-bold" disabled={pending} onClick={() => run(() => advanceDealStageAction(d.id, "lost"))}>אבד</button>
        {d.buyer_id && <Link href={`/buyers/${d.buyer_id}`} className="text-muted text-[11px] font-bold">קונה ↗</Link>}
        {d.property_id && <Link href={`/properties/${d.property_id}`} className="text-muted text-[11px] font-bold">נכס ↗</Link>}
      </div>
      <div className="mt-1">
        <CreateLegalDocumentButton entityType="deal" entityId={d.id} label="מסמך משפטי" />
      </div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <div className="mb-2 flex items-center gap-2">{icon && <span className="bg-brand-soft text-brand grid h-7 w-7 place-items-center rounded-lg"><Icon name={icon} size={14} /></span>}<p className="text-ink text-sm font-extrabold">{title}</p></div>
      {children}
    </div>
  );
}

function Stat({ label, value, icon, tone = "text-brand-strong" }: { label: string; value: string; icon: string; tone?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={cn("mb-1 inline-flex", tone)}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-base font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
