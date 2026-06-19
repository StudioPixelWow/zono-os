"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { recalcMarketHeatmapAction } from "@/lib/market/actions";
import type { MarketHeatmapCell } from "@/lib/market/service";

const toneClass: Record<string, string> = {
  green: "bg-success-soft text-success",
  gold: "bg-warning-soft text-warning",
  red: "bg-danger-soft text-danger",
  purple: "bg-brand-soft text-brand-strong",
  blue: "bg-indigo-50 text-indigo-600",
};
const scoreTone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");

export function MarketHeatmapView({ cells }: { cells: MarketHeatmapCell[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const recalc = () => {
    setMsg(null); setError(null);
    start(async () => {
      const r = await recalcMarketHeatmapAction();
      if (r.error) setError(r.error);
      else { setMsg(`חושבו ${r.snapshots ?? 0} אזורים`); router.refresh(); }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Market Intelligence</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מפת ביקוש ומחירים</h1>
          <p className="text-muted mt-1 text-sm">ביקוש, היצע והזדמנויות לכל אזור פעילות — מנתוני המודעות, הקונים והנכסים שלך.</p>
        </div>
        <Button onClick={recalc} disabled={pending} leadingIcon={<Icon name="Map" size={16} />}>
          {pending ? "מחשב…" : "חשב מפת ביקוש מחדש"}
        </Button>
      </div>

      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

      {cells.length === 0 ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Map" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין נתוני מפת ביקוש</p>
          <p className="text-muted max-w-sm text-sm">לחץ ״חשב מפת ביקוש מחדש״ כדי לבנות תמונת שוק עדכנית לכל אזורי הפעילות.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cells.map((c) => (
            <div key={c.localityName} className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-ink text-base font-extrabold">{c.localityName}</h3>
                  <span className={cn("mt-1 inline-block rounded-lg px-2 py-0.5 text-[11px] font-bold", toneClass[c.tone] ?? toneClass.blue)}>{c.heatLabel}</span>
                </div>
                <div className="text-end"><p className="text-muted text-[11px] font-bold">הזדמנות</p><p className={cn("text-2xl font-black", scoreTone(c.opportunity))}>{c.opportunity}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Tile label="ביקוש" value={c.demand} />
                <Tile label="היצע" value={c.supply} />
                <Field label="מחיר ממוצע/מ״ר" value={c.avgPricePerSqm ? `${c.avgPricePerSqm.toLocaleString("he-IL")} ₪` : "—"} />
                <Field label="מחיר ממוצע" value={c.avgPrice ? formatShekels(c.avgPrice) : "—"} />
                <Field label="מודעות חיצוניות" value={c.externalListings} />
                <Field label="נכסים פנימיים" value={c.internalProperties} />
                <Field label="ירידות מחיר" value={c.priceDrops} />
                <Field label="מתחת לממוצע" value={c.belowAverage} />
                <Field label="קונים פעילים" value={c.activeBuyers} />
                <Field label="קונים תואמים" value={c.matchedBuyers} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface rounded-xl p-2.5">
      <p className="text-muted text-[11px] font-bold">{label}</p>
      <p className={cn("text-xl font-black", scoreTone(value))}>{value}</p>
    </div>
  );
}
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-xl p-2.5">
      <p className="text-muted text-[11px] font-bold">{label}</p>
      <p className="text-ink text-sm font-bold">{value}</p>
    </div>
  );
}
