"use client";

import { motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { TEMPERATURE_LABELS, TEMPERATURE_TONES } from "@/lib/buyers/labels";
import { buyerBudgetLine, type BuyerInsight } from "@/lib/buyers/insights";
import { BuyerEmptyState } from "./BuyerEmptyState";
import { NextActionButton } from "./buyerActions";

export function BuyerPriorityCockpit({
  insights,
  onOpen,
}: {
  insights: BuyerInsight[];
  onOpen: (buyerId: string) => void;
}) {
  // Surface the 5 most urgent buyers that actually warrant action now.
  const urgent = insights.filter((i) => i.urgency >= 35).slice(0, 5);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="zono-ai-gradient grid h-8 w-8 place-items-center rounded-xl text-white">
          <Icon name="Zap" size={16} />
        </span>
        <div>
          <h2 className="text-ink text-lg font-black">מי דורש פעולה עכשיו?</h2>
          <p className="text-muted text-xs font-medium">
            הקונים בעדיפות הגבוהה ביותר, מדורגים אוטומטית לפי דחיפות
          </p>
        </div>
      </div>

      {urgent.length === 0 ? (
        <BuyerEmptyState kind="no-urgent" compact />
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
          {urgent.map((i, idx) => {
            const b = i.buyer;
            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: idx * 0.05 }}
                onClick={() => onOpen(b.id)}
                className="bg-card border-line hover:border-brand-light hover:shadow-[var(--shadow-lift)] flex min-w-[230px] shrink-0 cursor-pointer flex-col gap-2.5 rounded-[20px] border p-4 shadow-[var(--shadow-card)] transition-all lg:min-w-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-brand-soft text-brand-strong grid h-9 w-9 place-items-center rounded-full text-sm font-black">
                      {b.full_name.trim().charAt(0) || "?"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-ink truncate text-sm font-extrabold">{b.full_name}</p>
                      <p className="text-muted text-[11px]">{i.lastActivityLabel}</p>
                    </div>
                  </div>
                  {b.temperature && (
                    <Badge tone={TEMPERATURE_TONES[b.temperature]} size="sm">
                      {TEMPERATURE_LABELS[b.temperature]}
                    </Badge>
                  )}
                </div>

                <p className="text-brand-strong text-base font-black">{buyerBudgetLine(b)}</p>
                <p className="text-muted truncate text-xs">
                  {b.preferred_areas.length ? b.preferred_areas.join(", ") : "ללא אזור מועדף"}
                </p>

                <div
                  className={cn(
                    "flex items-start gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-semibold leading-snug",
                    i.urgencyTone === "danger"
                      ? "bg-danger-soft text-danger"
                      : i.urgencyTone === "warning"
                        ? "bg-warning-soft text-warning"
                        : "bg-brand-soft text-brand-strong",
                  )}
                >
                  <Icon name="AlertCircle" size={13} className="mt-0.5 shrink-0" />
                  <span>{i.urgencyReason}</span>
                </div>

                <NextActionButton insight={i} size="sm" className="w-full" />
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}
