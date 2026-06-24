"use client";

import Link from "next/link";
import { heatNeighborhoods, heatmapInsight } from "@/data/mock";
import type { HeatNeighborhood, Tone } from "@/types/dashboard";
import { cn } from "@/lib/utils";
import { Icon } from "../Icon";
import { SectionShell } from "../SectionShell";
import { ZonoOrb } from "../FloatingAssistant";
import { WhyButton } from "@/components/explainability/WhyButton";

// Phase 24.2 — this was a fake SVG "heatmap": real locality demand data was
// painted onto hardcoded polygon slots (fake geography). Per the no-fake-map
// rule, the map is removed and replaced with a real, honest MARKET INTELLIGENCE
// PANEL (ranked locality demand) until polygon/point geo infrastructure exists
// (see REAL_GEO_DATA_AUDIT roadmap 25.3/25.5). No coordinates are simulated.

const dot: Record<Tone, string> = {
  green: "bg-success",
  gold: "bg-warning",
  red: "bg-danger",
  purple: "bg-brand",
  blue: "bg-indigo-500",
};
const changeColor: Record<Tone, string> = {
  green: "text-success",
  gold: "text-warning",
  red: "text-danger",
  purple: "text-brand-strong",
  blue: "text-indigo-500",
};
const legend = [
  { tone: "green" as Tone, label: "ביקוש גבוה" },
  { tone: "gold" as Tone, label: "יציב" },
  { tone: "red" as Tone, label: "ירידה" },
  { tone: "purple" as Tone, label: "הזדמנות" },
];

export function HeatmapSection({ neighborhoods = heatNeighborhoods, insight = heatmapInsight }: { neighborhoods?: HeatNeighborhood[]; insight?: string } = {}) {
  const hasData = neighborhoods.length > 0;
  // Highest real opportunity score first (falls back to demand-delta).
  const ranked = [...neighborhoods].sort((a, b) => (b.score ?? b.changePct) - (a.score ?? a.changePct));

  return (
    <SectionShell title="מודיעין ביקוש שכונתי" eyebrow="מודיעין שוק">
      {!hasData ? (
        <div className="bg-card border-line grid min-h-[220px] place-items-center rounded-[24px] border p-6 text-center shadow-[var(--shadow-card)]">
          <div>
            <p className="text-ink text-sm font-extrabold">אין עדיין נתוני ביקוש שכונתי</p>
            <p className="text-muted mx-auto mt-1 max-w-xs text-xs">חשב מפת ביקוש במסך מפת השוק כדי לבנות את המודיעין מנתוני המודעות, הקונים והנכסים שלך.</p>
            <Link href="/market" className="text-brand-strong mt-3 inline-block text-sm font-bold">למסך מפת השוק ←</Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Ranked locality demand — real data, no map */}
          <div className="bg-card border-line flex flex-col gap-2 rounded-[24px] border p-4 shadow-[var(--shadow-card)]">
            {ranked.map((n) => (
              <div key={n.id} className="bg-surface border-line flex flex-col gap-1.5 rounded-2xl border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dot[n.tone])} />
                    <span className="text-ink truncate text-sm font-bold">{n.name}</span>
                    {n.label && <span className="text-muted truncate text-xs">· {n.label}</span>}
                  </span>
                  {/* Real opportunity score (0–100), explainable — not a decorative %. */}
                  <span className="flex shrink-0 items-center gap-2">
                    {n.reasons && n.reasons.length > 0 && (
                      <WhyButton reasons={n.reasons} source="נתוני שוק אמיתיים (קונים · מודעות · עסקאות · היסטוריה)" />
                    )}
                    <span className={cn("text-sm font-black", changeColor[n.tone])}>
                      {n.score != null ? `${n.score}/100` : `${n.changePct > 0 ? "+" : ""}${n.changePct}%`}
                    </span>
                  </span>
                </div>
              </div>
            ))}
            {insight && (
              <div className="bg-brand-soft/80 mt-2 flex items-center gap-2.5 rounded-2xl p-3">
                <ZonoOrb size={32} />
                <p className="text-brand-strong text-xs font-bold leading-snug">{insight}</p>
              </div>
            )}
          </div>

          {/* Context card (legend + link). No filters that imply a map. */}
          <div className="bg-card border-line flex flex-col gap-4 rounded-[24px] border p-5 shadow-[var(--shadow-card)]">
            <p className="text-ink font-extrabold">רמות ביקוש</p>
            <div className="grid grid-cols-1 gap-2">
              {legend.map((l) => (
                <span key={l.label} className="text-ink flex items-center gap-1.5 text-xs font-semibold">
                  <span className={cn("h-2.5 w-2.5 rounded-full", dot[l.tone])} />
                  {l.label}
                </span>
              ))}
            </div>
            <Link href="/market" className="bg-brand hover:bg-brand-strong mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition">
              <Icon name="Map" size={16} />
              למסך מפת השוק
            </Link>
            <p className="text-muted text-[11px]">מפה גאוגרפית מלאה תתווסף עם תשתית הגבולות (פוליגונים).</p>
          </div>
        </div>
      )}
    </SectionShell>
  );
}
