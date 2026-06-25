"use client";
// ZONO — Office Intelligence "מודיעין מתחרים" widget. Reads PUBLIC market data
// via the competitor engine; shares are labeled estimates.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Radar, ArrowLeft } from "lucide-react";
import { getCompetitorWidgetAction } from "@/lib/competitor-intelligence/actions";

type Widget = Awaited<ReturnType<typeof import("@/lib/competitor-intelligence/engine").getCompetitorOfficeWidget>>;

export function OfficeCompetitorWidget() {
  const [data, setData] = useState<Widget | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getCompetitorWidgetAction();
      if (alive) { setData(res.ok ? res.data : null); setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-black text-ink"><Radar size={16} className="text-brand-strong" /> מודיעין מתחרים</h2>
        <Link href="/competitor-intelligence" className="inline-flex items-center gap-0.5 text-[12px] font-bold text-brand-strong hover:underline">לרדאר המלא <ArrowLeft size={13} /></Link>
      </div>
      {loading ? (
        <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/40">טוען נתוני מתחרים…</p>
      ) : !data || data.topCompetitors.length === 0 ? (
        <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">אין עדיין נתוני מתחרים — הרץ סריקת Property Radar באזורי הפעילות.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-[11px] font-black text-ink/50">המתחרים הפעילים</p>
            <ul className="flex flex-col gap-1">
              {data.topCompetitors.map((c) => (
                <li key={c.name} className="flex items-center justify-between text-[12px]">
                  <span className="truncate font-bold text-ink">{c.name}</span>
                  <span className="text-ink/50">{c.activeListings} · {c.estimatedSharePercent}%</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[9px] text-ink/35">{data.shareNote}</p>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-black text-ink/50">אזורים שמתחרים צוברים בהם</p>
            {data.gainingAreas.length === 0 ? <p className="text-[11px] text-ink/35">—</p> : (
              <ul className="flex flex-col gap-1">
                {data.gainingAreas.map((a, i) => (
                  <li key={i} className="flex items-center justify-between text-[12px]"><span className="font-bold text-ink">{a.area}</span><span className="text-emerald-600">+{a.newListings}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 text-[11px] font-black text-ink/50">גלי ירידות מחיר</p>
            {data.priceDropWaves.length === 0 ? <p className="text-[11px] text-ink/35">—</p> : (
              <ul className="flex flex-col gap-1">
                {data.priceDropWaves.map((w, i) => (
                  <li key={i} className="flex items-center justify-between text-[12px]"><span className="truncate font-bold text-ink">{w.competitorName ?? "—"} · {w.area}</span><span className="text-amber-600">{w.count}</span></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
