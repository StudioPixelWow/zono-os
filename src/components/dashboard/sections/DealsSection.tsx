"use client";

import Link from "next/link";
import { recentDeals } from "@/data/mock";
import type { MapPin, RecentDeal } from "@/types/dashboard";
import { formatShekels } from "@/lib/utils";
import { Icon } from "../Icon";
import { CityMap } from "../CityMap";
import { SectionShell } from "../SectionShell";
import { motion } from "../motion";

export function DealsSection({ deals = recentDeals }: { deals?: RecentDeal[] } = {}) {
  const dealPins: MapPin[] = deals.map((d) => ({
    id: d.id,
    label: `${d.type}, ${d.city}`,
    count: 0,
    tone: "purple",
    xPct: d.xPct,
    yPct: d.yPct,
  }));
  return (
    <SectionShell title="עסקאות שבוצעו לאחרונה" eyebrow="פעילות אחרונה" actionHref="/properties?status=sold" actionLabel="לכל המכירות">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* Deals list */}
        <div className="flex flex-col gap-3">
          {deals.map((d, i) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
            >
            <Link
              href={d.href ?? `/properties/${d.id}`}
              className="bg-card border-line hover:border-brand-light flex items-center gap-3 rounded-[20px] border p-4 shadow-[var(--shadow-soft)] transition"
            >
              <div className="bg-brand-soft text-brand grid h-11 w-11 shrink-0 place-items-center rounded-2xl">
                <Icon name="Building2" size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-ink text-sm font-extrabold">
                  {d.type}, {d.city}
                </p>
                <p className="text-muted text-xs">{d.when}</p>
              </div>
              <p className="text-success text-sm font-black whitespace-nowrap">
                {formatShekels(d.price)}
              </p>
            </Link>
            </motion.div>
          ))}

          <Link href="/properties?status=sold" className="text-brand hover:text-brand-strong mt-1 inline-flex items-center justify-center gap-1.5 text-sm font-bold transition">
            צפה בכל המכירות
            <Icon name="ArrowLeft" size={15} strokeWidth={2.2} />
          </Link>
        </div>

        {/* Deals map */}
        <div className="border-line h-[300px] overflow-hidden rounded-[24px] border bg-card shadow-[var(--shadow-card)] lg:h-auto">
          <CityMap
            pins={dealPins}
            pinStyle="marker"
            showControls={false}
            showLegend={false}
          />
        </div>
      </div>
    </SectionShell>
  );
}
