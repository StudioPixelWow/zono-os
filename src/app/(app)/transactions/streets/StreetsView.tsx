"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import type { Database } from "@/lib/supabase/types";

type StreetRow = Database["public"]["Tables"]["street_intelligence"]["Row"];
const fmtNum = (n: number | null) => (n == null ? "—" : n.toLocaleString("he-IL"));
const trend = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n}%`);
const trendTone = (n: number | null) => (n == null ? "text-muted" : n > 0 ? "text-success" : n < 0 ? "text-danger" : "text-muted");
const score = (n: number | null) => (n == null ? "text-muted" : n >= 65 ? "text-success" : n >= 40 ? "text-brand-strong" : "text-muted");

export function StreetsView({ streets }: { streets: StreetRow[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Transactions · Streets</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מודיעין רחובות</h1>
          <p className="text-muted mt-1 text-sm">ניתוח רחובות לפי עסקאות אמת — מחירים, מגמות, נזילות וציון רחוב. מתעדכן בכל סנכרון עסקאות.</p>
        </div>
        <Link href="/transactions" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />עסקאות</Link>
      </div>

      {streets.length === 0 ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Route" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין מודיעין רחובות</p>
          <p className="text-muted max-w-sm text-sm">סנכרן עסקאות בעמוד ״עסקאות בעיר שלי״ — מודיעין הרחובות ייבנה אוטומטית מהעסקאות.</p>
        </div>
      ) : (
        <div className="bg-card border-line overflow-hidden rounded-[20px] border">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-surface text-muted text-[11px] font-bold">
                <tr>{["רחוב", "עיר", "עסקאות", "חציון ₪/מ״ר", "מגמה 6ח׳", "מגמה 12ח׳", "מגמה 24ח׳", "נזילות", "ציון רחוב", "ביטחון"].map((h) => <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {streets.map((s) => (
                  <tr key={s.id} className="border-line hover:bg-surface/60 border-t">
                    <td className="text-ink px-3 py-2 font-semibold">{s.street}</td>
                    <td className="text-muted px-3 py-2">{s.city_name}</td>
                    <td className="text-ink px-3 py-2 font-bold">{s.transactions_count}</td>
                    <td className="text-brand-strong px-3 py-2 font-bold whitespace-nowrap">{fmtNum(s.median_price_per_sqm)}</td>
                    <td className={cn("px-3 py-2 font-semibold", trendTone(s.price_trend_6m))}>{trend(s.price_trend_6m)}</td>
                    <td className={cn("px-3 py-2 font-semibold", trendTone(s.price_trend_12m))}>{trend(s.price_trend_12m)}</td>
                    <td className={cn("px-3 py-2 font-semibold", trendTone(s.price_trend_24m))}>{trend(s.price_trend_24m)}</td>
                    <td className="text-muted px-3 py-2">{fmtNum(s.liquidity_score)}</td>
                    <td className={cn("px-3 py-2 font-black", score(s.street_score))}>{fmtNum(s.street_score)}</td>
                    <td className="text-muted px-3 py-2">{fmtNum(s.confidence_score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
