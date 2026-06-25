"use client";
import { Flame } from "lucide-react";
import type { AreaTrend } from "@/lib/competitor-intelligence/types";

const TREND: Record<string, { t: string; c: string }> = { up: { t: "מתחמם", c: "bg-red-100 text-red-700" }, down: { t: "מתקרר", c: "bg-sky-100 text-sky-700" }, stable: { t: "יציב", c: "bg-black/5 text-ink/55" } };

export function CompetitorTrendPanel({ areaTrends }: { areaTrends: AreaTrend[] }) {
  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><Flame size={16} className="text-amber-500" /> אזורים מתחממים</h2>
      {areaTrends.length === 0 ? (
        <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">אין עדיין מספיק נתוני שוק לזיהוי מגמות.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {areaTrends.slice(0, 10).map((a, i) => (
            <li key={i} className="rounded-2xl border border-black/5 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-black text-ink">{a.neighborhood ?? a.city ?? "—"}{a.neighborhood && a.city ? <span className="ms-1 text-[10px] font-medium text-ink/40">{a.city}</span> : null}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TREND[a.trend].c}`}>{TREND[a.trend].t}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/5">
                <div className="h-full rounded-full bg-gradient-to-l from-amber-400 to-red-500" style={{ width: `${a.heatScore}%` }} />
              </div>
              <p className="mt-1 text-[10px] font-bold text-ink/45">{a.newListings} חדשות · {a.priceDrops} ירידות · {a.competitorsActive} מתחרים · חום {a.heatScore}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
