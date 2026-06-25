"use client";
import { Swords } from "lucide-react";
import { SHARE_LABEL } from "@/lib/competitor-intelligence/market-share";
import type { OfficeVsMarketRow } from "@/lib/competitor-intelligence/types";

const POS: Record<string, { t: string; c: string }> = {
  leading: { t: "מוביל", c: "bg-emerald-100 text-emerald-700" },
  competitive: { t: "תחרותי", c: "bg-sky-100 text-sky-700" },
  trailing: { t: "מפגר", c: "bg-amber-100 text-amber-700" },
};

export function CompetitorComparisonPanel({ comparison }: { comparison: OfficeVsMarketRow[] }) {
  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-black text-ink"><Swords size={16} className="text-brand-strong" /> המשרד שלי מול השוק</h2>
      <p className="mb-2 text-[10px] font-medium text-ink/40">{SHARE_LABEL}</p>
      {comparison.length === 0 ? (
        <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">אין עדיין נתוני השוואה — נדרשים נכסים פעילים שלך ומודעות שוק באותו אזור.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[12px]">
            <thead>
              <tr className="text-ink/55">
                <th className="px-2 py-1 font-bold">עיר</th>
                <th className="px-2 py-1 font-bold">הנכסים שלי</th>
                <th className="px-2 py-1 font-bold">מתחרים</th>
                <th className="px-2 py-1 font-bold">נתח שלי</th>
                <th className="px-2 py-1 font-bold">מתחרה מוביל</th>
                <th className="px-2 py-1 font-bold">מיצוב</th>
              </tr>
            </thead>
            <tbody>
              {comparison.slice(0, 15).map((r) => (
                <tr key={r.area} className="border-t border-black/5">
                  <td className="px-2 py-1.5 font-bold text-ink">{r.area}</td>
                  <td className="px-2 py-1.5 font-black text-brand-strong">{r.ourActiveListings}</td>
                  <td className="px-2 py-1.5">{r.competitorActiveListings}</td>
                  <td className="px-2 py-1.5">{r.ourSharePercent}% <span className="text-[9px] text-ink/35">הערכה</span></td>
                  <td className="px-2 py-1.5 text-ink/60">{r.topCompetitorName ?? "—"}{r.topCompetitorName ? ` (${r.topCompetitorSharePercent}%)` : ""}</td>
                  <td className="px-2 py-1.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${POS[r.position].c}`}>{POS[r.position].t}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
