"use client";
// ============================================================================
// 🗺️ Neighborhood Dashboard™ — activity leaderboards (presentation only · RTL).
// Ranks neighborhoods by existing listing counts; the leader office/broker,
// acceptance and competition load on click in the full Neighborhood profile.
// No recompute, no fabricated values.
// ============================================================================
import { TerminalSection, Metric, MetricGrid, TerminalEmpty } from "@/components/intelligence/terminal";
import { NeighborhoodLink } from "@/components/intelligence/EntityLinks";
import type { ExplorerNeighborhood } from "@/lib/intelligence-explorer/types";

export function NeighborhoodDashboardView({ neighborhoods }: { neighborhoods: ExplorerNeighborhood[] }) {
  const byActivity = [...neighborhoods].sort((a, b) => b.listings - a.listings).slice(0, 12);
  const byOpportunity = [...neighborhoods].sort((a, b) => b.privateListings - a.privateListings).slice(0, 12);
  const totalListings = neighborhoods.reduce((s, n) => s + n.listings, 0);
  const totalPrivate = neighborhoods.reduce((s, n) => s + n.privateListings, 0);

  return (
    <div dir="rtl" className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-start gap-3">
        <span className="bg-brand-soft text-brand-strong grid h-12 w-12 place-items-center rounded-2xl text-2xl">🗺️</span>
        <div>
          <p className="text-brand text-[11px] font-black tracking-wide">NEIGHBORHOOD INTELLIGENCE™</p>
          <h1 className="text-ink text-2xl font-black sm:text-3xl">דשבורד שכונות</h1>
          <p className="text-muted mt-0.5 text-sm">היכן הפעילות · היכן ההזדמנויות.</p>
        </div>
      </header>

      <TerminalSection title="סקירה" subtitle="מדדים מהנתונים הקיימים">
        <MetricGrid>
          <Metric label="שכונות" value={String(neighborhoods.length)} accent />
          <Metric label="סך מודעות" value={String(totalListings)} />
          <Metric label="ללא מתווך" value={String(totalPrivate)} />
        </MetricGrid>
      </TerminalSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <TerminalSection title="הפעילות הגבוהה ביותר" subtitle="לפי נפח מודעות">
          {byActivity.length ? (
            <div className="flex flex-col">{byActivity.map((n, i) => (
              <div key={n.id} className="border-line/60 flex items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
                <span className="text-ink min-w-0 truncate font-bold">{i + 1}. <NeighborhoodLink city={n.city} neighborhood={n.neighborhood} /><span className="text-muted font-normal"> · {n.city}</span></span>
                <span className="text-brand-strong shrink-0 tabular-nums font-black">{n.listings}</span>
              </div>
            ))}</div>
          ) : <TerminalEmpty text="אין נתוני שכונות עדיין." />}
        </TerminalSection>
        <TerminalSection title="מדד הזדמנות" subtitle="מודעות ללא מתווך (אוף-מרקט)">
          {byOpportunity.length ? (
            <div className="flex flex-col">{byOpportunity.map((n, i) => (
              <div key={n.id} className="border-line/60 flex items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
                <span className="text-ink min-w-0 truncate font-bold">{i + 1}. <NeighborhoodLink city={n.city} neighborhood={n.neighborhood} /><span className="text-muted font-normal"> · {n.city}</span></span>
                <span className="text-brand-strong shrink-0 tabular-nums font-black">{n.privateListings}</span>
              </div>
            ))}</div>
          ) : <TerminalEmpty text="אין הזדמנויות אוף-מרקט עדיין." />}
        </TerminalSection>
      </div>

      <p className="text-muted text-[11px]">לחיצה על שכונה פותחת את פרופיל המודיעין המלא — משרד מוביל, קליטת שוק ותחרות.</p>
    </div>
  );
}
