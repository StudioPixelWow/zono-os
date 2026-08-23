"use client";
// Wide, modern property search bar (spec §7). Desktop: inline row. Mobile:
// compact free-text + expandable filters. Submits to the canonical
// /agent/[slug]/properties list with query params (no fabricated options —
// area + type choices come from the agent's real inventory).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolvePropertyType } from "@/lib/property-marketing/presentation";

// Canonical Hebrew label; null for an unknown internal/English token so it is
// dropped from the dropdown instead of leaking a raw enum to the public UI.
const label = (t: string): string | null => resolvePropertyType(t);

const ROOMS = ["1", "2", "3", "4", "5", "6"];
const PRICES = [500_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000];
const fmtPrice = (n: number) => `₪${(n / 1_000_000).toLocaleString("he-IL", { maximumFractionDigits: 1 })}M`;

export function PropertySearch({ slug, areas, types, basePath = "/agent" }: { slug: string; areas: string[]; types: string[]; basePath?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ q: "", area: "", type: "", min: "", max: "", rooms: "" });
  // Only offer types that resolve to a Hebrew label — unknown/internal enums drop.
  const typeOptions = types.map((t) => ({ value: t, he: label(t) })).filter((o): o is { value: string; he: string } => !!o.he);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    router.push(`${basePath}/${slug}/properties${p.toString() ? `?${p}` : ""}`);
  };

  const sel = "w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-background)] px-3 py-3 text-[14px] text-[var(--brand-text)] outline-none transition focus:border-[color:var(--brand-primary)]";

  return (
    <form onSubmit={submit} className="mx-auto -mt-8 w-full max-w-7xl px-5 sm:px-8">
      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] p-3 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.4)]">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <button type="submit" className="order-3 flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary)] px-6 py-3 text-[14px] font-bold text-[var(--brand-on-primary)] transition hover:bg-[color:var(--brand-primary-hover)] lg:order-3 lg:w-auto">
            <SearchIcon /> חיפוש נכסים
          </button>
          <div className="order-1 hidden flex-1 items-center gap-2 lg:order-2 lg:flex">
            {areas.length > 0 && (
              <select aria-label="אזור" className={sel} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>
                <option value="">אזור</option>{areas.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            )}
            {typeOptions.length > 0 && (
              <select aria-label="סוג נכס" className={sel} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                <option value="">סוג נכס</option>{typeOptions.map((o) => <option key={o.value} value={o.value}>{o.he}</option>)}
              </select>
            )}
            <select aria-label="מחיר" className={sel} value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })}>
              <option value="">טווח מחיר</option>{PRICES.map((p) => <option key={p} value={p}>עד {fmtPrice(p)}</option>)}
            </select>
            <select aria-label="חדרים" className={sel} value={f.rooms} onChange={(e) => setF({ ...f, rooms: e.target.value })}>
              <option value="">חדרים</option>{ROOMS.map((r) => <option key={r} value={r}>{r}+ חדרים</option>)}
            </select>
          </div>
          <input
            aria-label="חיפוש חופשי"
            className={`${sel} order-2 flex-1 lg:order-1 lg:max-w-xs`}
            placeholder="חיפוש לפי כתובת, שכונה או מפתח…"
            value={f.q}
            onChange={(e) => setF({ ...f, q: e.target.value })}
          />
          <button type="button" onClick={() => setOpen((v) => !v)} className="order-4 rounded-xl border border-[var(--brand-border)] px-4 py-3 text-[14px] font-bold text-[var(--brand-text)] lg:hidden">
            {open ? "הסתרת פילטרים" : "פילטרים"}
          </button>
        </div>

        {/* Mobile expandable filters */}
        {open && (
          <div className="mt-2 grid grid-cols-2 gap-2 lg:hidden">
            {areas.length > 0 && <select aria-label="אזור" className={sel} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}><option value="">אזור</option>{areas.map((a) => <option key={a} value={a}>{a}</option>)}</select>}
            {typeOptions.length > 0 && <select aria-label="סוג נכס" className={sel} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">סוג נכס</option>{typeOptions.map((o) => <option key={o.value} value={o.value}>{o.he}</option>)}</select>}
            <select aria-label="מחיר" className={sel} value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })}><option value="">טווח מחיר</option>{PRICES.map((p) => <option key={p} value={p}>עד {fmtPrice(p)}</option>)}</select>
            <select aria-label="חדרים" className={sel} value={f.rooms} onChange={(e) => setF({ ...f, rooms: e.target.value })}><option value="">חדרים</option>{ROOMS.map((r) => <option key={r} value={r}>{r}+ חדרים</option>)}</select>
          </div>
        )}
      </div>
    </form>
  );
}

function SearchIcon() { return <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden><circle cx={11} cy={11} r={7} /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>; }
