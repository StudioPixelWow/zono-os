"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EntityTimeline } from "@/components/activity/EntityTimeline";
import { riskTone, scoreTone, type Tone } from "@/lib/matching-intelligence/scoring";
import { MATCH_STAGES, STAGE_LABELS, matchStageIndex, nextMatchStage, type MatchStage } from "@/lib/matching-intelligence/playbook";
import {
  addMatchObjectionAction,
  matchActionToTaskAction,
  resolveMatchObjectionAction,
  resolveMatchRiskAction,
  setMatchStageAction,
} from "@/lib/matching-intelligence/actions";
import type { MatchCommandCenter as MatchCC } from "@/lib/matching-intelligence/service";

const TONE_TEXT: Record<Tone, string> = { good: "text-success", medium: "text-brand-strong", risk: "text-danger" };
const SEVERITY_TONE: Record<string, string> = { critical: "bg-danger-soft text-danger", high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };
const field = "bg-surface border-line text-ink focus:border-brand-light h-10 rounded-xl border px-3 text-sm outline-none transition";
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");
const OBJ_TYPES = ["price", "location", "timing", "financing", "family", "competing"];
const OBJ_LABELS: Record<string, string> = { price: "מחיר", location: "מיקום", timing: "תזמון", financing: "מימון", family: "אישור משפחה", competing: "נכס מתחרה" };

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name={icon} size={16} /></span>
        <h3 className="text-ink text-sm font-extrabold">{title}</h3>
      </div>
      {children}
    </div>
  );
}
function ScoreTile({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className="bg-surface flex flex-col gap-1 rounded-2xl p-3">
      <div className="flex items-baseline justify-between"><span className="text-muted text-[11px] font-bold">{label}</span><span className={cn("text-2xl font-black", TONE_TEXT[tone])}>{value}</span></div>
    </div>
  );
}
function Snapshot({ title, href, name, a, b }: { title: string; href: string; name: string; a: { label: string; value: number }; b: { label: string; value: number } }) {
  return (
    <div>
      <p className="text-muted mb-1 text-xs font-bold">{title}</p>
      <Link href={href} className="text-ink hover:text-brand text-sm font-extrabold">{name}</Link>
      <div className="text-muted mt-1 flex gap-3 text-xs"><span>{a.label} {a.value}</span><span>{b.label} {b.value}</span></div>
    </div>
  );
}

