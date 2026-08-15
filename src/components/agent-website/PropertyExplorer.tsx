"use client";
// ============================================================================
// Homepage property explorer — LIVE in-page filtering (P9.6A / P1-1).
// The search bar filters the agent's real public inventory instantly on the
// same page (no navigation, no full reload, no draft/preview route break).
// Keeps the overlapping search-bar layout + the properties grid beneath it.
// Owner/tenant scoping is preserved: it only ever filters the properties the
// server already resolved for this agent.
// ============================================================================
import { useMemo, useState } from "react";
import type { SiteProperty } from "@/lib/agent-website/site-data";
import { AgentPropertyCard, TextLink } from "./ui";

const TYPE_LABELS: Record<string, string> = {
  apartment: "דירה", house: "בית פרטי", private_house: "בית פרטי", penthouse: "פנטהאוז",
  garden_apartment: "דירת גן", duplex: "דופלקס", cottage: "קוטג׳", lot: "מגרש", land: "מגרש",
  commercial: "מסחרי", office: "משרד", studio: "סטודיו",
};
const label = (t: string) => TYPE_LABELS[t] ?? t;
const ROOMS = ["1", "2", "3", "4", "5", "6"];
const PRICES = [500_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000];
const fmtPrice = (n: number) => `₪${(n / 1_000_000).toLocaleString("he-IL", { maximumFractionDigits: 1 })}M`;

type Filters = { q: string; area: string; type: string; max: string; rooms: string };
const EMPTY: Filters = { q: "", area: "", type: "", max: "", rooms: "" };

export function PropertyExplorer({
  properties, areas, types, propertiesHref,
}: { properties: SiteProperty[]; areas: string[]; types: string[]; propertiesHref: string }) {
  const [f, setF] = useState<Filters>(EMPTY);
  const [open, setOpen] = useState(false);
  const active = Object.values(f).some(Boolean);

  const results = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const max = Number(f.max), rooms = Number(f.rooms);
    return properties.filter((p) => {
      if (q && ![p.title, p.city, p.neighborhood].filter(Boolean).some((v) => (v as string).toLowerCase().includes(q))) return false;
      if (f.area && !((p.city && (p.city.includes(f.area) || f.area.includes(p.city))) || (p.neighborhood && p.neighborhood.includes(f.area)))) return false;
      if (f.type && p.type !== f.type) return false;
      if (Number.isFinite(max) && max > 0 && (p.price ?? p.monthlyRent ?? Infinity) > max) return false;
      if (Number.isFinite(rooms) && rooms > 0 && (p.rooms ?? 0) < rooms) return false;
      return true;
    });
  }, [f, properties]);

  const sel = "w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-background)] px-3 py-3 text-[14px] text-[var(--brand-text)] outline-none transition focus:border-[color:var(--brand-primary)]";

  return (
    <div>
      {/* ── Search / filter bar (overlaps the hero like before) ─────────────── */}
      <div className="relative z-10 mx-auto -mt-8 w-full max-w-7xl px-5 sm:px-8">
        <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] p-3 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.4)]">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="order-3 flex items-center justify-between gap-2 lg:order-1">
              <span className="flex items-center gap-2 rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-[14px] font-bold text-[var(--brand-on-primary)]">
                <SearchIcon /> {results.length} נכסים{active ? " · מסוננים" : ""}
              </span>
              {active && (
                <button type="button" onClick={() => setF(EMPTY)} className="rounded-xl border border-[var(--brand-border)] px-4 py-3 text-[14px] font-bold text-[var(--brand-text)] transition hover:border-[color:var(--brand-primary)] lg:hidden">
                  נקה
                </button>
              )}
            </div>
            <div className="order-1 hidden flex-1 items-center gap-2 lg:order-2 lg:flex">
              {areas.length > 0 && (
                <select aria-label="אזור" className={sel} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>
                  <option value="">אזור</option>{areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
              {types.length > 0 && (
                <select aria-label="סוג נכס" className={sel} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                  <option value="">סוג נכס</option>{types.map((t) => <option key={t} value={t}>{label(t)}</option>)}
                </select>
              )}
              <select aria-label="מחיר" className={sel} value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })}>
                <option value="">טווח מחיר</option>{PRICES.map((p) => <option key={p} value={p}>עד {fmtPrice(p)}</option>)}
              </select>
              <select aria-label="חדרים" className={sel} value={f.rooms} onChange={(e) => setF({ ...f, rooms: e.target.value })}>
                <option value="">חדרים</option>{ROOMS.map((r) => <option key={r} value={r}>{r}+ חדרים</option>)}
              </select>
              {active && (
                <button type="button" onClick={() => setF(EMPTY)} className="shrink-0 rounded-xl border border-[var(--brand-border)] px-4 py-3 text-[14px] font-bold text-[var(--brand-text)] transition hover:border-[color:var(--brand-primary)]">
                  נקה
                </button>
              )}
            </div>
            <input
              aria-label="חיפוש חופשי"
              className={`${sel} order-2 flex-1 lg:order-3 lg:max-w-xs`}
              placeholder="חיפוש לפי כתובת, שכונה או מפתח…"
              value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })}
            />
            <button type="button" onClick={() => setOpen((v) => !v)} className="order-4 rounded-xl border border-[var(--brand-border)] px-4 py-3 text-[14px] font-bold text-[var(--brand-text)] lg:hidden">
              {open ? "הסתרת פילטרים" : "פילטרים"}
            </button>
          </div>
          {open && (
            <div className="mt-2 grid grid-cols-2 gap-2 lg:hidden">
              {areas.length > 0 && <select aria-label="אזור" className={sel} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}><option value="">אזור</option>{areas.map((a) => <option key={a} value={a}>{a}</option>)}</select>}
              {types.length > 0 && <select aria-label="סוג נכס" className={sel} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">סוג נכס</option>{types.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select>}
              <select aria-label="מחיר" className={sel} value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })}><option value="">טווח מחיר</option>{PRICES.map((p) => <option key={p} value={p}>עד {fmtPrice(p)}</option>)}</select>
              <select aria-label="חדרים" className={sel} value={f.rooms} onChange={(e) => setF({ ...f, rooms: e.target.value })}><option value="">חדרים</option>{ROOMS.map((r) => <option key={r} value={r}>{r}+ חדרים</option>)}</select>
            </div>
          )}
        </div>
      </div>

      {/* ── Filtered grid ──────────────────────────────────────────────────── */}
      <section id="properties" className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 lg:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-2xl font-black leading-tight text-[var(--brand-text)] sm:text-3xl">{active ? "תוצאות חיפוש" : "נכסים נבחרים"}</h2>
          <TextLink href={propertiesHref}>לכל הנכסים ←</TextLink>
        </div>
        {results.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[var(--brand-border)] py-16 text-center">
            <p className="text-[16px] font-semibold text-[var(--brand-muted)]">לא נמצאו נכסים התואמים לחיפוש.</p>
            <button type="button" onClick={() => setF(EMPTY)} className="mt-3 text-[14px] font-bold text-[color:var(--brand-link)] transition hover:opacity-80">ניקוי סינון</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {results.map((p) => <AgentPropertyCard key={p.id} property={p} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function SearchIcon() { return <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden><circle cx={11} cy={11} r={7} /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>; }
