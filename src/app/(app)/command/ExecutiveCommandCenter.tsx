"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { attentionLevel, attentionTone, scoreTone, type Tone } from "@/lib/decision-intelligence/scoring";
import {
  focusToTaskAction,
  recalcDecisionBrainAction,
  setAttentionStatusAction,
} from "@/lib/decision-intelligence/actions";
import type { ExecutiveCommandCenter as ExecCC, FocusItem } from "@/lib/decision-intelligence/service";

const TONE_TEXT: Record<Tone, string> = { good: "text-success", medium: "text-brand-strong", risk: "text-danger" };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");
const entityHref = (t: string, id: string) => (t === "property" ? `/properties/${id}` : t === "seller" ? `/sellers/${id}` : t === "buyer" ? `/buyers/${id}` : t === "external_listing" ? `/properties?inv=external` : t === "locality" ? `/market` : t === "broker" ? `/broker-intelligence/${id}` : t === "acquisition" ? `/acquisition` : t === "competitor" ? `/competitors/${id}` : t === "routing" ? `/routing` : t === "graph" ? `/graph` : t === "forecast" ? `/forecast` : t === "team" ? `/team/${id}` : t === "team_office" ? `/team` : t === "revenue" ? `/revenue` : t === "marketing" ? `/marketing` : t === "distribution" ? `/distribution` : "#");
const ExtBadge = ({ t }: { t: string }) => (t === "external_listing" ? <span className="bg-brand-soft text-brand-strong shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold">חיצוני</span> : null);