export function MatchCommandCenter({ data }: { data: MatchCC }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [objType, setObjType] = useState("price");
  const run = (fn: () => Promise<{ error?: string }>) => { setError(null); start(async () => { const r = await fn(); if (r?.error) setError(r.error); }); };

  const p = data.profile;
  const openRisks = data.risks.filter((r) => r.status === "open");
  const openObjections = data.objections.filter((o) => !o.resolved);
  const next = nextMatchStage(p.match_stage);
  const curIdx = matchStageIndex(p.match_stage);
  const tiles: { label: string; value: number; tone: Tone }[] = [
    { label: "התאמה", value: p.compatibility_score, tone: scoreTone(p.compatibility_score) },
    { label: "מוכנות", value: p.readiness_score, tone: scoreTone(p.readiness_score) },
    { label: "מעורבות", value: p.engagement_score, tone: scoreTone(p.engagement_score) },
    { label: "אמון", value: p.trust_score, tone: scoreTone(p.trust_score) },
    { label: "תזמון", value: p.timing_score, tone: scoreTone(p.timing_score) },
    { label: "מומנטום", value: p.momentum_score, tone: scoreTone(p.momentum_score) },
    { label: "סיכון", value: p.risk_score, tone: riskTone(p.risk_score) },
    { label: "הזדמנות", value: p.opportunity_score, tone: scoreTone(p.opportunity_score) },
  ];

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

      {/* 1) Header + 3) closing probability */}
      <div className="bg-brand-soft rounded-[22px] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-brand text-xs font-bold">{data.buyer?.name ?? "קונה"} ← {data.property?.title ?? "נכס"}</p>
            <h2 className="text-ink mt-1 text-xl font-black">מרכז ניהול התאמה</h2>
            <p className="text-muted mt-1 text-sm">{p.intelligence_summary ?? ""}</p>
            <p className="text-brand-strong mt-2 flex items-center gap-1.5 text-sm font-bold"><Icon name="ArrowUpRight" size={16} />פעולה מומלצת: {p.next_best_action ?? "—"}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center"><p className={cn("text-4xl font-black", TONE_TEXT[scoreTone(p.closing_probability)])}>{p.closing_probability}%</p><p className="text-muted text-[11px] font-semibold">הסתברות סגירה</p></div>
            <Badge tone="brand">{STAGE_LABELS[p.match_stage as MatchStage] ?? p.match_stage}</Badge>
          </div>
        </div>
      </div>

      {/* 2) Compatibility / score grid */}
      <SectionCard title="ציוני התאמה" icon="BarChart3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{tiles.map((t) => <ScoreTile key={t.label} {...t} />)}</div>
        <div className="text-muted mt-3 flex flex-wrap gap-x-4 text-xs">
          {p.strongest_advantage && <span className="text-success">יתרון: {p.strongest_advantage}</span>}
          {p.primary_blocker && <span className="text-danger">חסם: {p.primary_blocker}</span>}
        </div>
      </SectionCard>

      {/* 4) Journey */}
      <SectionCard title="מסע ההתאמה" icon="Route">
        <div className="no-scrollbar -mx-1 overflow-x-auto pb-1">
          <div className="flex min-w-[760px] items-center gap-1 px-1">
            {MATCH_STAGES.filter((s) => s !== "lost").map((s, i) => {
              const state = i < curIdx ? "done" : i === curIdx ? "active" : "upcoming";
              return <span key={s} className={cn("grid h-7 flex-1 place-items-center rounded-lg text-[10px] font-bold", state === "done" ? "bg-success-soft text-success" : state === "active" ? "bg-brand text-white" : "bg-surface text-muted")}>{STAGE_LABELS[s]}</span>;
            })}
          </div>
        </div>
        {next && <Button size="sm" className="mt-3" onClick={() => run(() => setMatchStageAction(p.id, next))} disabled={pending} leadingIcon={<Icon name="ArrowUpRight" size={15} />}>קדם ל{STAGE_LABELS[next]}</Button>}
      </SectionCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 7) Recommended actions */}
        <SectionCard title="פעולות מומלצות" icon="TrendingUp">
          <div className="flex flex-col gap-3">
            {data.actions.slice(0, 5).map((a) => (
              <div key={a.actionType} className="border-line rounded-2xl border p-3">
                <p className="text-ink text-sm font-bold">{a.title}</p>
                <div className="text-muted mt-1 flex flex-wrap gap-x-3 text-[11px]"><span>דחיפות {a.urgency}</span><span>השפעה {a.impact}</span><span>ביטחון {a.confidence}</span><span>רווח סגירה +{a.closingGain}</span></div>
                <Button size="sm" className="mt-2" onClick={() => run(() => matchActionToTaskAction(p.id, p.buyer_id, p.property_id, a.title))} disabled={pending}>צור משימה</Button>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 5) Risks */}
        <SectionCard title="סיכוני עסקה" icon="AlertTriangle">
          {openRisks.length === 0 ? <p className="text-muted text-sm">אין סיכונים פעילים ✓</p> : (
            <div className="flex flex-col gap-3">
              {openRisks.map((r) => (
                <div key={r.id} className="border-line rounded-2xl border p-3">
                  <div className="flex items-center justify-between gap-2"><p className="text-ink text-sm font-bold">{r.title}</p><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", SEVERITY_TONE[r.severity] ?? SEVERITY_TONE.low)}>{r.severity}</span></div>
                  {r.recommended_action && <p className="text-brand-strong mt-1 text-xs font-semibold">המלצה: {r.recommended_action}</p>}
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => run(() => resolveMatchRiskAction(p.id, r.id))} disabled={pending}>טפל</Button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* 6) Objections */}
        <SectionCard title="התנגדויות עסקה" icon="MessageCircle">
          <div className="bg-surface mb-3 flex flex-wrap gap-2 rounded-2xl p-3">
            <select className={field} value={objType} onChange={(e) => setObjType(e.target.value)}>{OBJ_TYPES.map((t) => <option key={t} value={t}>{OBJ_LABELS[t]}</option>)}</select>
            <Button size="sm" onClick={() => run(() => addMatchObjectionAction(p.id, objType, null))} disabled={pending} leadingIcon={<Icon name="Plus" size={15} />}>תעד</Button>
          </div>
          {openObjections.length === 0 ? <p className="text-muted text-sm">אין התנגדויות פתוחות ✓</p> : (
            <ul className="flex flex-col gap-1.5">
              {openObjections.map((o) => (
                <li key={o.id} className="border-line flex items-center justify-between border-b py-1.5 last:border-0 text-sm">
                  <span className="text-ink font-semibold">{o.objection_type ? OBJ_LABELS[o.objection_type] ?? o.objection_type : "התנגדות"}</span>
                  <Button size="sm" variant="ghost" onClick={() => run(() => resolveMatchObjectionAction(p.id, o.id, null))} disabled={pending}>טופל</Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 12+13) Opportunity + deal value */}
        <SectionCard title="הזדמנות וערך עסקה" icon="Sparkles">
          <div className="grid grid-cols-2 gap-3">
            <ScoreTile label="ציון הזדמנות" value={p.opportunity_score} tone={scoreTone(p.opportunity_score)} />
            <ScoreTile label="דחיפות" value={p.urgency_score} tone={scoreTone(p.urgency_score)} />
          </div>
          <div className="mt-3 flex flex-col gap-1 text-sm">
            <p className="text-muted">ערך עסקה משוער: <b className="text-ink">{p.estimated_deal_value ? formatShekels(p.estimated_deal_value) : "—"}</b></p>
            <p className="text-muted">עמלה משוערת: <b className="text-brand-strong">{p.estimated_commission ? formatShekels(p.estimated_commission) : "—"}</b></p>
            {data.revenue && <p className="text-muted">הכנסה משוקללת בהסתברות: <b className="text-success">{formatShekels(data.revenue.probability_weighted_revenue)}</b></p>}
          </div>
        </SectionCard>

        {/* 9-11) Snapshots */}
        <SectionCard title="צילומי מצב" icon="Users">
          <div className="flex flex-col gap-4">
            {data.buyer && <Snapshot title="קונה" href={`/buyers/${data.buyer.id}`} name={data.buyer.name} a={{ label: "מוכנות", value: data.buyer.readiness }} b={{ label: "סגירה", value: data.buyer.conversion }} />}
            {data.property && <Snapshot title="נכס" href={`/properties/${data.property.id}`} name={data.property.title} a={{ label: "הצלחה", value: data.property.success }} b={{ label: "מחיר", value: data.property.price ? Math.round(data.property.price / 1000) : 0 }} />}
            {data.seller && <Snapshot title="מוכר" href={`/sellers/${data.seller.id}`} name={data.seller.name} a={{ label: "אמון", value: data.seller.trust }} b={{ label: "נטישה", value: data.seller.churn }} />}
            {!data.seller && <p className="text-muted text-xs">אין מוכר מקושר לנכס.</p>}
          </div>
        </SectionCard>
      </div>

      {/* 8) Timeline */}
      <SectionCard title="ציר זמן העסקה" icon="Clock"><EntityTimeline items={data.timeline} title="" emptyStateText="אין פעילות מתועדת עדיין." /></SectionCard>

      {/* 14) AI insights */}
      <SectionCard title="תובנות ZONO" icon="Sparkles">
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-ink"><span className="text-muted">סיכום: </span>{p.ai_summary ?? "—"}</p>
          <p className="text-ink"><span className="text-muted">סיכונים: </span>{p.ai_risk_summary ?? "—"}</p>
          <p className="text-ink"><span className="text-muted">המלצה: </span>{p.ai_recommendation_summary ?? "—"}</p>
          <p className="text-muted text-[11px]">חושב לאחרונה: {fmt(p.last_calculated_at)} · ניתוח AI יתווסף בשלב הבא.</p>
        </div>
      </SectionCard>
    </div>
  );
}
