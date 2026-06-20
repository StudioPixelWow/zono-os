"use client";

import Link from "next/link";
import { recommendedProperties } from "@/data/mock";
import type { RecommendedProperty, Tone } from "@/types";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "../Icon";
import { SectionShell } from "../SectionShell";
import { motion } from "../motion";

const tagTone: Record<Tone, string> = {
  purple: "bg-brand text-white",
  blue: "bg-indigo-500 text-white",
  gold: "bg-warning text-ink",
  green: "bg-success text-white",
  red: "bg-danger text-white",
};

interface PropertiesSectionProps {
  /** Cards to render. Defaults to mock data so existing callers keep working. */
  properties?: RecommendedProperty[];
  /** When set, shows a subtle inline notice above the grid (error fallback). */
  errorMessage?: string;
}

export function PropertiesSection({
  properties = recommendedProperties,
  errorMessage,
}: PropertiesSectionProps = {}) {
  return (
    <SectionShell title="הזדמנויות נדל״ן חדשות עבורך" eyebrow="מותאם עבורך" actionHref="/properties" actionLabel="לכל הנכסים">
      {errorMessage && (
        <div className="bg-danger-soft text-danger mb-4 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold">
          <Icon name="AlertTriangle" size={14} strokeWidth={2.2} />
          {errorMessage}
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {properties.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.45 }}
            whileHover={{ y: -4 }}
          >
          <Link
            href={p.href ?? `/properties/${p.id}`}
            className="bg-card border-line group flex h-full flex-col overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
          >
            {/* image (real cover when available, gradient fallback) */}
            <div
              className={cn(
                "relative h-40 overflow-hidden bg-gradient-to-br",
                p.gradient,
              )}
            >
              {p.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              )}
              <span
                className={cn(
                  "absolute start-3 top-3 z-10 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm",
                  tagTone[p.tagTone],
                )}
              >
                {p.tag}
              </span>
              <span className="bg-card/90 text-brand absolute end-3 top-3 z-10 flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-extrabold shadow-sm backdrop-blur">
                <Icon name="Sparkles" size={12} strokeWidth={2.4} />
                {p.score}%
              </span>
              {p.buyerMatches > 0 && (
                <span className="bg-card/90 text-ink absolute bottom-3 start-3 z-10 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm backdrop-blur">
                  <Icon name="Users" size={12} strokeWidth={2.2} />
                  {p.buyerMatches} התאמות
                </span>
              )}
            </div>

            <div className="flex flex-1 flex-col p-4">
              <h3 className="text-ink text-base font-extrabold">{p.type}</h3>
              <p className="text-muted mt-0.5 text-sm">
                {p.street}, {p.city}
              </p>
              <p className="text-brand-strong mt-3 text-lg font-black">
                {formatShekels(p.price)}
              </p>

              <div className="text-muted mt-3 flex items-center gap-3 text-xs font-medium">
                <span>{p.rooms} חד׳</span>
                <span className="bg-line h-3 w-px" />
                <span>{p.sqm} מ״ר</span>
                <span className="bg-line h-3 w-px" />
                <span>קומה {p.floor}</span>
              </div>

              <span className="bg-brand-soft text-brand-strong group-hover:bg-brand group-hover:text-white mt-4 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition">
                פרטים
                <Icon name="ArrowLeft" size={15} strokeWidth={2.2} />
              </span>
            </div>
          </Link>
          </motion.div>
        ))}
      </div>
    </SectionShell>
  );
}
