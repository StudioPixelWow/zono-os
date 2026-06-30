"use client";
// ============================================================================
// 🗂️ Offices directory (RTL). Search + city/brand filters over a card grid.
// ============================================================================
import { useMemo, useState } from "react";
import Link from "next/link";
import type { OfficesIndex } from "@/lib/brokerage-data/office-profile";

const fmt = (n: number) => n.toLocaleString("he-IL");

export function OfficesIndexView({ index }: { index: OfficesIndex }) {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [brand, setBrand] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim();
    return index.offices.filter((o) =>
      (!city || o.city === city) && (!brand || o.brandNetwork === brand) &&
      (!needle || o.name.includes(needle) || (o.brandNetwork ?? "").includes(needle) || (o.city ?? "").includes(needle)));
  }, [index.offices, q, city, brand]);

  return (
    <div dir="rtl" className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <Link href="/brokerage-data" className="text-muted hover:text-ink w-fit text-[12px] font-bold">← חזרה לדאטה משרדי תיווך</Link>

      <section className="border-brand/40 bg-brand-soft/40 flex flex-wrap items-end justify-between gap-3 rounded-2xl border p-4 sm:p-5">
        <div>
          <h1 className="text-brand-strong text-2xl font-black">🗂️ מדריך המשרדים</h1>
          <p className="text-muted mt-1 text-[12px]">{fmt(index.totals.offices)} משרדים · {fmt(index.totals.agents)} סוכנים · {fmt(index.totals.listings)} נכסים</p>
        </div>
      </section>

      {/* Filters */}
      <div className="border-line bg-card flex flex-wrap items-center gap-2 rounded-2xl border p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם / מותג / עיר"
          className="border-line bg-surface text-ink min-w-[220px] flex-1 rounded-full border px-3 py-1.5 text-sm" />
        <select value={city} onChange={(e) => setCity(e.target.value)} className="border-line bg-surface text-ink rounded-full border px-3 py-1.5 text-xs font-bold">
          <option value="">כל הערים</option>{index.cities.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} className="border-line bg-surface text-ink rounded-full border px-3 py-1.5 text-xs font-bold">
          <option value="">כל המותגים</option>{index.brands.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="border-line bg-surface text-muted rounded-2xl border p-8 text-center text-sm">לא נמצאו משרדים בסינון הנוכחי.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o) => (
            <Link key={o.id} href={`/brokerage-data/office/${o.id}`}
              className="border-line bg-card hover:border-brand/50 hover:shadow-sm flex flex-col gap-2 rounded-2xl border p-4 transition-all">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-ink truncate text-base font-black">{o.name}</h2>
                <span className="text-muted shrink-0 text-[11px] font-bold tabular-nums">{Math.round(o.confidenceScore)}%</span>
              </div>
              <p className="text-muted truncate text-[12px]">{[o.brandNetwork, o.city].filter(Boolean).join(" · ") || "—"}</p>
              <div className="mt-1 flex gap-2 text-[11px]">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">{fmt(o.agentCount)} סוכנים</span>
                <span className="bg-surface text-muted rounded-full px-2 py-0.5 font-bold">{fmt(o.listingCount)} נכסים</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
