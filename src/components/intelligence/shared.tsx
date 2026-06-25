"use client";
// ============================================================================
// ZONO — shared premium intelligence UI (Phase 19.5). Reusable, RTL, consuming
// the analytics-core DTOs. ADDITIVE: new code adopts these to reduce duplication
// (KPI tiles, badges, empty/loading states). Existing module UIs keep working.
// ============================================================================
import { TrendingUp, TrendingDown, Minus, Inbox, Loader2 } from "lucide-react";
import { formatKpi } from "@/lib/analytics-core/currency";
import { SEVERITY_LABELS, CONFIDENCE_LABELS, scoreBand, BAND_LABELS } from "@/lib/analytics-core/scoring";
import type { KpiCardDTO, Severity, Confidence } from "@/lib/analytics-core/types";

// ── Trend direction icon ─────────────────────────────────────────────────────
export function TrendIcon({ direction, size = 11 }: { direction: string; size?: number }) {
  if (direction === "up") return <TrendingUp size={size} className="text-emerald-600" />;
  if (direction === "down") return <TrendingDown size={size} className="text-red-500" />;
  return <Minus size={size} className="text-ink/30" />;
}

// ── KPI card (canonical) ─────────────────────────────────────────────────────
export function IntelligenceKpiCard({ kpi, onClick }: { kpi: KpiCardDTO; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`flex flex-col items-start rounded-2xl border border-black/5 bg-white p-2.5 text-right ${onClick ? "transition hover:scale-[1.02]" : ""}`}>
      <span className="text-[10px] font-bold text-ink/55">{kpi.label}</span>
      <span className="text-lg font-black text-brand-strong">{formatKpi(kpi.value, kpi.format)}</span>
      <div className="mt-0.5 flex items-center gap-1.5">
        {kpi.changePercent != null ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-ink/45"><TrendIcon direction={kpi.direction} /> {Math.abs(kpi.changePercent)}%</span>
        ) : <span className="text-[10px] font-bold text-ink/25">—</span>}
        {kpi.sub && <span className="text-[9px] text-ink/35">{kpi.sub}</span>}
      </div>
    </Tag>
  );
}

export function ExecutiveKpiStrip({ kpis, onSelect }: { kpis: KpiCardDTO[]; onSelect?: (key: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {kpis.map((k) => <IntelligenceKpiCard key={k.key} kpi={k} onClick={onSelect ? () => onSelect(k.key) : undefined} />)}
    </div>
  );
}

// ── Badges ───────────────────────────────────────────────────────────────────
const SEV_TONE: Record<Severity, string> = {
  urgent: "bg-red-100 text-red-700", high: "bg-amber-100 text-amber-700", medium: "bg-sky-100 text-sky-700", low: "bg-black/5 text-ink/55",
};
export function RiskBadge({ severity, label }: { severity: Severity; label?: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${SEV_TONE[severity]}`}>{label ?? SEVERITY_LABELS[severity]}</span>;
}

export function ScoreBadge({ score }: { score: number }) {
  const band = scoreBand(score);
  const tone = band === "excellent" ? "bg-emerald-100 text-emerald-700" : band === "good" ? "bg-sky-100 text-sky-700" : band === "fair" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${tone}`}>{score} · {BAND_LABELS[band]}</span>;
}

const CONF_TONE: Record<Confidence, string> = { high: "bg-emerald-50 text-emerald-700", medium: "bg-amber-50 text-amber-700", low: "bg-black/5 text-ink/50" };
export function ConfidenceBadge({ confidence, percent }: { confidence: Confidence; percent?: number }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${CONF_TONE[confidence]}`}>{percent != null ? `${percent}% · ` : ""}{CONFIDENCE_LABELS[confidence]}</span>;
}

export function DataQualityBadge({ score }: { score: number }) {
  const tone = score >= 85 ? "bg-emerald-50 text-emerald-700" : score >= 60 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>איכות דאטה {score}%</span>;
}

export function ProviderHealthBadge({ healthy, label }: { healthy: boolean; label?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${healthy ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${healthy ? "bg-emerald-500" : "bg-red-500"}`} />{label ?? (healthy ? "ספק תקין" : "ספק ירוד")}
  </span>;
}

// ── Empty + loading states ────────────────────────────────────────────────────
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl bg-black/5 px-3 py-6 text-center">
      <Inbox size={20} className="text-ink/30" />
      <p className="text-sm font-bold text-ink/55">{title}</p>
      {hint && <p className="text-[11px] text-ink/40">{hint}</p>}
    </div>
  );
}

export function LoadingState({ label = "טוען…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl bg-black/[0.03] px-3 py-6 text-sm font-bold text-brand-strong">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  );
}
