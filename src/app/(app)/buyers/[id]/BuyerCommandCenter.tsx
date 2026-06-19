"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EntityTimeline } from "@/components/activity/EntityTimeline";
import { RecommendedMatches, type RecoItemView } from "@/components/activity/RecommendedMatches";
import { readinessLabel, scoreTone, type Tone } from "@/lib/buyer-intelligence/scoring";
import {
  BUYER_STAGES,
  OBJECTION_LABELS,
  STAGE_LABELS,
  TOUCHPOINT_LABELS,
  nextStage,
  stageIndex,
  type BuyerStage,
} from "@/lib/buyer-intelligence/playbook";
import {
  addBuyerObjectionAction,
  buyerActionToTaskAction,
  createBuyerCommitmentAction,
  initializeBuyerIntelligenceAction,
  logBuyerTouchpointAction,
  recalcBuyerIntelligenceAction,
  resolveBuyerObjectionAction,
  resolveBuyerRiskAction,
  setBuyerCommitmentStatusAction,
  setBuyerStageAction,
} from "@/lib/buyer-intelligence/actions";
import type { BuyerCommandCenter as BuyerCC } from "@/lib/buyer-intelligence/service";

const TONE_TEXT: Record<Tone, string> = { good: "text-success", medium: "text-brand-strong", risk: "text-danger" };
const SEVERITY_TONE: Record<string, string> = { critical: "bg-danger-soft text-danger", high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };
const field = "bg-surface border-line text-ink focus:border-brand-light h-10 rounded-xl border px-3 text-sm outline-none transition";
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");
const TP_TYPES = Object.keys(TOUCHPOINT_LABELS);
const OBJ_TYPES = Object.keys(OBJECTION_LABELS);

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
function PropList({ items }: { items: { id: string; title: string }[] }) {
  if (items.length === 0) return <p className="text-muted text-sm">—</p>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((p) => (
        <li key={p.id}><Link href={`/properties/${p.id}`} className="text-ink hover:text-brand text-sm font-semibold">{p.title}</Link></li>
      ))}
    </ul>
  );
}

