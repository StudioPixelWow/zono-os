"use client";
// ============================================================================
// ZONO — Universal "למה?" explainability control (Phase 25.3).
// A small, ZONO-styled toggle that reveals the reasons / evidence / data source
// behind any score. Reusable across Market, Territory, Property, Buyer-match,
// Seller, and future AI recommendations. No black box — reasons in, reasons out.
// ============================================================================
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import type { ScoreReason, ReasonImpact } from "@/lib/explainability/types";

const impactDot: Record<ReasonImpact, string> = {
  positive: "bg-success",
  negative: "bg-danger",
  neutral: "bg-muted",
};

export interface WhyButtonProps {
  /** Typed reasons, or plain strings (treated as neutral). */
  reasons: ScoreReason[] | string[];
  /** Optional default data-source line shown at the bottom. */
  source?: string;
  className?: string;
  label?: string;
}

function toReasons(reasons: ScoreReason[] | string[]): ScoreReason[] {
  return (reasons as Array<ScoreReason | string>).map((r) =>
    typeof r === "string" ? { label: r, impact: "neutral" as ReasonImpact } : r,
  );
}

export function WhyButton({ reasons, source, className, label = "למה?" }: WhyButtonProps) {
  const [open, setOpen] = useState(false);
  const items = toReasons(reasons);
  if (items.length === 0) return null;

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-brand-strong hover:text-brand inline-flex items-center gap-1 text-xs font-bold transition"
      >
        <Icon name="Sparkles" size={13} />
        {label}
      </button>
      {open && (
        <div className="border-line bg-card absolute z-20 mt-1 w-72 rounded-2xl border p-3 text-right shadow-[var(--shadow-lift)]" dir="rtl">
          <p className="text-ink mb-2 text-xs font-black">הסבר הציון</p>
          <ul className="flex flex-col gap-1.5">
            {items.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", impactDot[r.impact])} />
                <span className="min-w-0">
                  <span className="text-ink block text-xs font-semibold leading-snug">{r.label}</span>
                  {r.evidence && <span className="text-muted block text-[11px]">{r.evidence}</span>}
                  {r.source && <span className="text-muted block text-[10px]">מקור: {r.source}</span>}
                </span>
              </li>
            ))}
          </ul>
          {source && <p className="text-muted border-line mt-2 border-t pt-2 text-[10px]">מקור הנתונים: {source}</p>}
        </div>
      )}
    </div>
  );
}
