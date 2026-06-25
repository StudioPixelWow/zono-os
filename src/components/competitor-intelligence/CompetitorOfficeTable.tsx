"use client";
import { useState } from "react";
import type { CompetitorAnalytics } from "@/lib/competitor-intelligence/types";
import { confidenceLabel } from "@/lib/competitor-intelligence/classifier";

const TREND: Record<string, { t: string; c: string }> = { up: { t: "▲ עולה", c: "text-emerald-600" }, down: { t: "▼ יורד", c: "text-red-500" }, stable: { t: "— יציב", c: "text-ink/40" } };

function ConfBadge({ confidence }: { confidence: number }) {
  const tone = confidence >= 90 ? "bg-emerald-50 text-emerald-700" : confidence >= 80 ? "bg-sky-50 text-sky-700" : confidence >= 55 ? "bg-amber-50 text-amber-700" : "bg-black/5 text-ink/50";
  return <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tone}`}>{confidence}% · {confidenceLabel(confidence)}</span>;
}

export function CompetitorOfficeTable({ competitors }: { competitors: CompetitorAnalytics[] }) {
  const [q, setQ] = useState("");
  const rows = competitors.filter((c) => !q || c.competitorName.includes(q));
  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-black text-ink">משרדים מתחרים</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש משרד…" className="w-40 rounded-lg border border-black/10 px-2 py-1 text-xs font-semibold" />
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">לא זוהו מתחרים מנתוני המודעות הציבוריים באזורי הפעילות.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[12px]">
            <thead>
              <tr className="text-ink/55">
                <th className="px-2 py-1 font-bold">משרד</th>
                <th className="px-2 py-1 font-bold">פעילות</th>
                <th className="px-2 py-1 font-bold">חדשות שבוע</th>
                <th className="px-2 py-1 font-bold">ירידות</th>
                <th className="px-2 py-1 font-bold">נתח מוערך</th>
                <th className="px-2 py-1 font-bold">מגמה</th>
                <th className="px-2 py-1 font-bold">אזור חזק</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.competitorProfileId} className="border-t border-black/5 align-top">
                  <td className="px-2 py-1.5">
                    <div className="font-bold text-ink">{c.competitorName}</div>
                    <ConfBadge confidence={c.confidence} />
                  </td>
                  <td className="px-2 py-1.5 font-black text-brand-strong">{c.activeListings}</td>
                  <td className="px-2 py-1.5">{c.newListingsThisWeek}</td>
                  <td className={`px-2 py-1.5 ${c.priceDrops > 0 ? "font-bold text-amber-600" : ""}`}>{c.priceDrops}</td>
                  <td className="px-2 py-1.5">{c.estimatedSharePercent}% <span className="text-[9px] text-ink/35">הערכה</span></td>
                  <td className={`px-2 py-1.5 font-bold ${TREND[c.trendVsLastWeek].c}`}>{TREND[c.trendVsLastWeek].t}</td>
                  <td className="px-2 py-1.5 text-ink/60">{c.strongestNeighborhoods[0]?.area ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
