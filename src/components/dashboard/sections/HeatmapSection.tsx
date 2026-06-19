"use client";

import { heatNeighborhoods, heatmapInsight } from "@/data/mock";
import type { HeatNeighborhood, Tone } from "@/types/dashboard";
import { cn } from "@/lib/utils";
import { Icon } from "../Icon";
import { SectionShell } from "../SectionShell";
import { ZonoOrb } from "../FloatingAssistant";

const fill: Record<Tone, string> = {
  green: "#bbf7d0",
  gold: "#fde9b8",
  red: "#fecaca",
  purple: "#ddd0fb",
  blue: "#c7d2fe",
};
const stroke: Record<Tone, string> = {
  green: "#22c55e",
  gold: "#f5c451",
  red: "#ef4444",
  purple: "#7c3aed",
  blue: "#6366f1",
};
const dot: Record<Tone, string> = {
  green: "bg-success",
  gold: "bg-warning",
  red: "bg-danger",
  purple: "bg-brand",
  blue: "bg-indigo-500",
};

const legend = [
  { tone: "green" as Tone, label: "ביקוש גבוה" },
  { tone: "gold" as Tone, label: "יציב" },
  { tone: "red" as Tone, label: "ירידה" },
  { tone: "purple" as Tone, label: "הזדמנות" },
];

export function HeatmapSection({ neighborhoods = heatNeighborhoods, insight = heatmapInsight }: { neighborhoods?: HeatNeighborhood[]; insight?: string } = {}) {
  const hasData = neighborhoods.length > 0;
  return (
    <SectionShell title="מפת הביקוש בעיר" eyebrow="מודיעין שכונות">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Filter card */}
        <div className="bg-card border-line flex flex-col gap-4 rounded-[24px] border p-5 shadow-[var(--shadow-card)]">
          <p className="text-ink font-extrabold">סינון מפה</p>

          {[
            { label: "סוג נכס", value: "כל הסוגים" },
            { label: "טווח מחיר", value: "עד ₪7M" },
            { label: "תקופה", value: "12 חודשים" },
          ].map((f) => (
            <label key={f.label} className="block">
              <span className="text-muted text-xs font-semibold">{f.label}</span>
              <div className="bg-surface border-line text-ink mt-1 flex h-10 items-center justify-between rounded-xl border px-3 text-sm font-semibold">
                {f.value}
                <Icon name="ChevronLeft" size={16} className="text-muted -rotate-90" />
              </div>
            </label>
          ))}

          <button className="bg-brand hover:bg-brand-strong mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition">
            <Icon name="Map" size={16} />
            עדכן מפה
          </button>

          <div className="border-line mt-1 grid grid-cols-2 gap-2 border-t pt-4">
            {legend.map((l) => (
              <span key={l.label} className="text-ink flex items-center gap-1.5 text-xs font-semibold">
                <span className={cn("h-2.5 w-2.5 rounded-full", dot[l.tone])} />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {/* Heatmap */}
        <div className="bg-card border-line relative overflow-hidden rounded-[24px] border p-4 shadow-[var(--shadow-card)]">
          {!hasData ? (
            <div className="grid min-h-[300px] place-items-center text-center">
              <div>
                <p className="text-ink text-sm font-extrabold">אין עדיין נתוני מפת ביקוש</p>
                <p className="text-muted mt-1 max-w-xs text-xs">לחץ ״חשב מפת ביקוש מחדש״ במסך מפת השוק כדי לבנות את המפה מנתוני המודעות, הקונים והנכסים שלך.</p>
              </div>
            </div>
          ) : (
          <svg viewBox="0 0 560 340" className="h-full min-h-[300px] w-full">
            {neighborhoods.map((n) => (
              <g key={n.id}>
                <polygon
                  points={n.points}
                  fill={fill[n.tone]}
                  stroke={stroke[n.tone]}
                  strokeWidth={2}
                  opacity={0.92}
                />
                <text
                  x={n.labelX}
                  y={n.labelY - 6}
                  textAnchor="middle"
                  className="fill-ink"
                  style={{ fontSize: 13, fontWeight: 800 }}
                >
                  {n.name}
                </text>
                <text
                  x={n.labelX}
                  y={n.labelY + 12}
                  textAnchor="middle"
                  fill={stroke[n.tone]}
                  style={{ fontSize: 12, fontWeight: 800 }}
                >
                  {n.changePct > 0 ? "+" : ""}
                  {n.changePct}%
                </text>
              </g>
            ))}
          </svg>
          )}

          {/* AI insight */}
          {hasData && (
            <div className="bg-brand-soft/80 absolute inset-x-4 bottom-4 flex items-center gap-2.5 rounded-2xl p-3 backdrop-blur">
              <ZonoOrb size={32} />
              <p className="text-brand-strong text-xs font-bold leading-snug">
                {insight}
              </p>
            </div>
          )}
        </div>
      </div>
    </SectionShell>
  );
}
