"use client";

import { useState } from "react";
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
const probTone = (n: number) => (n >= 65 ? "text-success" : n >= 40 ? "text-brand-strong" : "text-danger");
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const nextStage = (s: string): DealStage | null => { const i = DEAL_STAGE_ORDER.indexOf(s as DealStage); return i >= 0 && i < DEAL_STAGE_ORDER.length - 1 ? DEAL_STAGE_ORDER[i + 1] : null; };
const dealTitle = (d: DealRow) => `${d.buyerName ?? "קונה"} ← ${d.propertyTitle ?? "נכס"}`;

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
  // Spotlights (real data): biggest by value, and closest to closing.
  const highest = deals[0] ?? null; // board is sorted by deal_value desc
  const closestPool = upcomingClosings.length ? upcomingClosings : [...deals].sort((a, b) => b.deal_probability - a.deal_probability);
  let closest = closestPool[0] ?? null;
  if (closest && highest && closest.id === highest.id) closest = closestPool[1] ?? null;
  const pipelineMax = Math.max(1, ...pipeline.map((s) => s.value));

  return (
    <div className="flex flex-col gap-5">
      {/* ── Hero money summary ─────────────────────────────────────────────── */}
      <div className="bg-card border-line overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)]">
        <div className="bg-brand-soft flex flex-wrap items-start justify-between gap-3 p-5">
          <div>
            <p className="text-brand text-xs font-bold">ZONO Deal Execution OS</p>
            <h1 className="text-ink mt-1 text-2xl font-black sm:text-3xl">מרכז שליטה בעסקאות</h1>
            <p className="text-muted mt-1 max-w-xl text-sm">כל עסקה פעילה — מסע, משא ומתן, סיכון ועמלה במקום אחד. דטרמיניסטי, ללא יצירת קשר אוטומטית.</p>
          </div>
          <Button onClick={build} loading={runner.busyId === "build"} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>{runner.busyId === "build" ? "בונה…" : "בנה עסקאות"}</Button>
        </div>
        {!empty && (
          <div className="grid grid-cols-1 gap-px bg-[color:var(--line)] sm:grid-cols-3">
            <MoneyTile label="שווי צנרת" value={formatShekels(revenue.pipelineValue)} tone="text-ink" />
            <MoneyTile label="עמלה משוקללת (לפי סבירות)" value={formatShekels(revenue.weightedRevenue)} tone="text-success" />
            <MoneyTile label="פוטנציאל עמלה מלא" value={formatShekels(revenue.expectedCommission)} tone="text-brand-strong" />
          </div>
        )}
      </div>
      <ActionFeedback runner={runner} />

      {empty ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-16 w-16 place-items-center rounded-3xl"><Icon name="Handshake" size={28} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין עסקאות מנוהלות</p>
          <p className="text-muted max-w-sm text-sm">עסקאות נבנות מהתאמות פעילות (Match Intelligence). לחצו ״בנה עסקאות״ כדי ליצור Deal Twin לכל הזדמנות פעילה עם מסע, משימות והתנגדויות.</p>
          <Button onClick={build} loading={runner.busyId === "build"} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />} className="mt-2">בנה עסקאות</Button>
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="עסקאות פעילות" value={String(deals.length)} icon="Handshake" tone="text-brand-strong" />
            <Kpi label="סגירה הקרובה" value={fmtDate(closest?.expected_close_date ?? null)} icon="Clock" tone="text-brand-strong" />
            <Kpi label="עסקאות בסיכון" value={String(atRisk.length)} icon="AlertTriangle" tone={atRisk.length ? "text-danger" : "text-success"} />
            <Kpi label="משימות פתוחות" value={String(tasks.length)} icon="Flame" tone="text-warning" />
          </div>

          {/* Spotlights: highest-value + closest-to-closing */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {highest && <Spotlight tag="העסקה הגדולה ביותר" icon="TrendingUp" d={highest} pending={pending} run={run} />}
            {closest && <Spotlight tag="הכי קרובה לסגירה" icon="Clock" d={closest} pending={pending} run={run} />}
          </div>

          {/* Pipeline funnel with proportional value bars */}
          <Panel title="צנרת עסקאות" icon="BarChart3">
            <div className="flex flex-col gap-2">
              {pipeline.map((s) => (
                <div key={s.stage} className="flex items-center gap-3">
                  <span className="text-muted w-32 shrink-0 truncate text-[12px] font-bold">{s.label}</span>
                  <div className="bg-surface relative h-7 flex-1 overflow-hidden rounded-lg">
                    <div className="bg-brand/25 h-full rounded-lg" style={{ width: `${Math.max(6, Math.round((s.value / pipelineMax) * 100))}%` }} />
                    <span className="text-ink absolute inset-y-0 start-2 flex items-center text-[11px] font-bold">{s.count} · {formatShekels(s.value)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* At-risk deals with risk bars */}
          <Panel title={`עסקאות בסיכון (${atRisk.length})`} icon="AlertTriangle">
            {atRisk.length === 0 ? <p className="text-muted text-sm">אין עסקאות בסיכון ✓</p> : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {atRisk.map((d) => (
                  <div key={d.id} className="border-line rounded-2xl border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="text-ink truncate text-sm font-bold">{dealTitle(d)}</p><p className="text-muted text-[11px]">{DEAL_STAGE_LABEL[d.deal_stage as DealStage] ?? d.deal_stage}</p></div>
                      <span className={cn("shrink-0 text-sm font-black", riskTone(d.deal_risk))}>סיכון {d.deal_risk}</span>
                    </div>
                    <div className="bg-surface mt-2 h-1.5 w-full overflow-hidden rounded-full"><div className="bg-danger h-full rounded-full" style={{ width: `${d.deal_risk}%` }} /></div>
                    {d.next_best_action && <p className="text-brand-strong mt-1.5 text-[11px] font-bold">→ {d.next_best_action}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {d.buyer_id && <Link href={`/buyers/${d.buyer_id}`} className="text-muted text-[11px] font-bold">קונה ↗</Link>}
                      {d.property_id && <Link href={`/properties/${d.property_id}`} className="text-muted text-[11px] font-bold">נכס ↗</Link>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Action queue: tasks / objections / negotiations */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel title={`משימות עסקה (${tasks.length})`} icon="Flame">
              {tasks.length === 0 ? <p className="text-muted text-sm">אין משימות פתוחות</p> : (
                <ul className="flex flex-col gap-2">{tasks.slice(0, 12).map((t) => (
                  <li key={t.id} className="border-line flex flex-wrap items-center gap-2 rounded-xl border p-2 text-sm">
                    <span className="min-w-0 flex-1"><span className="text-ink font-semibold">{t.title}</span><span className="text-muted block text-[10px]">{t.dealTitle} · <span className={PRIORITY[t.priority]}>{t.priority}</span> · השפעה {t.impact_score}</span></span>
                    <button className="text-success text-[11px] font-bold" disabled={pending} onClick={() => run(() => setDealTaskStatusAction(t.id, "done"))}>בוצע</button>
                    <button className="text-muted text-[11px] font-bold" disabled={pending} onClick={() => run(() => setDealTaskStatusAction(t.id, "dismissed"))}>בטל</button>
                  </li>
                ))}</ul>
              )}
            </Panel>

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

            <Panel title={`משא ומתן (${negotiations.length})`} icon="TrendingUp">
              {negotiations.length === 0 ? <p className="text-muted text-sm">אין רישומי משא ומתן</p> : (
                <ul className="flex flex-col gap-2">{negotiations.slice(0, 10).map((n) => (
                  <li key={n.id} className="border-line rounded-xl border p-2 text-sm">
                    <div className="flex items-center justify-between gap-2"><span className="text-ink min-w-0 flex-1 truncate font-semibold">{n.dealTitle}</span><span className={cn("shrink-0 text-xs font-black", healthTone(n.agreement_probability))}>{n.agreement_probability}%</span></div>
                    <p className="text-muted mt-0.5 text-[11px]">פער: {formatShekels(n.current_gap)}{n.buyer_offer ? ` · הצעת קונה ${formatShekels(n.buyer_offer)}` : ""}</p>
                  </li>
                ))}</ul>
              )}
            </Panel>
          </div>

          {/* All deals */}
          <div>
            <p className="text-ink mb-3 text-sm font-extrabold">כל העסקאות ({deals.length})</p>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {deals.slice(0, 60).map((d) => <DealCard key={d.id} d={d} pending={pending} run={run} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Spotlight({ tag, icon, d, pending, run }: { tag: string; icon: string; d: DealRow; pending: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const ns = nextStage(d.deal_stage);
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <span className="bg-brand-soft text-brand inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black"><Icon name={icon} size={13} />{tag}</span>
        <span className={cn("text-2xl font-black", probTone(d.deal_probability))}>{d.deal_probability}%</span>
      </div>
      <div>
        <p className="text-ink text-lg font-black leading-tight">{dealTitle(d)}</p>
        <p className="text-muted mt-0.5 text-[12px] font-semibold">{DEAL_STAGE_LABEL[d.deal_stage as DealStage] ?? d.deal_stage}{d.locality ? ` · ${d.locality}` : ""}{d.agentName ? ` · ${d.agentName}` : ""}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="שווי" value={formatShekels(d.deal_value)} />
        <MiniStat label="עמלה" value={formatShekels(d.commission_value)} />
        <MiniStat label="סגירה" value={fmtDate(d.expected_close_date)} />
      </div>
      <div className="text-muted flex flex-wrap gap-x-3 text-[11px] font-semibold">
        <span>בריאות <b className={healthTone(d.deal_health)}>{d.deal_health}</b></span>
        <span>סיכון <b className={riskTone(d.deal_risk)}>{d.deal_risk}</b></span>
        <span>מהירות {d.deal_velocity}</span>
      </div>
      {d.next_best_action && <div className="bg-brand-soft rounded-2xl p-3"><p className="text-brand text-[11px] font-bold">הפעולה הבאה</p><p className="text-ink text-[13px] font-black">{d.next_best_action}</p></div>}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {ns && <Button size="sm" disabled={pending} onClick={() => run(() => advanceDealStageAction(d.id, ns))}>קדם ל{DEAL_STAGE_LABEL[ns]}</Button>}
        {d.buyer_id && <Link href={`/buyers/${d.buyer_id}`}><Button variant="secondary" size="sm" leadingIcon={<Icon name="Users" size={14} />}>קונה</Button></Link>}
        {d.property_id && <Link href={`/properties/${d.property_id}`}><Button variant="ghost" size="sm" leadingIcon={<Icon name="Building2" size={14} />}>נכס</Button></Link>}
      </div>
    </div>
  );
}

function DealCard({ d, pending, run }: { d: DealRow; pending: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const ns = nextStage(d.deal_stage);
  const [closing, setClosing] = useState(false);
  const [losing, setLosing] = useState(false);
  const [amount, setAmount] = useState("");
  const [commission, setCommission] = useState("");
  const [lostReason, setLostReason] = useState("");

  const confirmClose = () => {
    const finalAmount = amount.trim() ? Number(amount.replace(/[^\d.]/g, "")) : null;
    const finalCommission = commission.trim() ? Number(commission.replace(/[^\d.]/g, "")) : null;
    run(() => advanceDealStageAction(d.id, "closed", { finalAmount, finalCommission }));
    setClosing(false); setAmount(""); setCommission("");
  };

  const confirmLost = () => {
    run(() => advanceDealStageAction(d.id, "lost", { lostReason: lostReason.trim() || null }));
    setLosing(false); setLostReason("");
  };

  return (
    <div className="bg-card border-line flex flex-col gap-2 rounded-[18px] border p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink truncate text-sm font-extrabold">{dealTitle(d)}</p>
          <p className="text-muted text-[11px]">{DEAL_STAGE_LABEL[d.deal_stage as DealStage] ?? d.deal_stage}{d.locality ? ` · ${d.locality}` : ""}{d.agentName ? ` · ${d.agentName}` : ""}</p>
        </div>
        <span className={cn("shrink-0 text-lg font-black", probTone(d.deal_probability))}>{d.deal_probability}%</span>
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
        <button className="text-success text-[11px] font-bold" disabled={pending} onClick={() => setClosing((v) => !v)}>סגור בהצלחה</button>
        <button className="text-danger text-[11px] font-bold" disabled={pending} onClick={() => setLosing((v) => !v)}>אבד</button>
        {d.buyer_id && <Link href={`/buyers/${d.buyer_id}`} className="text-muted text-[11px] font-bold">קונה ↗</Link>}
        {d.property_id && <Link href={`/properties/${d.property_id}`} className="text-muted text-[11px] font-bold">נכס ↗</Link>}
      </div>

      {/* Real-amount capture on close. Amounts are OPTIONAL — leaving them blank
          still closes the deal (counted as won) but records no realized revenue. */}
      {closing && (
        <div className="border-line mt-1 flex flex-col gap-2 rounded-xl border border-dashed p-2.5">
          <p className="text-muted text-[11px] font-bold">סגירת עסקה — הזן סכומים בפועל (לא חובה)</p>
          <div className="flex gap-2">
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="מחיר סגירה ₪" className="border-line bg-surface text-ink h-8 w-full rounded-lg border px-2 text-xs outline-none" />
            <input inputMode="numeric" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="עמלה ₪" className="border-line bg-surface text-ink h-8 w-full rounded-lg border px-2 text-xs outline-none" />
          </div>
          <div className="flex gap-2">
            <button className="text-success bg-success-soft rounded-lg px-3 py-1 text-[11px] font-bold" disabled={pending} onClick={confirmClose}>אשר סגירה</button>
            <button className="text-muted text-[11px] font-bold" onClick={() => setClosing(false)}>ביטול</button>
          </div>
        </div>
      )}

      {/* Lost-reason capture — optional, but recorded to the canonical ledger so
          the office can learn why deals are lost. Leaving it blank still marks lost. */}
      {losing && (
        <div className="border-line mt-1 flex flex-col gap-2 rounded-xl border border-dashed p-2.5">
          <p className="text-muted text-[11px] font-bold">סימון עסקה כאבודה — סיבה (לא חובה)</p>
          <input value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="סיבת אובדן (למשל: הקונה בחר נכס אחר)" className="border-line bg-surface text-ink h-8 w-full rounded-lg border px-2 text-xs outline-none" />
          <div className="flex gap-2">
            <button className="text-danger bg-danger-soft rounded-lg px-3 py-1 text-[11px] font-bold" disabled={pending} onClick={confirmLost}>אשר אובדן</button>
            <button className="text-muted text-[11px] font-bold" onClick={() => setLosing(false)}>ביטול</button>
          </div>
        </div>
      )}
      <div className="mt-1">
        {/* Stage 0.1: legal docs reference the CANONICAL public.deals id (d.deal_id), not the projection id. */}
        <CreateLegalDocumentButton entityType="deal" entityId={d.deal_id ?? d.id} label="מסמך משפטי" />
      </div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">{icon && <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-lg"><Icon name={icon} size={15} /></span>}<p className="text-ink text-sm font-extrabold">{title}</p></div>
      {children}
    </div>
  );
}

function MoneyTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="bg-card px-5 py-4 text-center">
      <p className={cn("text-2xl font-black sm:text-3xl", tone)}>{value}</p>
      <p className="text-muted mt-1 text-[12px] font-bold">{label}</p>
    </div>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: string; icon: string; tone: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={cn("mb-1 inline-flex", tone)}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-base font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface rounded-xl px-2.5 py-2 text-center">
      <p className="text-ink text-[13px] font-black">{value}</p>
      <p className="text-muted text-[10px] font-bold">{label}</p>
    </div>
  );
}
