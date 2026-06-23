"use client";

// Shared formatting + small presentational helpers for the dashboard-home
// components. Kept in one place so every card renders consistently.
import type { ReactNode } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import type { SignalTone, AttentionTone } from "@/lib/dashboard-home/types";

export type Translate = (k: string) => string;

export const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
export const ilsC = (n: number) =>
  n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `₪${Math.round(n / 1000)}K` : ils(n);

export const TONE_BG: Record<SignalTone, string> = {
  positive: "bg-success", negative: "bg-danger", opportunity: "bg-warning", agent: "bg-brand", neutral: "bg-muted",
};
export const TONE_SOFT: Record<SignalTone, string> = {
  positive: "bg-success-soft text-success", negative: "bg-danger-soft text-danger",
  opportunity: "bg-warning-soft text-warning", agent: "bg-brand-soft text-brand-strong", neutral: "bg-line/70 text-ink",
};
export const ATTENTION_SOFT: Record<AttentionTone, string> = {
  danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success", brand: "bg-brand-soft text-brand-strong",
};
export const ATTENTION_DOT: Record<AttentionTone, string> = {
  danger: "bg-danger", warning: "bg-warning", success: "bg-success", brand: "bg-brand",
};

export function SectionHead({ n, title, action }: { n?: number; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-ink text-lg font-black sm:text-xl">{title}</h2>
        {n != null && <span className="bg-brand-soft text-brand-strong grid h-6 w-6 place-items-center rounded-full text-xs font-black">{n}</span>}
      </div>
      {action}
    </div>
  );
}

export function Delta({ pct, trend }: { pct: number; trend: "up" | "down" | "flat" }) {
  const up = trend === "up";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-bold", up ? "text-success" : trend === "down" ? "text-danger" : "text-muted")}>
      <Icon name={up ? "TrendingUp" : trend === "down" ? "TrendingDown" : "Minus"} size={13} />{pct > 0 ? "+" : ""}{pct}%
    </span>
  );
}

export function Sparkline({ points, tone = "brand", className }: { points: number[]; tone?: "brand" | "success" | "danger"; className?: string }) {
  const w = 120, h = 36;
  const stroke = tone === "success" ? "var(--color-success)" : tone === "danger" ? "var(--color-danger)" : "var(--color-brand)";
  const d = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - p * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-9 w-full", className)} preserveAspectRatio="none" aria-hidden>
      <polyline points={d} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
