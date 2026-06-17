"use client";

import { recommendedProperties } from "@/data/mock";
import type { Tone } from "@/types";
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

export function PropertiesSection() {
  return (
    <SectionShell title="הזדמנויות נדל״ן חדשות עבורך" eyebrow="מותאם עבורך">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {recommendedProperties.map((p, i) => (
          <motion.article
            key={p.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.45 }}
            whileHover={{ y: -4 }}
            className="bg-card border-line group flex flex-col overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
          >
            {/* image placeholder */}
            <div
              className={cn(
                "relative h-40 bg-gradient-to-br",
                p.gradient,
              )}
            >
              <span
                className={cn(
                  "absolute start-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm",
                  tagTone[p.tagTone],
                )}
              >
                {p.tag}
              </span>
              <span className="bg-card/90 text-brand absolute end-3 top-3 flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-extrabold shadow-sm backdrop-blur">
                <Icon name="Sparkles" size={12} strokeWidth={2.4} />
                {p.score}%
              </span>
              <span className="bg-card/90 text-ink absolute bottom-3 start-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm backdrop-blur">
                <Icon name="Users" size={12} strokeWidth={2.2} />
                {p.buyerMatches} התאמות
              </span>
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

              <button className="bg-brand-soft text-brand-strong hover:bg-brand hover:text-white mt-4 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition">
                פרטים
                <Icon name="ArrowLeft" size={15} strokeWidth={2.2} />
              </button>
            </div>
          </motion.article>
        ))}
      </div>
    </SectionShell>
  );
}
