"use client";

import { useMemo } from "react";
import type { CenterAnalytics, CenterStats } from "@/lib/distribution/center-data";
import { Glass, StatTile, SectionHeading, EmptyState, Icon, nfmt, compact, pct } from "./shared";

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" }); }
  catch { return iso; }
}

export function AnalyticsSection({ analytics, stats }: { analytics: CenterAnalytics[]; stats: CenterStats }) {
  // Most recent first for the per-period table.
  const rows = useMemo(
    () => [...analytics].sort((a, b) => (a.periodDate < b.periodDate ? 1 : -1)),
    [analytics],
  );
  const impMax = Math.max(1, ...analytics.map((a) => a.impressions));
  const ctr = stats.impressions > 0 ? Math.round((stats.clicks / stats.impressions) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="אנליטיקה" subtitle="ביצועי ההפצה — חשיפות, קליקים, תגובות, לידים והמרה" icon="BarChart3" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="חשיפות" value={compact(stats.impressions)} hint="מצטבר" icon="Eye" tone="brand" />
        <StatTile label="קליקים" value={compact(stats.clicks)} hint={`CTR ${pct(ctr)}`} icon="MousePointerClick" tone="accent" />
        <StatTile label="תגובות" value={compact(stats.comments)} hint="אינטראקציות" icon="MessageSquare" tone="warning" />
        <StatTile label="לידים" value={nfmt(stats.leads)} hint={`${nfmt(stats.newLeads)} חדשים`} icon="UserPlus" tone="success" />
        <StatTile label="המרה" value={pct(stats.conversionRate)} hint="קליקים ← לידים" icon="TrendingUp" tone={stats.conversionRate >= 5 ? "success" : "warning"} />
        <StatTile label="פוסטים" value={nfmt(stats.publishedPosts)} hint="פורסמו" icon="Send" tone="brand" />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="BarChart3" title="אין עדיין נתוני אנליטיקה" body="לאחר שפוסטים יפורסמו ויתחילו לצבור חשיפות, קליקים ותגובות — ZONO יציג כאן את הביצועים לפי תקופה." />
      ) : (
        <Glass className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-start text-sm">
              <thead className="text-muted border-line bg-white/40 border-b text-xs">
                <tr>{["תקופה", "חשיפות", "קליקים", "תגובות", "לידים", "המרה"].map((h) => <th key={h} className="px-4 py-3 text-start font-bold whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-line hover:bg-white/40 border-b transition-colors last:border-0">
                    <td className="text-ink px-4 py-3 font-bold whitespace-nowrap">{fmtDate(a.periodDate)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-line/70 h-1.5 w-24 overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full" style={{ width: `${Math.max(3, (a.impressions / impMax) * 100)}%` }} /></div>
                        <span className="text-ink font-bold tabular-nums">{compact(a.impressions)}</span>
                      </div>
                    </td>
                    <td className="text-ink px-4 py-3 font-bold tabular-nums">{compact(a.clicks)}</td>
                    <td className="text-muted px-4 py-3 tabular-nums">{compact(a.commentsCount)}</td>
                    <td className="text-ink px-4 py-3 font-bold tabular-nums">{nfmt(a.leadsCount)}</td>
                    <td className="text-brand-strong px-4 py-3 font-black tabular-nums">{pct(a.conversionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Glass>
      )}

      <div className="text-muted flex items-center gap-2 text-xs">
        <Icon name="Info" size={13} /> הנתונים מתעדכנים אוטומטית עם פרסום הפוסטים ואיסוף האינטראקציות מהקהילות.
      </div>
    </div>
  );
}