export function BuyerCommandCenter({ buyerId, buyerName, data, recommendations = [] }: { buyerId: string; buyerName: string; data: BuyerCC | null; recommendations?: RecoItemView[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [tpType, setTpType] = useState("phone_call");
  const [tpSentiment, setTpSentiment] = useState("");
  const [tpNote, setTpNote] = useState("");
  const [objType, setObjType] = useState("price");
  const [commitTitle, setCommitTitle] = useState("");
  const [commitDue, setCommitDue] = useState("");

  const run = (fn: () => Promise<{ error?: string }>, reset?: () => void) => {
    setError(null);
    start(async () => { const r = await fn(); if (r?.error) setError(r.error); else reset?.(); });
  };

  if (!data) {
    return (
      <div className="flex flex-col items-center gap-4 py-14 text-center">
        <span className="bg-brand-soft text-brand grid h-16 w-16 place-items-center rounded-3xl"><Icon name="Users" size={30} /></span>
        <div>
          <h3 className="text-ink text-xl font-black">מרכז ניהול קונה</h3>
          <p className="text-muted mx-auto mt-1 max-w-md text-sm">הפעל את ZONO Buyer Intelligence — תאום דיגיטלי לקונה עם מוכנות, הסתברות סגירה, התנגדויות ופעולות מומלצות.</p>
        </div>
        <Button onClick={() => run(() => initializeBuyerIntelligenceAction(buyerId))} disabled={pending} leadingIcon={<Icon name="Sparkles" size={18} />}>
          {pending ? "מפעיל…" : "הפעל מודיעין קונה"}
        </Button>
        {error && <p className="text-danger text-sm font-semibold">{error}</p>}
      </div>
    );
  }

  const p = data.profile;
  const openRisks = data.risks.filter((r) => r.status === "open");
  const openObjections = data.objections.filter((o) => !o.resolved);
  const curStage = p.current_stage as BuyerStage;
  const next = nextStage(p.current_stage);
  const tiles: { label: string; value: number; tone: Tone }[] = [
    { label: "בריאות קונה", value: p.buyer_health_score, tone: scoreTone(p.buyer_health_score) },
    { label: "מוכנות לרכישה", value: p.buyer_readiness_score, tone: scoreTone(p.buyer_readiness_score) },
    { label: "מעורבות", value: p.buyer_engagement_score, tone: scoreTone(p.buyer_engagement_score) },
    { label: "הסמכה", value: p.buyer_qualification_score, tone: scoreTone(p.buyer_qualification_score) },
    { label: "אמון", value: p.buyer_trust_score, tone: scoreTone(p.buyer_trust_score) },
    { label: "מימון", value: p.buyer_financing_score, tone: scoreTone(p.buyer_financing_score) },
    { label: "מומנטום", value: p.buyer_momentum_score, tone: scoreTone(p.buyer_momentum_score) },
    { label: "הסתברות סגירה", value: p.buyer_conversion_probability, tone: scoreTone(p.buyer_conversion_probability) },
  ];

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

      {/* 1) Header */}
      <div className="bg-brand-soft rounded-[22px] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-brand text-xs font-bold">{buyerName}</p>
            <h2 className="text-ink mt-1 text-xl font-black">מרכז ניהול קונה</h2>
            <p className="text-muted mt-1 text-sm">{p.intelligence_summary ?? ""}</p>
            <p className="text-brand-strong mt-2 flex items-center gap-1.5 text-sm font-bold"><Icon name="ArrowUpRight" size={16} />פעולה מומלצת: {p.next_best_action ?? "—"}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center"><p className={cn("text-3xl font-black", TONE_TEXT[scoreTone(p.buyer_conversion_probability)])}>{p.buyer_conversion_probability}%</p><p className="text-muted text-[11px] font-semibold">הסתברות סגירה</p></div>
            <div className="text-center"><p className={cn("text-3xl font-black", TONE_TEXT[scoreTone(p.buyer_readiness_score)])}>{p.buyer_readiness_score}</p><p className="text-muted text-[11px] font-semibold">{readinessLabel(p.buyer_readiness_score)}</p></div>
            <Button variant="secondary" onClick={() => run(() => recalcBuyerIntelligenceAction(buyerId))} disabled={pending} leadingIcon={<Icon name="TrendingUp" size={16} />}>חשב מחדש</Button>
          </div>
        </div>
      </div>

      {/* 2) Journey progress */}
      <SectionCard title="מסע קונה" icon="Route">
        <div className="no-scrollbar -mx-1 overflow-x-auto pb-1">
          <div className="flex min-w-[680px] items-center gap-1 px-1">
            {BUYER_STAGES.filter((s) => s !== "lost").map((s, i) => {
              const idx = stageIndex(curStage);
              const state = i < idx ? "done" : i === idx ? "active" : "upcoming";
              return (
                <div key={s} className="flex flex-1 items-center gap-1">
                  <span className={cn("grid h-7 flex-1 place-items-center rounded-lg text-[10px] font-bold", state === "done" ? "bg-success-soft text-success" : state === "active" ? "bg-brand text-white" : "bg-surface text-muted")}>{STAGE_LABELS[s]}</span>
                </div>
              );
            })}
          </div>
        </div>
        {next && <Button size="sm" className="mt-3" onClick={() => run(() => setBuyerStageAction(buyerId, next))} disabled={pending} leadingIcon={<Icon name="ArrowUpRight" size={15} />}>קדם ל{STAGE_LABELS[next]}</Button>}
      </SectionCard>

      {/* 3) Score grid */}
      <SectionCard title="ציוני קונה" icon="BarChart3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{tiles.map((t) => <ScoreTile key={t.label} {...t} />)}</div>
      </SectionCard>

      {/* Recommended properties (from Matching Intelligence) */}
      <RecommendedMatches title="נכסים מומלצים לקונה" emptyText="אין התאמות עדיין — חשב התאמות במסך 'התאמות'." items={recommendations} />


      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 7) Recommended actions */}
        <SectionCard title="פעולות מומלצות" icon="TrendingUp">
          <div className="flex flex-col gap-3">
            {data.actions.slice(0, 5).map((a) => (
              <div key={a.actionType} className="border-line rounded-2xl border p-3">
                <p className="text-ink text-sm font-bold">{a.title}</p>
                <div className="text-muted mt-1 flex flex-wrap gap-x-3 text-[11px]"><span>דחיפות {a.urgency}</span><span>השפעה {a.impact}</span><span>ביטחון {a.confidence}</span><span>רווח המרה +{a.conversionGain}</span></div>
                <Button size="sm" className="mt-2" onClick={() => run(() => buyerActionToTaskAction(buyerId, a.title))} disabled={pending}>צור משימה</Button>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 5) Risks */}
        <SectionCard title="סיכונים פעילים" icon="AlertTriangle">
          <div className="flex flex-col gap-3">
            {openRisks.length === 0 && <p className="text-muted text-sm">אין סיכונים פעילים ✓</p>}
            {openRisks.map((r) => (
              <div key={r.id} className="border-line rounded-2xl border p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-ink text-sm font-bold">{r.title}</p><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", SEVERITY_TONE[r.severity] ?? SEVERITY_TONE.low)}>{r.severity}</span></div>
                {r.recommended_action && <p className="text-brand-strong mt-1 text-xs font-semibold">המלצה: {r.recommended_action}</p>}
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => run(() => resolveBuyerRiskAction(buyerId, r.id))} disabled={pending}>טפל עכשיו</Button>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 6) Objections */}
        <SectionCard title="התנגדויות" icon="MessageCircle">
          <div className="bg-surface mb-3 flex flex-wrap gap-2 rounded-2xl p-3">
            <select className={field} value={objType} onChange={(e) => setObjType(e.target.value)}>{OBJ_TYPES.map((t) => <option key={t} value={t}>{OBJECTION_LABELS[t]}</option>)}</select>
            <Button size="sm" onClick={() => run(() => addBuyerObjectionAction(buyerId, objType, null))} disabled={pending} leadingIcon={<Icon name="Plus" size={15} />}>תעד</Button>
          </div>
          {openObjections.length === 0 ? <p className="text-muted text-sm">אין התנגדויות פתוחות ✓</p> : (
            <ul className="flex flex-col gap-1.5">
              {openObjections.map((o) => (
                <li key={o.id} className="border-line flex items-center justify-between border-b py-1.5 last:border-0 text-sm">
                  <span className="text-ink font-semibold">{o.objection_type ? OBJECTION_LABELS[o.objection_type] ?? o.objection_type : "התנגדות"}</span>
                  <Button size="sm" variant="ghost" onClick={() => run(() => resolveBuyerObjectionAction(buyerId, o.id))} disabled={pending}>טופל</Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 8) Touchpoints */}
        <SectionCard title="נקודות מגע" icon="MessageCircle">
          <div className="bg-surface mb-3 flex flex-col gap-2 rounded-2xl p-3">
            <div className="flex flex-wrap gap-2">
              <select className={field} value={tpType} onChange={(e) => setTpType(e.target.value)}>{TP_TYPES.map((t) => <option key={t} value={t}>{TOUCHPOINT_LABELS[t]}</option>)}</select>
              <select className={field} value={tpSentiment} onChange={(e) => setTpSentiment(e.target.value)}><option value="">סנטימנט</option><option value="positive">חיובי</option><option value="neutral">ניטרלי</option><option value="negative">שלילי</option></select>
              <Button size="sm" onClick={() => run(() => logBuyerTouchpointAction(buyerId, tpType, tpSentiment || null, tpNote || null), () => { setTpNote(""); setTpSentiment(""); })} disabled={pending} leadingIcon={<Icon name="Plus" size={15} />}>תעד</Button>
            </div>
            <input className={cn(field, "w-full")} placeholder="הערה (אופציונלי)" value={tpNote} onChange={(e) => setTpNote(e.target.value)} />
          </div>
          {data.touchpoints.length === 0 ? <p className="text-muted text-sm">אין נקודות מגע עדיין.</p> : (
            <ul className="flex flex-col gap-1.5">{data.touchpoints.slice(0, 6).map((t) => (<li key={t.id} className="border-line flex items-center justify-between border-b py-1.5 last:border-0 text-sm"><span className="text-ink font-semibold">{t.title ?? t.touchpoint_type}</span><span className="text-muted text-[11px]">{fmt(t.occurred_at)}</span></li>))}</ul>
          )}
        </SectionCard>

        {/* 9) Commitments */}
        <SectionCard title="התחייבויות" icon="Shield">
          <div className="bg-surface mb-3 flex flex-wrap gap-2 rounded-2xl p-3">
            <input className={cn(field, "min-w-[140px] flex-1")} placeholder="התחייבות (למשל: לשלוח מסמכים)" value={commitTitle} onChange={(e) => setCommitTitle(e.target.value)} />
            <input type="date" dir="ltr" className={field} value={commitDue} onChange={(e) => setCommitDue(e.target.value)} />
            <Button size="sm" disabled={pending || !commitTitle.trim()} onClick={() => run(() => createBuyerCommitmentAction(buyerId, commitTitle, commitDue || null), () => { setCommitTitle(""); setCommitDue(""); })}>הוסף</Button>
          </div>
          {data.commitments.length === 0 ? <p className="text-muted text-sm">אין התחייבויות.</p> : (
            <ul className="flex flex-col gap-2">
              {data.commitments.slice(0, 6).map((c) => (
                <li key={c.id} className="border-line flex items-center justify-between gap-2 border-b py-2 last:border-0">
                  <div className="min-w-0"><p className={cn("text-sm font-semibold", c.status === "fulfilled" ? "text-muted line-through" : c.status === "broken" ? "text-danger" : "text-ink")}>{c.title}</p><p className="text-muted text-[11px]">{fmt(c.due_date)}</p></div>
                  {c.status === "open" ? (
                    <span className="flex shrink-0 gap-1"><Button size="sm" variant="ghost" onClick={() => run(() => setBuyerCommitmentStatusAction(buyerId, c.id, "fulfilled"))} disabled={pending}>בוצע</Button><Button size="sm" variant="ghost" onClick={() => run(() => setBuyerCommitmentStatusAction(buyerId, c.id, "broken"))} disabled={pending}>לא קוים</Button></span>
                  ) : <Badge tone={c.status === "fulfilled" ? "success" : "danger"} size="sm">{c.status === "fulfilled" ? "מולא" : "הופר"}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 11-13) Property interactions */}
        <SectionCard title="נכסים שנצפו / אהב / נדחו" icon="Building2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><p className="text-muted mb-1 text-xs font-bold">נצפו ({p.viewed_properties_count})</p><PropList items={data.viewed} /></div>
            <div><p className="text-success mb-1 text-xs font-bold">אהב ({p.liked_properties_count})</p><PropList items={data.liked} /></div>
            <div><p className="text-danger mb-1 text-xs font-bold">נדחו ({p.rejected_properties_count})</p><PropList items={data.rejected} /></div>
          </div>
        </SectionCard>

        {/* 14) Financing status */}
        <SectionCard title="סטטוס מימון" icon="Shield">
          <div className="flex items-center gap-4">
            <p className={cn("text-3xl font-black", TONE_TEXT[scoreTone(p.buyer_financing_score)])}>{p.buyer_financing_score}</p>
            <div className="text-sm"><p className="text-ink font-semibold">{p.buyer_financing_score >= 70 ? "מימון מוכן" : p.buyer_financing_score >= 45 ? "מימון בתהליך" : "מימון לא ודאי"}</p><p className="text-muted text-xs">השלמת בדיקת מימון מגדילה את הסתברות הסגירה.</p></div>
          </div>
        </SectionCard>
      </div>

      {/* 10) Timeline */}
      <SectionCard title="ציר זמן קונה" icon="Clock"><EntityTimeline items={data.timeline} title="" emptyStateText="אין פעילות מתועדת עדיין." /></SectionCard>

      {/* 15) AI insights */}
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
