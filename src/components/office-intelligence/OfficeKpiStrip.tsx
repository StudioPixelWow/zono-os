"use client";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { KpiCard } from "@/lib/office-intelligence/types";

function fmtVal(c: KpiCard): string {
  if (c.format === "currency") return `₪${Math.round(c.value).toLocaleString("he-IL")}`;
  if (c.format === "percent") return `${Math.round(c.value)}%`;
  return c.value.toLocaleString("he-IL");
}

function Delta({ v }: { v: number | null }) {
  if (v == null) return <span className="text-[10px] font-bold text-ink/30">—</span>;
  const up = v >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${up ? "text-emerald-600" : "text-red-500"}`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{Math.abs(v)}%
    </span>
  );
}

export function OfficeKpiStrip({ cards, onSelect }: { cards: KpiCard[]; onSelect?: (key: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <button key={c.key} onClick={() => onSelect?.(c.key)} className="flex flex-col items-start rounded-2xl border border-black/5 bg-white p-2.5 text-right transition hover:scale-[1.02]">
          <span className="text-[10px] font-bold text-ink/55">{c.label}</span>
          <span className="text-lg font-black text-brand-strong">{fmtVal(c)}</span>
          <div className="mt-0.5 flex items-center gap-1.5">
            <Delta v={c.changeVsYesterday} />
            <span className="text-[9px] text-ink/30">מול אתמול</span>
          </div>
        </button>
      ))}
    </div>
  );
}
