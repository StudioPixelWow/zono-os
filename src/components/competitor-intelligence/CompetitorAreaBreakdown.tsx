"use client";
import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import type { CompetitorAnalytics } from "@/lib/competitor-intelligence/types";

function Mix({ title, rows }: { title: string; rows: { key: string; count: number; percent: number }[] }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-black text-ink/50">{title}</p>
      {rows.length === 0 ? <p className="text-[11px] text-ink/35">—</p> : (
        <ul className="flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.key} className="text-[12px]">
              <div className="flex items-center justify-between"><span className="font-bold text-ink">{r.key}</span><span className="text-ink/45">{r.count} · {r.percent}%</span></div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-brand-strong" style={{ width: `${r.percent}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CompetitorAreaBreakdown({ competitors }: { competitors: CompetitorAnalytics[] }) {
  const [sel, setSel] = useState(0);
  if (competitors.length === 0) {
    return (
      <section className="rounded-[20px] border border-black/5 bg-white p-4">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><LayoutGrid size={16} /> פילוח לפי שכונה, סוג ומחיר</h2>
        <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">אין נתוני מתחרים לפילוח כעת.</p>
      </section>
    );
  }
  const c = competitors[Math.min(sel, competitors.length - 1)]!;
  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><LayoutGrid size={16} /> פילוח לפי שכונה, סוג ומחיר</h2>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {competitors.slice(0, 8).map((x, i) => (
          <button key={x.competitorProfileId} onClick={() => setSel(i)} className={`rounded-full px-3 py-1 text-[12px] font-bold transition ${i === Math.min(sel, competitors.length - 1) ? "bg-brand-strong text-white" : "bg-black/5 text-ink/60 hover:bg-black/10"}`}>{x.competitorName}</button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Mix title="שכונות חזקות" rows={c.strongestNeighborhoods.map((n) => ({ key: n.area, count: n.count, percent: Math.round((n.count / Math.max(1, c.activeListings)) * 100) }))} />
        <Mix title="תמהיל סוגי נכס" rows={c.propertyTypeMix} />
        <Mix title="תמהיל מחירים" rows={c.priceSegmentMix} />
      </div>
    </section>
  );
}