function SectionCard({ title, icon, action, children }: { title: string; icon: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name={icon} size={16} /></span>
          <h3 className="text-ink text-sm font-extrabold">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ScoreTile({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className="bg-surface flex flex-col gap-1 rounded-2xl p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-muted text-[11px] font-bold">{label}</span>
        <span className={cn("text-2xl font-black", TONE_TEXT[tone])}>{value}</span>
      </div>
    </div>
  );
}

export function ExecutiveCommandCenter({ data, focus }: { data: ExecCC; focus: FocusItem[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    start(async () => { const r = await fn(); if (r?.error) setError(r.error); });
  };

  const p = data.profile;
  const notReady = !p || !p.last_calculated_at;

  if (notReady) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <span className="bg-brand-soft text-brand grid h-16 w-16 place-items-center rounded-3xl"><Icon name="Flame" size={30} /></span>
        <div>
          <h3 className="text-ink text-xl font-black">מרכז פיקוד</h3>
          <p className="text-muted mx-auto mt-1 max-w-md text-sm">הפעל את המוח המנהל של ZONO — הוא ינתח את כל הנכסים והמוכרים ויחליט מה דורש תשומת לב עכשיו, מה בסיכון ומה ייצר הכי הרבה ערך.</p>
        </div>
        <Button onClick={() => run(() => recalcDecisionBrainAction())} disabled={pending} leadingIcon={<Icon name="Sparkles" size={18} />}>
          {pending ? "מנתח…" : "הפעל מרכז פיקוד"}
        </Button>
        {error && <p className="text-danger text-sm font-semibold">{error}</p>}
      </div>
    );
  }

  const orgTiles: { label: string; value: number; tone: Tone }[] = [
    { label: "בריאות הארגון", value: p.organization_health_score, tone: scoreTone(p.organization_health_score) },
    { label: "סיכון", value: p.organization_risk_score, tone: attentionTone(p.organization_risk_score) },
    { label: "צמיחה", value: p.organization_growth_score, tone: scoreTone(p.organization_growth_score) },
    { label: "ביצוע", value: p.organization_execution_score, tone: scoreTone(p.organization_execution_score) },
    { label: "תשומת לב", value: p.organization_attention_score, tone: attentionTone(p.organization_attention_score) },
    { label: "הכנסות", value: p.organization_revenue_score, tone: scoreTone(p.organization_revenue_score) },
  ];

  const criticalRisks = data.attention.filter((a) => a.attention_score >= 70);
  const revenueBoard = [...data.attention].sort((a, b) => b.revenue_impact_score - a.revenue_impact_score).slice(0, 6);
  const relationshipBoard = data.attention.filter((a) => a.entity_type === "seller").sort((a, b) => b.relationship_impact_score - a.relationship_impact_score).slice(0, 6);

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

      {/* Header */}
      <div className="bg-brand-soft rounded-[22px] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-brand text-xs font-bold">ZONO Decision Intelligence</p>
            <h1 className="text-ink mt-1 text-2xl font-black">מרכז פיקוד</h1>
            <p className="text-muted mt-1 text-sm">{p.executive_summary}</p>
            <p className="text-brand-strong mt-2 flex items-center gap-1.5 text-sm font-bold">
              <Icon name="ArrowUpRight" size={16} />
              הפעולה העסקית הבאה: {p.next_best_business_action ?? "—"}
            </p>
          </div>
          <Button variant="secondary" onClick={() => run(() => recalcDecisionBrainAction())} disabled={pending} leadingIcon={<Icon name="TrendingUp" size={16} />}>
            חשב מחדש
          </Button>
        </div>
      </div>

      {/* External listings → Decision Brain debug counters */}
      <div className="bg-card border-line flex flex-wrap items-center gap-x-5 gap-y-1 rounded-[18px] border px-4 py-2.5 text-xs">
        <span className="text-muted font-bold">מודעות חיצוניות במוח המנהל:</span>
        <span className="text-muted">נטענו <b className="text-ink">{data.externalDebug.listingsLoaded}</b></span>
        <span className="text-muted">הזדמנויות <b className="text-ink">{data.externalDebug.opportunities}</b></span>
        <span className="text-muted">בתור עדיפויות <b className="text-ink">{data.externalDebug.inQueue}</b></span>
        <span className="text-muted">בהמלצות <b className="text-ink">{data.externalDebug.inRecommendations}</b></span>
        <span className="text-muted">במוקד היום <b className="text-ink">{focus.filter((f) => f.entityType === "external_listing").length}</b></span>
        {data.externalDebug.listingsLoaded > 0 && data.externalDebug.opportunities === 0 && (
          <span className="text-warning">— ייתכן שצריך ״חשב מחדש״</span>
        )}
      </div>

      {/* Revenue pipeline (from Matching Intelligence) */}
      <div className="bg-card border-line flex flex-wrap items-center justify-between gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3">
          <span className="bg-success-soft text-success grid h-11 w-11 place-items-center rounded-2xl"><Icon name="TrendingUp" size={22} /></span>
          <div><p className="text-muted text-xs font-semibold">צנרת הכנסות (משוקללת בהסתברות)</p><p className="text-success text-3xl font-black">{formatShekels(data.revenuePipeline)}</p></div>
        </div>
        <Link href="/matches" className="text-brand-strong text-sm font-bold hover:underline">לכל ההתאמות ←</Link>
      </div>

      {/* 1) Organization health */}
      <SectionCard title="בריאות הארגון" icon="BarChart3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {orgTiles.map((t) => <ScoreTile key={t.label} {...t} />)}
        </div>
        <div className="text-muted mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <span>נכסים פעילים: <b className="text-ink">{p.active_properties}</b></span>
          <span>מוכרים: <b className="text-ink">{p.active_sellers}</b></span>
          <span>נכסים בסיכון: <b className="text-danger">{p.high_risk_properties}</b></span>
          <span>מוכרים בסיכון: <b className="text-danger">{p.high_risk_sellers}</b></span>
          <span>נכסים תקועים: <b className="text-ink">{p.stalled_properties}</b></span>
          <span>מוכרים ללא קשר: <b className="text-ink">{p.stalled_sellers}</b></span>
          <span>משימות באיחור: <b className="text-ink">{p.overdue_tasks}</b></span>
          <span>התחייבויות באיחור: <b className="text-danger">{p.overdue_commitments}</b></span>
        </div>
      </SectionCard>

      {/* Today's Focus */}
      <SectionCard title="מוקד היום — מה לטפל עכשיו" icon="Flame">
        {focus.length === 0 ? (
          <p className="text-muted text-sm">אין פעולות דחופות כרגע ✓</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {focus.map((f, i) => (
              <li key={`${f.entityId}-${i}`} className="border-line flex items-center gap-3 rounded-2xl border p-3">
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-black", i === 0 ? "bg-danger text-white" : "bg-brand-soft text-brand-strong")}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5"><Link href={entityHref(f.entityType, f.entityId)} className="text-ink hover:text-brand text-sm font-bold">{f.title}</Link><ExtBadge t={f.entityType} /></span>
                  <p className="text-muted text-xs">{f.why}{f.action ? ` · ${f.action}` : ""}</p>
                </div>
                <span className={cn("shrink-0 text-sm font-black", TONE_TEXT[attentionTone(f.priority)])}>{f.priority}</span>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => focusToTaskAction(f.entityType, f.entityId, f.action || f.title))}>למשימה</Button>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 2) Attention center */}
        <SectionCard title="דורש תשומת לב" icon="AlertTriangle">
          {data.attention.length === 0 ? <p className="text-muted text-sm">אין פריטים פתוחים ✓</p> : (
            <ul className="flex flex-col gap-2">
              {data.attention.slice(0, 8).map((a) => (
                <li key={a.id} className="border-line flex items-center gap-2 border-b py-2 last:border-0">
                  <span className={cn("shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold", TONE_TEXT[attentionTone(a.attention_score)], "bg-surface")}>{attentionLevel(a.attention_score)}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={entityHref(a.entity_type, a.entity_id)} className="text-ink hover:text-brand text-sm font-semibold">{a.title}</Link>
                    <p className="text-muted text-[11px]">{a.reason}</p>
                  </div>
                  <span className={cn("shrink-0 text-sm font-black", TONE_TEXT[attentionTone(a.attention_score)])}>{a.attention_score}</span>
                  <button type="button" className="text-muted hover:text-danger shrink-0" onClick={() => run(() => setAttentionStatusAction(a.id, "resolved"))} aria-label="טופל"><Icon name="UserCheck" size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 3) Critical risks */}
        <SectionCard title="סיכונים קריטיים" icon="TrendingDown">
          {criticalRisks.length === 0 ? <p className="text-muted text-sm">אין סיכונים קריטיים ✓</p> : (
            <ul className="flex flex-col gap-2">
              {criticalRisks.slice(0, 8).map((a) => (
                <li key={a.id} className="border-line flex items-center justify-between gap-2 border-b py-2 last:border-0">
                  <div className="min-w-0">
                    <Link href={entityHref(a.entity_type, a.entity_id)} className="text-ink hover:text-brand text-sm font-semibold">{a.title}</Link>
                    <p className="text-muted text-[11px]">{a.reason}</p>
                  </div>
                  <span className="text-danger shrink-0 text-sm font-black">{a.attention_score}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 4) Opportunities */}
        <SectionCard title="הזדמנויות" icon="Sparkles">
          {data.opportunities.length === 0 ? <p className="text-muted text-sm">אין הזדמנויות פתוחות</p> : (
            <ul className="flex flex-col gap-2">
              {data.opportunities.slice(0, 8).map((o) => (
                <li key={o.id} className="border-line flex items-center justify-between gap-2 border-b py-2 last:border-0">
                  <div className="min-w-0">
                    <span className="flex items-center gap-1.5"><Link href={entityHref(o.entity_type, o.entity_id)} className="text-ink hover:text-brand text-sm font-semibold">{o.title}</Link><ExtBadge t={o.entity_type} /></span>
                    <p className="text-muted text-[11px]">{o.recommended_action}</p>
                  </div>
                  <span className="text-success shrink-0 text-sm font-black">{o.opportunity_score}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 5) Priority queue */}
        <SectionCard title="תור עדיפויות" icon="Route">
          {data.queue.length === 0 ? <p className="text-muted text-sm">התור ריק</p> : (
            <ol className="flex flex-col gap-1.5">
              {data.queue.slice(0, 10).map((q) => (
                <li key={q.id} className="flex items-center gap-2 text-sm">
                  <span className="bg-surface text-muted grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[11px] font-black">{q.rank_position}</span>
                  <Link href={entityHref(q.entity_type, q.entity_id)} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{q.title}</Link>
                  <ExtBadge t={q.entity_type} />
                  <span className="text-muted shrink-0 text-[11px]">{q.action_type === "opportunity" ? "הזדמנות" : "סיכון"}</span>
                  <span className="text-brand-strong shrink-0 font-black">{q.priority_score}</span>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>

        {/* 6) Upcoming commitments */}
        <SectionCard title="התחייבויות קרובות" icon="Shield">
          {data.upcomingCommitments.length === 0 ? <p className="text-muted text-sm">אין התחייבויות פתוחות</p> : (
            <ul className="flex flex-col gap-1.5">
              {data.upcomingCommitments.map((c) => (
                <li key={c.id} className="border-line flex items-center justify-between border-b py-1.5 last:border-0 text-sm">
                  <span className="text-ink font-semibold">{c.sellerName} · {c.title}</span>
                  <span className="text-muted text-[11px]">{fmt(c.due)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 7) Recommended actions */}
        <SectionCard title="פעולות מומלצות" icon="TrendingUp">
          {data.recommendations.length === 0 ? <p className="text-muted text-sm">אין המלצות כרגע</p> : (
            <ul className="flex flex-col gap-2">
              {data.recommendations.slice(0, 6).map((r) => (
                <li key={r.id} className="border-line flex items-center justify-between gap-2 border-b py-2 last:border-0">
                  <div className="min-w-0">
                    <p className="text-ink text-sm font-semibold">{r.title}</p>
                    <p className="text-muted text-[11px]">{r.description}</p>
                  </div>
                  {r.entity_id && r.entity_type && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => focusToTaskAction(r.entity_type!, r.entity_id!, r.title))}>למשימה</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 8) Revenue impact board */}
        <SectionCard title="לוח השפעה על הכנסות" icon="BarChart3">
          {revenueBoard.length === 0 ? <p className="text-muted text-sm">אין נתונים</p> : (
            <ul className="flex flex-col gap-1.5">
              {revenueBoard.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={entityHref(a.entity_type, a.entity_id)} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{a.title}</Link>
                  <div className="bg-surface h-2 w-20 shrink-0 overflow-hidden rounded-full"><div className="bg-brand h-full" style={{ width: `${a.revenue_impact_score}%` }} /></div>
                  <span className="text-muted shrink-0 text-[11px]">{a.revenue_impact_score}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 9) Relationship risk board */}
        <SectionCard title="לוח סיכון מערכות יחסים" icon="Shield">
          {relationshipBoard.length === 0 ? <p className="text-muted text-sm">אין מוכרים בסיכון ✓</p> : (
            <ul className="flex flex-col gap-1.5">
              {relationshipBoard.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={entityHref(a.entity_type, a.entity_id)} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{a.title}</Link>
                  <span className="text-danger shrink-0 text-[11px] font-bold">סיכון נטישה {a.churn_impact_score}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* 10) Activity heatmap (placeholder summary) */}
      <SectionCard title="מפת חום פעילות" icon="Clock">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ScoreTile label="ביצוע" value={p.organization_execution_score} tone={scoreTone(p.organization_execution_score)} />
          <ScoreTile label="תשומת לב" value={p.organization_attention_score} tone={attentionTone(p.organization_attention_score)} />
          <ScoreTile label="נכסים תקועים" value={p.stalled_properties} tone={p.stalled_properties > 0 ? "risk" : "good"} />
          <ScoreTile label="מוכרים ללא קשר" value={p.stalled_sellers} tone={p.stalled_sellers > 0 ? "risk" : "good"} />
        </div>
        <p className="text-muted mt-2 text-[11px]">מפת חום מבוססת-זמן מפורטת תתווסף בשלב הבא.</p>
      </SectionCard>

      {/* AI insights */}
      <SectionCard title="תובנות ZONO" icon="Sparkles">
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-ink"><span className="text-muted">סיכום: </span>{p.executive_summary ?? "—"}</p>
          <p className="text-ink"><span className="text-muted">סיכונים: </span>{p.risk_summary ?? "—"}</p>
          <p className="text-ink"><span className="text-muted">צמיחה: </span>{p.growth_summary ?? "—"}</p>
          <p className="text-muted text-[11px]">חושב לאחרונה: {fmt(p.last_calculated_at)} · ניתוח AI יתווסף בשלב הבא.</p>
        </div>
      </SectionCard>
    </div>
  );
}
