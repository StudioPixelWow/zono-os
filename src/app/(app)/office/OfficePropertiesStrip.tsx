"use client";
// Office property strip — real-estate-first cards with working client-side quick
// filters (הכל / מכירה / השכרה / בלעדיות / דורש טיפול). Data is passed in from the
// server board (no fetching here). Clicking a card enters the existing property
// experience.
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import type { OfficePropertyCard } from "@/lib/office/management-board";

type Filter = "all" | "sale" | "rent" | "exclusive" | "attention";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "הכל" }, { key: "sale", label: "מכירה" }, { key: "rent", label: "השכרה" },
  { key: "exclusive", label: "בלעדיות" }, { key: "attention", label: "דורש טיפול" },
];
const TXN_OVER: Record<string, string> = { brand: "bg-brand text-white", success: "bg-success text-white" };

function matches(p: OfficePropertyCard, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "sale") return p.kind === "sale";
  if (f === "rent") return p.kind === "rent";
  if (f === "exclusive") return p.exclusive;
  if (f === "attention") return p.interested === 0 || p.status === "draft"; // no interest yet / not live
  return true;
}

export function OfficePropertiesStrip({ cards }: { cards: OfficePropertyCard[] }) {
  const [f, setF] = useState<Filter>("all");
  const shown = cards.filter((c) => matches(c, f));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((x) => (
          <button key={x.key} type="button" onClick={() => setF(x.key)}
            className={`rounded-full px-3 py-1 text-[12px] font-bold transition ${f === x.key ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink"}`}>
            {x.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="text-muted py-6 text-center text-[13px]">אין נכסים בסינון הזה</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((p) => {
            const txn = p.kind === "rent" ? { label: "השכרה", tone: "success" } : p.kind === "sale" ? { label: "מכירה", tone: "brand" } : null;
            return (
              <Link key={p.id} href={p.href} className="border-line bg-card hover:shadow-[var(--shadow-lift)] flex flex-col overflow-hidden rounded-2xl border shadow-[var(--shadow-card)] transition-shadow">
                <div className="bg-surface relative h-28 w-full overflow-hidden">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- CDN/portal photos; next/image remote loader not configured for arbitrary hosts
                    <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="text-muted grid h-full w-full place-items-center"><Icon name="Building" size={30} /></div>
                  )}
                  {txn && <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black shadow-sm ${TXN_OVER[txn.tone]}`}>{txn.label}</span>}
                  <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-black text-white">{p.exclusive ? "בלעדיות" : "ללא בלעדיות"}</span>
                  {p.price && p.price !== "—" && <span className="text-ink absolute bottom-2 right-2 rounded-lg bg-white/95 px-2 py-0.5 text-[12px] font-black shadow-sm">{p.price}</span>}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <p className="text-ink truncate text-[13px] font-black">{p.title}</p>
                  {p.sub && <p className="text-muted truncate text-[11px]">{p.sub}</p>}
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="bg-surface text-muted rounded-md px-1.5 py-0.5 text-[10px] font-bold">{p.statusLabel}</span>
                    <div className="flex items-center gap-2 text-[11px]">
                      {p.interested > 0 && <span className="text-success inline-flex items-center gap-0.5 font-bold"><Icon name="Users" size={11} />{p.interested}</span>}
                      {p.agentName && <span className="text-muted truncate">{p.agentName}</span>}
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
