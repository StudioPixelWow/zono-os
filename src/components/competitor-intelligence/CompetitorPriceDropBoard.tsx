"use client";
import { TrendingDown } from "lucide-react";
import type { CompetitorPriceDropItem } from "@/lib/competitor-intelligence/types";

export function CompetitorPriceDropBoard({ priceDrops }: { priceDrops: CompetitorPriceDropItem[] }) {
  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><TrendingDown size={16} className="text-amber-500" /> ירידות מחיר של מתחרים</h2>
      {priceDrops.length === 0 ? (
        <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">לא זוהו ירידות מחיר של מתחרים בשבוע האחרון.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {priceDrops.map((p, i) => (
            <article key={i} className="rounded-2xl border border-black/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-black text-ink">{p.neighborhood ?? p.city ?? "מודעה"}</p>
                {p.belowAreaAverage && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">מתחת לממוצע</span>}
              </div>
              {p.competitorName && <p className="mt-0.5 text-[11px] font-bold text-ink/55">משויך כנראה ל: {p.competitorName}{p.competitorConfidence != null ? ` · ${p.competitorConfidence}%` : ""}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
                {p.price != null && <span className="font-black text-brand-strong">₪{Math.round(p.price).toLocaleString("he-IL")}</span>}
                {p.priceDeltaPercent != null && <span className="font-bold text-amber-600">{p.priceDeltaPercent}%</span>}
                {p.priceDelta != null && <span className="text-ink/50">₪{Math.round(p.priceDelta).toLocaleString("he-IL")}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
