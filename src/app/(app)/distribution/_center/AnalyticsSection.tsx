"use client";

import { useMemo } from "react";
import type { DistributionBoard, DailyWorkspace } from "@/lib/distribution/service";
import { Glass, SectionHeading, ScoreBar, EmptyState, Icon, compact, TONE_BAR, scoreTone } from "./shared";
import { ANGLE_LABEL, type Angle } from "./variations";
import { cn } from "@/lib/utils";

export function AnalyticsSection({ board, daily }: { board: DistributionBoard; daily: DailyWorkspace }) {
  const bestGroups = useMemo(
    () => [...board.communities].sort((a, b) => (b.intel?.community_health_score ?? 0) - (a.intel?.community_health_score ?? 0)).slice(0, 5),
    [board.communities],
  );

  const bestCities = useMemo(() => {
    const m = new Map<string, { count: number; sum: number; leads: number }>();
    for (const c of board.communities) {
      if (!c.city) continue;
      const e = m.get(c.city) ?? { count: 0, sum: 0, leads: 0 };
      e.count++; e.sum += c.intel?.community_health_score ?? 0; e.leads += c.intel?.leads_generated ?? 0;
      m.set(c.city, e);
    }
    return Array.from(m.entries()).map(([city, e]) => ({ city, count: e.count, avg: Math.round(e.sum / e.count), leads: e.leads }))
      .sort((a, b) => b.avg - a.avg).slice(0, 5);
  }, [board.communities]);

  const angleCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of daily.items) {
      const a = (it.copy_payload as { angle?: string } | null)?.angle;
      if (a) m.set(a, (m.get(a) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [daily.items]);

  const ctaCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of daily.items) if (it.suggested_cta) m.set(it.suggested_cta, (m.get(it.suggested_cta) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [daily.items]);

  const timeHeat = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of daily.items) { const t = it.recommended_time ?? "—"; m.set(t, (m.get(t) ?? 0) + 1); }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [daily.items]);
  const heatMax = Math.max(1, ...timeHeat.map((t) => t[1]));

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="אנליטיקה" subtitle="מה עובד הכי טוב — קבוצות, ערים, סוגי תוכן ושעות" icon="BarChart3" />

      {board.communities.length === 0 ? (
        <EmptyState icon="BarChart3" title="אין עדיין נתוני ביצועים" body="לאחר אישור קהילות והרצת מודיעין הפצה, ZONO יציג כאן את הקבוצות, הערים, סוגי התוכן והשעות עם הביצועים הטובים ביותר." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Best groups */}
          <Glass className="flex flex-col gap-3 p-5">
            <p className="text-ink text-sm font-extrabold">קבוצות מובילות</p>
            {bestGroups.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="text-ink min-w-0 flex-1 truncate text-sm font-bold">{c.name}</span>
                <ScoreBar value={c.intel?.community_health_score ?? 0} />
              </div>
            ))}
          </Glass>

          {/* Best cities */}
          <Glass className="flex flex-col gap-3 p-5">
            <p className="text-ink text-sm font-extrabold">ערים מובילות</p>
            {bestCities.length === 0 ? <p className="text-muted text-sm">אין נתוני ערים זמינים.</p> : bestCities.map((c) => (
              <div key={c.city} className="flex items-center gap-3">
                <span className="text-ink w-24 shrink-0 truncate text-sm font-bold">{c.city}</span>
                <ScoreBar value={c.avg} width="w-full" />
                <span className="text-muted shrink-0 text-[11px] font-semibold">{c.count} קב׳</span>
              </div>
            ))}
          </Glass>

          {/* Best post types */}
          <Glass className="flex flex-col gap-3 p-5">
            <p className="text-ink text-sm font-extrabold">סוגי תוכן מובילים</p>
            {angleCounts.length === 0 ? (
              <p className="text-muted text-sm">סוגי התוכן יחושבו לאחר שיופקו פוסטים במחזור ההפצה.</p>
            ) : angleCounts.map(([a, n]) => {
              const w = (n / Math.max(1, angleCounts[0][1])) * 100;
              const tone = scoreTone(w);
              return (
                <div key={a} className="flex items-center gap-3">
                  <span className="text-ink w-24 shrink-0 text-sm font-bold">{ANGLE_LABEL[a as Angle] ?? a}</span>
                  <div className="bg-line/70 h-2 flex-1 overflow-hidden rounded-full"><div className={cn("h-full rounded-full", TONE_BAR[tone])} style={{ width: `${w}%` }} /></div>
                  <span className="text-muted shrink-0 text-[11px] font-bold tabular-nums">{n}</span>
                </div>
              );
            })}
          </Glass>

          {/* Best CTA */}
          <Glass className="flex flex-col gap-3 p-5">
            <p className="text-ink text-sm font-extrabold">קריאות לפעולה מובילות</p>
            {ctaCounts.length === 0 ? (
              <p className="text-muted text-sm">ה-CTA המנצחים יוצגו לאחר הפקת פוסטים.</p>
            ) : ctaCounts.map(([c, n]) => (
              <div key={c} className="bg-card/60 border-line flex items-center justify-between gap-2 rounded-xl border p-2.5">
                <span className="text-ink truncate text-[13px] font-semibold">{c}</span>
                <span className="text-brand-strong shrink-0 text-xs font-black tabular-nums">×{n}</span>
              </div>
            ))}
          </Glass>

          {/* Posting-time heatmap */}
          <Glass className="flex flex-col gap-3 p-5 lg:col-span-2">
            <div className="flex items-center gap-2">
              <Icon name="Clock" size={16} className="text-brand-strong" />
              <p className="text-ink text-sm font-extrabold">מפת שעות פרסום</p>
            </div>
            {timeHeat.length === 0 ? (
              <p className="text-muted text-sm">מפת השעות תיבנה לפי מועדי הפרסום במחזור ההפצה הפעיל.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {timeHeat.map(([t, n]) => {
                  const intensity = n / heatMax;
                  return (
                    <div key={t} className="flex flex-col items-center gap-1">
                      <div className="grid h-14 w-20 place-items-center rounded-xl text-sm font-black text-white" style={{ background: `rgba(124,58,237,${0.25 + intensity * 0.65})` }}>{n}</div>
                      <span className="text-muted text-[10px] font-semibold">{t}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Glass>

          <div className="text-muted lg:col-span-2 flex items-center gap-2 text-xs">
            <Icon name="Info" size={13} /> חשיפה ולידים מצטברים: {compact(board.communities.reduce((s, c) => s + (c.intel?.leads_generated ?? 0), 0))} לידים מ-{board.communities.length} קהילות.
          </div>
        </div>
      )}
    </div>
  );
}
