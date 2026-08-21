"use client";
// Office Intelligence — sticky CONTROL BAR (client). City + search persist in the
// URL and drive the cockpit server-side (soft nav, no full reload).
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import type { OfficeCockpit } from "@/lib/office-intel/cockpit";

export function OfficeControlBar({ facets, filters }: { facets: OfficeCockpit["facets"]; filters: OfficeCockpit["filters"] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(filters.search ?? "");
  const setParam = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") next.delete(k); else next.set(k, v); }
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);
  const sel = "border-line bg-card text-ink focus:border-brand-light rounded-lg border px-2.5 py-1.5 text-xs font-bold outline-none";
  return (
    <div dir="rtl" className="border-line bg-card/95 sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-2xl border p-2.5 shadow-sm backdrop-blur">
      <select className={sel} value={filters.city ?? ""} onChange={(e) => setParam({ city: e.target.value || null })}>
        <option value="">כל הערים</option>
        {facets.cities.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <form onSubmit={(e) => { e.preventDefault(); setParam({ q: q.trim() || null }); }} className="flex min-w-0 flex-1 gap-2 sm:max-w-xs">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חפש משרד, רשת או אזור..." className={`${sel} min-w-0 flex-1`} />
        <button type="submit" className="bg-brand hover:bg-brand-strong shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white">חפש</button>
      </form>
    </div>
  );
}
