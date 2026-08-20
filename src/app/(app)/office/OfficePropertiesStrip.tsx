"use client";
// Office property strip — a real-estate-first horizontal CAROUSEL with large
// photography and quick filters. Only filters that are actually backed by the
// current data render as chips (no dead filters). Data is passed in from the
// server board (no fetching here). Clicking a card enters the existing property
// experience. RTL: the carousel scrolls horizontally and snaps.
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import type { OfficePropertyCard } from "@/lib/office/management-board";

type Filter = "all" | "sale" | "rent" | "exclusive" | "non_exclusive" | "attention";
const FILTER_DEFS: { key: Filter; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "sale", label: "מכירה" },
  { key: "rent", label: "השכרה" },
  { key: "exclusive", label: "בלעדיות" },
  { key: "non_exclusive", label: "ללא בלעדיות" },
  { key: "attention", label: "דורש טיפול" },
];
const TXN_OVER: Record<string, string> = { brand: "bg-brand text-white", success: "bg-success text-white" };

function matches(p: OfficePropertyCard, f: Filter): boolean {
  switch (f) {
    case "all": return true;
    case "sale": return p.kind === "sale";
    case "rent": return p.kind === "rent";
    case "exclusive": return p.exclusive;
    case "non_exclusive": return !p.exclusive;
    case "attention": return p.interested === 0 || p.status === "draft"; // no interest yet / not live
    default: return true;
  }
}

export function OfficePropertiesStrip({ cards }: { cards: OfficePropertyCard[] }) {
  const [f, setF] = useState<Filter>("all");
  // Render a filter chip only when it's backed by data (never a dead filter).
  const activeFilters = useMemo(
    () => FILTER_DEFS.filter((d) => d.key === "all" || cards.some((c) => matches(c, d.key))),
    [cards],
  );
  const shown = cards.filter((c) => matches(c, f));

  if (cards.length === 0) {
    return <div className="border-line text-muted rounded-2xl border border-dashed py-8 text-center text-[13px]">אין נכסים פעילים במשרד כרגע</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {activeFilters.map((x) => (
          <button key={x.key} type="button" onClick={() => setF(x.key)}
            className={`rounded-full px-3 py-1 text-[12px] font-bold transition ${f === x.key ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink"}`}>
            {x.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="text-muted py-6 text-center text-[13px]">אין נכסים בסינון הזה</div>
      ) : (
        <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {shown.map((p) => {
            const txn = p.kind === "rent" ? { label: "השכרה", tone: "success" } : p.kind === "sale" ? { label: "מכירה", tone: "brand" } : null;
            return (
              <Link key={p.id} href={p.href} className="border-line bg-card hover:shadow-[var(--shadow-lift)] flex w-[270px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border shadow-[var(--shadow-card)] transition-shadow sm:w-[300px]">
                <div className="bg-surface relative h-40 w-full overflow-hidden">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- CDN/portal photos; next/image remote loader not configured for arbitrary hosts
                    <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="text-muted grid h-full w-full place-items-center"><Icon name="Building" size={34} /></div>
                  )}
                  {txn && <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black shadow-sm ${TXN_OVER[txn.tone]}`}>{txn.label}</span>}
                  {p.exclusive && <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-black text-white">בלעדיות</span>}
                  {p.price && p.price !== "—" && <span className="text-ink absolute bottom-2 right-2 rounded-lg bg-white/95 px-2 py-0.5 text-[12px] font-black shadow-sm">{p.price}</span>}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <p className="text-ink truncate text-[13px] font-black">{p.title}</p>
                  {p.sub && <p className="text-muted truncate text-[11px]">{p.sub}</p>}
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="bg-surface text-muted rounded-md px-1.5 py-0.5 text-[10px] font-bold">{p.statusLabel}</span>
                    <div className="flex items-center gap-2 text-[11px]">
                      {p.interested > 0 && <span className="text-success inline-flex items-center gap-0.5 font-bold"><Icon name="Users" size={11} />{p.interested}</span>}
                      {p.agentName && <span className="text-muted max-w-[90px] truncate">{p.agentName}</span>}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
