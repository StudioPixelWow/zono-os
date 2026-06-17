"use client";

import { hotOpportunities } from "@/data/mock";
import type { Tone } from "@/types";
import { cn } from "@/lib/utils";
import { Icon } from "../Icon";
import { SectionShell } from "../SectionShell";
import { motion } from "../motion";

const toneText: Record<Tone, string> = {
  purple: "text-brand bg-brand-soft",
  blue: "text-indigo-600 bg-indigo-50",
  gold: "text-amber-600 bg-amber-50",
  green: "text-success bg-success-soft",
  red: "text-danger bg-danger-soft",
};

const toneAccent: Record<Tone, string> = {
  purple: "bg-brand",
  blue: "bg-indigo-500",
  gold: "bg-warning",
  green: "bg-success",
  red: "bg-danger",
};

export function OpportunitiesSection() {
  return (
    <SectionShell title="הזדמנויות חמות עבורך" eyebrow="AI · בזמן אמת">
      <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {hotOpportunities.map((o, i) => (
          <motion.article
            key={o.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.4 }}
            whileHover={{ y: -4 }}
            className="bg-card border-line relative flex w-[270px] shrink-0 flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
          >
            <span
              className={cn(
                "absolute end-0 top-5 h-9 w-1 rounded-s-full",
                toneAccent[o.tone],
              )}
            />
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
                  toneText[o.tone],
                )}
              >
                <Icon name={o.icon} size={14} strokeWidth={2.2} />
                {o.kind}
              </span>
              <span className="text-muted text-[11px] font-bold">
                ציון {o.score}
              </span>
            </div>

            <h3 className="text-ink text-sm font-extrabold leading-snug">
              {o.title}
            </h3>
            <p className="text-muted text-xs">{o.relation}</p>

            <button
              className={cn(
                "mt-auto inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90",
                toneAccent[o.tone],
              )}
            >
              {o.cta}
              <Icon name="ArrowLeft" size={15} strokeWidth={2.2} />
            </button>
          </motion.article>
        ))}
      </div>
    </SectionShell>
  );
}
