"use client";
// ============================================================================
// Market cockpit — sticky intelligence CONTROL BAR (client). ONE filter state,
// persisted in the URL search params, drives the ENTIRE workspace. Changing a
// control soft-navigates (updates the query) so the server re-renders the scoped
// cockpit without a full page reload. Only real, data-backed dimensions appear.
// ============================================================================
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import type { Facets, CockpitFilters } from "@/lib/market-intelligence/command-center";

const PERIODS: (7 | 30 | 90)[] = [7, 30, 90];

export function MarketFilterBar({ facets, filters }: { facets: Facets; filters: CockpitFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") next.delete(k); else next.set(k, v); }
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  const sel = "border-line bg-card text-ink focus:border-brand-light rounded-lg border px-2.5 py-1.5 text-xs font-bold outline-none";
  const hasFilters = Boolean(filters.city || filters.neighborhood || filters.propertyType || filters.deal || filters.roomsMin || filters.priceMin || filters.priceMax);

  return (
    <div dir="rtl" className="border-line bg-card/95 sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-2xl border p-2.5 shadow-sm backdrop-blur">
      <select className={sel} value={filters.city ?? ""} onChange={(e) => setParam({ city: e.target.value || null, nbhd: null })}>
        <option value="">כל הערים</option>
        {facets.cities.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select className={sel} value={filters.neighborhood ?? ""} onChange={(e) => setParam({ nbhd: e.target.value || null })}>
        <option value="">כל השכונות</option>
        {facets.neighborhoods.map((n) => <option key={n} value={n}>{n.length > 22 ? n.slice(0, 22) + "…" : n}</option>)}
      </select>
      <div className="border-line flex overflow-hidden rounded-lg border">
        {([["", "הכל"], ["sale", "מכירה"], ["rent", "השכרה"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setParam({ deal: v || null })} className={`px-2.5 py-1.5 text-xs font-bold transition ${(filters.deal ?? "") === v ? "bg-brand text-white" : "bg-card text-muted hover:text-ink"}`}>{l}</button>
        ))}
      </div>
      <select className={sel} value={filters.propertyType ?? ""} onChange={(e) => setParam({ type: e.target.value || null })}>
        <option value="">כל הסוגים</option>
        {facets.propertyTypes.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select className={sel} value={filters.roomsMin != null ? String(filters.roomsMin) : ""} onChange={(e) => setParam({ rooms: e.target.value || null })}>
        <option value="">חדרים</option>
        {facets.roomsOptions.map((r) => <option key={r} value={r}>{r}+ חד׳</option>)}
      </select>

      <div className="ms-auto flex items-center gap-2">
        {hasFilters && <button onClick={() => router.push(pathname, { scroll: false })} className="text-muted hover:text-ink text-xs font-bold">נקה</button>}
        <div className="border-line flex overflow-hidden rounded-lg border">
          {PERIODS.map((p) => (
            <button key={p} onClick={() => setParam({ period: String(p) })} className={`px-2.5 py-1.5 text-xs font-bold transition ${filters.period === p ? "bg-brand-soft text-brand-strong" : "bg-card text-muted hover:text-ink"}`}>{p}D</button>
          ))}
        </div>
      </div>
    </div>
  );
}
