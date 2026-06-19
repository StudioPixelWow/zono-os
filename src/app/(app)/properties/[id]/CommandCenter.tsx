"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { riskTone, scoreTone, type ScoreTone } from "@/lib/intelligence/scoring";
import {
  initializeIntelligenceAction,
  leverToTaskAction,
  markLeverDoneAction,
  recalcIntelligenceAction,
  resolveRiskAction,
  scheduleCalendarPlanAction,
} from "@/lib/intelligence/actions";
import type { CommandCenter as CommandCenterData } from "@/lib/intelligence/service";
import { RecommendedMatches, type RecoItemView } from "@/components/activity/RecommendedMatches";
import type { Database } from "@/lib/supabase/types";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];

const TONE_TEXT: Record<ScoreTone, string> = {
  good: "text-success",
  medium: "text-brand-strong",
  risk: "text-danger",
};
const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-danger-soft text-danger",
  high: "bg-danger-soft text-danger",
  medium: "bg-warning-soft text-warning",
  low: "bg-surface text-muted",
};
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");

function SectionCard({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl">
            <Icon name={icon} size={16} />
          </span>
          <h3 className="text-ink text-sm font-extrabold">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ScoreTile({
  label,
  value,
  explain,
  tone,
}: {
  label: string;
  value: number;
  explain: string;
  tone: ScoreTone;
}) {
  return (
    <div className="bg-surface flex flex-col gap-1 rounded-2xl p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-muted text-[11px] font-bold">{label}</span>
        <span className={cn("text-2xl font-black", TONE_TEXT[tone])}>{value}</span>
      </div>
      <p className="text-muted text-[10px] leading-tight">{explain}</p>
      <span className="text-muted text-[10px]">מגמה: —</span>
    </div>
  );
}

export function CommandCenter({
  propertyId,
  propertyTitle,
  addressLine,
  data,
  tasks,
  recommendedBuyers = [],
}: {
  propertyId: string;
  propertyTitle: string;
  addressLine: string;
  data: CommandCenterData | null;
  tasks: TaskRow[];
  recommendedBuyers?: RecoItemView[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
    });
  };

  // ── Not initialized yet ──
  if (!data) {
    return (
      <div className="flex flex-col items-center gap-4 py-14 text-center">
        <span className="bg-brand-soft text-brand grid h-16 w-16 place-items-center rounded-3xl">
          <Icon name="Sparkles" size={30} />
        </span>
        <div>
          <h3 className="text-ink text-xl font-black">מרכז ניהול נכס</h3>
          <p className="text-muted mx-auto mt-1 max-w-md text-sm">
            הפעל את ZONO Intelligence כדי לבנות אוטומטית משימות, מנופי צמיחה,
            סיכונים, הצעות יומן וציוני ביצוע לנכס זה.
          </p>
        </div>
        <Button
          onClick={() => run(() => initializeIntelligenceAction(propertyId))}
          disabled={pending}
          leadingIcon={<Icon name="Sparkles" size={18} />}
        >
          {pending ? "מפעיל…" : "הפעל ZONO Intelligence"}
        </Button>
        {error && <p className="text-danger text-sm font-semibold">{error}</p>}
      </div>
    );
  }

  const p = data.profile;
  const openRisks = data.risks.filter((r) => r.status === "open");
  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");

  const scoreTiles: { label: string; value: number; explain: string; tone: ScoreTone }[] = [
    { label: "ציון בריאות", value: p.health_score, explain: "שלמות נתונים, תמונות, תיאור ומסמכים", tone: scoreTone(p.health_score) },
    { label: "ציון הצלחה", value: p.success_score, explain: "סיכוי המכירה הכולל", tone: scoreTone(p.success_score) },
    { label: "סיכונים", value: p.risk_score, explain: "רמת הסיכון הפעילה", tone: riskTone(p.risk_score) },
    { label: "שיווק", value: p.marketing_score, explain: "תמונות, וידאו, תיאור וערוצים", tone: scoreTone(p.marketing_score) },
    { label: "חשיפה", value: p.exposure_score, explain: "ערוצים, צפיות ופניות", tone: scoreTone(p.exposure_score) },
    { label: "אמון מוכר", value: p.seller_trust_score, explain: "עדכונים ודיווח למוכר", tone: scoreTone(p.seller_trust_score) },
    { label: "מיצוב שוק", value: p.market_position_score, explain: "שלמות והיסטוריית מחיר", tone: scoreTone(p.market_position_score) },
    { label: "מומנטום", value: p.momentum_score, explain: "פעילות אחרונה וקצב", tone: scoreTone(p.momentum_score) },
  ];

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>
      )}

      {/* 1) Mission header */}
      <div className="bg-brand-soft rounded-[22px] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-brand text-xs font-bold">{addressLine || propertyTitle}</p>
            <h2 className="text-ink mt-1 text-xl font-black">{p.mission_title ?? "מרכז ניהול נכס"}</h2>
            <p className="text-muted mt-1 text-sm">
              שלב: {p.current_stage ?? "—"} · {p.intelligence_summary ?? ""}
            </p>
            <p className="text-brand-strong mt-2 flex items-center gap-1.5 text-sm font-bold">
              <Icon name="ArrowUpRight" size={16} />
              פעולה מומלצת: {p.next_best_action ?? "—"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className={cn("text-3xl font-black", TONE_TEXT[scoreTone(p.success_score)])}>{p.success_score}</p>
              <p className="text-muted text-[11px] font-semibold">ציון הצלחה</p>
            </div>
            <div className="text-center">
              <p className={cn("text-3xl font-black", TONE_TEXT[scoreTone(p.health_score)])}>{p.health_score}</p>
              <p className="text-muted text-[11px] font-semibold">ציון בריאות</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => run(() => recalcIntelligenceAction(propertyId))}
              disabled={pending}
              leadingIcon={<Icon name="TrendingUp" size={16} />}
            >
              חשב מחדש
            </Button>
          </div>
        </div>
      </div>

      {/* 2) Score grid */}
      <SectionCard title="ציוני ביצוע" icon="BarChart3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {scoreTiles.map((s) => (
            <ScoreTile key={s.label} {...s} />
          ))}
        </div>
      </SectionCard>

      {/* Recommended buyers (from Matching Intelligence) */}
      <RecommendedMatches title="קונים מומלצים לנכס" emptyText="אין התאמות עדיין — חשב התאמות במסך 'התאמות'." items={recommendedBuyers} />


      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 3) Levers */}
        <SectionCard title="מנופי צמיחה" icon="TrendingUp">
          <div className="flex flex-col gap-3">
            {data.levers.length === 0 && <p className="text-muted text-sm">אין מנופים.</p>}
            {data.levers.slice(0, 6).map((l) => (
              <div key={l.id} className="border-line rounded-2xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-ink text-sm font-bold">{l.title}</p>
                  {l.status === "done" ? (
                    <Badge tone="success" size="sm">בוצע</Badge>
                  ) : l.status === "in_progress" ? (
                    <Badge tone="brand" size="sm">בעבודה</Badge>
                  ) : null}
                </div>
                {l.expected_impact && (
                  <p className="text-muted mt-0.5 text-xs">השפעה צפויה: {l.expected_impact}</p>
                )}
                <div className="text-muted mt-1.5 flex flex-wrap gap-x-3 text-[11px]">
                  <span>השפעה {l.impact_score}</span>
                  <span>דחיפות {l.urgency_score}</span>
                  <span>מאמץ {l.effort_score}</span>
                  <span>ביטחון {l.confidence_score}</span>
                </div>
                {l.status !== "done" && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => run(() => leverToTaskAction(propertyId, l.id))} disabled={pending}>
                      צור משימה
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => run(() => markLeverDoneAction(propertyId, l.id))} disabled={pending}>
                      סמן בוצע
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 4) Risks */}
        <SectionCard title="סיכונים פעילים" icon="AlertTriangle">
          <div className="flex flex-col gap-3">
            {openRisks.length === 0 && <p className="text-muted text-sm">אין סיכונים פעילים ✓</p>}
            {openRisks.map((r) => (
              <div key={r.id} className="border-line rounded-2xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-ink text-sm font-bold">{r.title}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", SEVERITY_TONE[r.severity] ?? SEVERITY_TONE.low)}>
                    {r.severity}
                  </span>
                </div>
                {r.description && <p className="text-muted mt-0.5 text-xs">{r.description}</p>}
                {r.recommended_action && (
                  <p className="text-brand-strong mt-1 text-xs font-semibold">המלצה: {r.recommended_action}</p>
                )}
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => run(() => resolveRiskAction(propertyId, r.id))} disabled={pending}>
                  טפל עכשיו
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 5) Missions */}
        <SectionCard title="משימות יעד (Missions)" icon="Route">
          <div className="flex flex-col gap-3">
            {data.missions.length === 0 && <p className="text-muted text-sm">אין יעדים.</p>}
            {data.missions.map((m) => {
              const target = Number(m.target_value ?? 0);
              const pct = target > 0 ? Math.min(100, Math.round((Number(m.current_value) / target) * 100)) : 0;
              return (
                <div key={m.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink font-semibold">{m.title}</span>
                    <span className="text-muted text-xs">{m.current_value}/{m.target_value ?? "—"} · {fmtDate(m.due_date)}</span>
                  </div>
                  <div className="bg-surface mt-1 h-2 w-full overflow-hidden rounded-full">
                    <div className="bg-brand h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* 6) Smart tasks */}
        <SectionCard title="משימות חכמות" icon="UserCheck">
          <div className="flex flex-col gap-2">
            {openTasks.length === 0 && <p className="text-muted text-sm">אין משימות פתוחות.</p>}
            {openTasks.slice(0, 8).map((t) => (
              <div key={t.id} className="border-line flex items-center justify-between border-b py-2 last:border-0">
                <span className="text-ink text-sm font-semibold">{t.title}</span>
                <span className="text-muted text-[11px]">{t.priority} · {fmtDate(t.due_at)}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 7) Calendar suggestions */}
        <SectionCard title="הצעות יומן" icon="Clock">
          <div className="flex flex-col gap-3">
            {data.calendar.length === 0 && <p className="text-muted text-sm">אין הצעות יומן.</p>}
            {data.calendar.map((c) => (
              <div key={c.id} className="border-line flex items-center justify-between gap-2 rounded-2xl border p-3">
                <div className="min-w-0">
                  <p className="text-ink text-sm font-bold">{c.title}</p>
                  <p className="text-muted text-xs">{fmtDate(c.suggested_date)} · {c.description}</p>
                </div>
                {c.status === "scheduled" ? (
                  <Badge tone="success" size="sm">שובץ</Badge>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => run(() => scheduleCalendarPlanAction(propertyId, c.id, c.title, c.suggested_date))} disabled={pending}>
                    שבץ ביומן
                  </Button>
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 8) Seller trust */}
        <SectionCard title="אמון מוכר" icon="Shield">
          <div className="flex items-center justify-between">
            <div>
              <p className={cn("text-3xl font-black", TONE_TEXT[scoreTone(p.seller_trust_score)])}>{p.seller_trust_score}</p>
              <p className="text-muted text-xs">דיווחים שנשלחו: {data.touchpoints.filter((t) => (t.touchpoint_type ?? "").includes("דוח")).length}</p>
              <p className="text-muted text-xs">עדכון אחרון: {fmtDate(data.touchpoints[0]?.created_at ?? null)}</p>
            </div>
          </div>
          {data.touchpoints.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {data.touchpoints.slice(0, 4).map((t) => (
                <li key={t.id} className="text-muted flex justify-between text-xs">
                  <span>{t.title ?? t.touchpoint_type}</span>
                  <span>{fmtDate(t.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
          {data.touchpoints.length === 0 && (
            <p className="text-brand-strong mt-2 text-xs font-semibold">המלצה: שלח עדכון ראשון למוכר</p>
          )}
        </SectionCard>

        {/* 9) Exposure */}
        <SectionCard title="חשיפה" icon="Megaphone">
          <div className="mb-2 flex items-baseline gap-2">
            <span className={cn("text-2xl font-black", TONE_TEXT[scoreTone(p.exposure_score)])}>{p.exposure_score}</span>
            <span className="text-muted text-xs">ציון חשיפה</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {data.exposure.map((c) => (
              <li key={c.id} className="flex items-center justify-between text-xs">
                <span className="text-ink font-semibold">{c.channel}</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted">{c.views_count}צ׳ · {c.leads_count}פ׳</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", c.status === "published" ? "bg-success-soft text-success" : "bg-surface text-muted")}>
                    {c.status === "published" ? "פורסם" : "לא פורסם"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* 10) Activity intelligence */}
        <SectionCard title="מודיעין פעילות" icon="Clock">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className={cn("text-3xl font-black", TONE_TEXT[scoreTone(p.momentum_score)])}>{p.momentum_score}</p>
              <p className="text-muted text-[11px] font-semibold">מומנטום</p>
            </div>
            <div className="text-sm">
              <p className="text-muted">חושב לאחרונה: {fmtDate(p.last_calculated_at)}</p>
              <p className="text-brand-strong mt-1 font-semibold">פעולה הבאה: {p.next_best_action ?? "—"}</p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
