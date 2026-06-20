"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { recomputeTeamAction } from "@/lib/team/actions";
import type { TeamBoard, TeamProfileRow } from "@/lib/team/service";

const TIER_LABEL: Record<string, string> = { elite: "מצטיין", strong: "חזק", stable: "יציב", declining: "בירידה", critical: "קריטי" };
const TIER_CLS: Record<string, string> = {
  elite: "bg-success-soft text-success", strong: "bg-brand-soft text-brand-strong",
  stable: "bg-surface text-ink", declining: "bg-warning-soft text-warning", critical: "bg-danger-soft text-danger",
};
const SEV_CLS: Record<string, string> = { critical: "text-danger", high: "text-danger", medium: "text-warning", low: "text-muted" };
const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");
const STATUS_CLS: Record<string, string> = { strong: "text-success", single_point: "text-warning", vulnerable: "text-danger", uncovered: "text-danger" };
const STATUS_LABEL: Record<string, string> = { strong: "כיסוי חזק", single_point: "נקודה בודדת", vulnerable: "פגיע", uncovered: "ללא כיסוי" };

export function TeamView({ board }: { board: TeamBoard }) {
  const router = useRouter();
  const { snapshot, office, agents, revenueLeaders, forecastLeaders, needsAttention, coaching, workload, territory, leaks, actions } = board;
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const recalc = () => { setError(null); setMsg(null); start(async () => { const r = await recomputeTeamAction(); if (r.error) setError(r.error); else { setMsg(r.message ?? "חושב"); router.refresh(); } }); };

  const empty = agents.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Team Intelligence OS</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מודיעין צוות</h1>
          <p className="text-muted mt-1 text-sm">מי מנצח, מי מתקשה, היכן ההכנסה נוצרת ודולפת, ומי זקוק לליווי — מערכת ההפעלה של מנהל המשרד.</p>
        </div>
        <Button onClick={recalc} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>{pending ? "מחשב…" : "חשב מודיעין צוות"}</Button>
      </div>
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}

      {/* 1) Office Health */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="בריאות משרד" value={snapshot ? String(snapshot.office_health_score) : "—"} icon="Shield" tone={tone(snapshot?.office_health_score ?? 0)} />
        <Stat label="צמיחה" value={snapshot ? String(snapshot.office_growth_score) : "—"} icon="TrendingUp" tone="text-success" />
        <Stat label="סיכון" value={snapshot ? String(snapshot.office_risk_score) : "—"} icon="AlertTriangle" tone="text-danger" />
        <Stat label="הכנסות משרד" value={snapshot ? formatShekels(snapshot.office_revenue) : "—"} icon="BarChart3" />
        <Stat label="צנרת צפויה" value={snapshot ? formatShekels(snapshot.office_forecast_revenue) : "—"} icon="Building2" tone="text-success" />
        <Stat label="זקוקים לליווי" value={snapshot ? String(snapshot.coaching_needed) : "—"} icon="Users" tone="text-warning" />
      </div>

      {office && (
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">מרכיבי בריאות המשרד</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {([
              ["לידים", office.lead_health], ["צנרת", office.pipeline_health], ["מלאי", office.inventory_health], ["תחזית", office.forecast_health], ["תקשורת", office.communication_health],
              ["סוכנים", office.agent_health], ["שוק", office.market_health], ["ניתוב", office.routing_health], ["התאמות", office.matching_health], ["החלטות", office.decision_health],
            ] as [string, number][]).map(([label, val]) => (
              <div key={label} className="bg-surface rounded-xl p-2">
                <p className="text-muted text-[10px] font-bold">{label}</p>
                <p className={cn("text-lg font-black", tone(val))}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {empty ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Users" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין מודיעין צוות</p>
          <p className="text-muted max-w-sm text-sm">לחץ ״חשב מודיעין צוות״ כדי לבנות פרופילי ביצועים, איתור עומסים והזדמנויות ליווי.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* 2) Agent Rankings */}
          <Panel title="דירוג סוכנים" icon="BarChart3">
            <ul className="flex flex-col gap-1.5">{topAll(agents).map((a, i) => (
              <li key={a.user_id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted w-5 text-center font-black">{i + 1}</span>
                <Link href={`/team/${a.user_id}`} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{a.name}</Link>
                <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold", TIER_CLS[a.performance_tier])}>{TIER_LABEL[a.performance_tier]}</span>
                <span className={cn("shrink-0 text-sm font-black", tone(a.performance_score))}>{a.performance_score}</span>
              </li>
            ))}</ul>
          </Panel>

          {/* 3) Revenue Rankings */}
          <Panel title="דירוג הכנסות" icon="TrendingUp">
            <RankList rows={revenueLeaders} value={(a) => formatShekels(a.total_revenue)} sub={(a) => `${a.won_deals} עסקאות`} />
          </Panel>

          {/* 4) Forecast Rankings */}
          <Panel title="דירוג צנרת עתידית" icon="Building2">
            <RankList rows={forecastLeaders} value={(a) => formatShekels(a.forecast_revenue)} sub={(a) => `צפי ${a.forecast_score}`} />
          </Panel>

          {/* 5) Coaching Center */}
          <Panel title="מרכז ליווי" icon="Sparkles">
            {coaching.length === 0 ? <p className="text-muted text-sm">אין סיגנלי ליווי פתוחים ✓</p> : (
              <ul className="flex flex-col gap-2">{coaching.slice(0, 8).map((s) => (
                <li key={s.id} className="border-line rounded-xl border p-2">
                  <p className="text-ink text-sm font-semibold"><Link href={`/team/${s.user_id}`} className="hover:text-brand">{s.title}</Link> <span className={cn("text-[10px] font-bold", SEV_CLS[s.severity])}>· {s.severity}</span></p>
                  <p className="text-muted text-[11px]">{s.recommendation}</p>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* 6) Workload Balance */}
          <Panel title="איזון עומסים" icon="Route">
            <ul className="flex flex-col gap-1.5">{workload.slice(0, 10).map((w) => (
              <li key={w.userId} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/team/${w.userId}`} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{w.name}</Link>
                <span className="text-muted text-[11px]">{w.load} פעילים</span>
                <span className={cn("shrink-0 text-xs font-black", w.workload < 35 ? "text-danger" : w.workload > 88 ? "text-warning" : "text-success")}>{w.workload < 35 ? "עמוס" : w.workload > 88 ? "פנוי" : "מאוזן"}</span>
              </li>
            ))}</ul>
          </Panel>

          {/* 7) Territory Coverage */}
          <Panel title="כיסוי טריטוריאלי" icon="MapPin">
            {territory.length === 0 ? <p className="text-muted text-sm">—</p> : (
              <ul className="flex flex-col gap-1.5">{territory.slice(0, 10).map((t) => (
                <li key={t.locality} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink min-w-0 flex-1 truncate font-semibold">{t.locality}</span>
                  <span className="text-muted text-[11px]">{t.topAgent ?? "—"}</span>
                  <span className={cn("shrink-0 text-[11px] font-bold", STATUS_CLS[t.status])}>{STATUS_LABEL[t.status]}</span>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* 8) Opportunity Leakage */}
          <Panel title="דליפת הזדמנויות" icon="AlertTriangle">
            {leaks.length === 0 ? <p className="text-muted text-sm">אין דליפה משמעותית ✓</p> : (
              <ul className="flex flex-col gap-1.5">{leaks.slice(0, 8).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink min-w-0 flex-1 truncate font-semibold">{l.title}</span>
                  <span className="text-danger shrink-0 text-xs font-black">{formatShekels(l.lost_revenue_impact)}</span>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* 9) Agents Needing Attention (Team Trends proxy) */}
          <Panel title="סוכנים הדורשים תשומת לב">
            {needsAttention.length === 0 ? <p className="text-muted text-sm">כל הסוכנים יציבים ✓</p> : (
              <ul className="flex flex-col gap-1.5">{needsAttention.map((a) => (
                <li key={a.user_id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/team/${a.user_id}`} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{a.name}</Link>
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold", TIER_CLS[a.performance_tier])}>{TIER_LABEL[a.performance_tier]}</span>
                  <span className="text-warning shrink-0 text-xs font-black">ליווי {a.coaching_score}</span>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* 10) Management Actions — the core CEO output */}
          <div className="bg-brand-soft border-line rounded-[20px] border p-4 lg:col-span-2">
            <div className="mb-2 flex items-center gap-2"><span className="bg-brand text-white grid h-7 w-7 place-items-center rounded-lg"><Icon name="Flame" size={14} /></span><p className="text-ink text-sm font-extrabold">פעולות ניהול היום — מדורג</p></div>
            {actions.length === 0 ? <p className="text-muted text-sm">אין פעולות דחופות ✓</p> : (
              <ol className="flex flex-col gap-1.5">{actions.map((m) => (
                <li key={m.id} className="bg-card border-line flex flex-wrap items-center gap-2 rounded-xl border p-2.5 text-sm">
                  <span className="bg-brand text-white grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-black">{m.rank_position}</span>
                  <span className="min-w-0 flex-1">
                    {m.href ? <Link href={m.href} className="text-ink hover:text-brand font-bold">{m.title}</Link> : <span className="text-ink font-bold">{m.title}</span>}
                    <span className="text-muted block text-[11px]">{m.reason}{m.ownerName ? ` · אחראי: ${m.ownerName}` : ""}</span>
                  </span>
                  {m.expected_revenue_impact > 0 && <span className="text-success shrink-0 text-[11px] font-bold">+{formatShekels(m.expected_revenue_impact)}</span>}
                  <span className={cn("shrink-0 text-xs font-black", tone(m.priority_score))}>{m.priority_score}</span>
                </li>
              ))}</ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function topAll(agents: TeamProfileRow[]): TeamProfileRow[] {
  return [...agents].sort((a, b) => b.performance_score - a.performance_score).slice(0, 12);
}

function RankList({ rows, value, sub }: { rows: TeamProfileRow[]; value: (a: TeamProfileRow) => string; sub: (a: TeamProfileRow) => string }) {
  if (!rows.length) return <p className="text-muted text-sm">—</p>;
  return (
    <ul className="flex flex-col gap-1.5">{rows.map((a, i) => (
      <li key={a.user_id} className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted w-5 text-center font-black">{i + 1}</span>
        <Link href={`/team/${a.user_id}`} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{a.name}</Link>
        <span className="text-muted text-[11px]">{sub(a)}</span>
        <span className="text-success shrink-0 text-xs font-black">{value(a)}</span>
      </li>
    ))}</ul>
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
      <p className="text-ink text-lg font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
