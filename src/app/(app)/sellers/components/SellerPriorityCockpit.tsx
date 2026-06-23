"use client";

import { motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { sellerPriceLine, sellerContextLine, type SellerInsight } from "@/lib/sellers/insights";
import { SellerEmptyState } from "./SellerEmptyState";
import { NextActionButton } from "./sellerActions";

export function SellerPriorityCockpit({
  insights,
  onOpen,
}: {
  insights: SellerInsight[];
  onOpen: (sellerId: string) => void;
}) {
  // Surface the 5 most urgent sellers that actually warrant action now.
  const urgent = insights.filter((i) => i.urgency >= 30).slice(0, 5);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="zono-ai-gradient grid h-8 w-8 place-items-center rounded-xl text-white">
          <Icon name="Zap" size={16} />
        </span>
        <div>
          <h2 className="text-ink text-lg font-black">מי דורש טיפול עכשיו?</h2>
          <p className="text-muted text-xs font-medium">
            המוכרים בעדיפות הגבוהה ביותר, מדורגים אוטומטית לפי דחיפות וסיכון נטישה
          </p>
        </div>
      </div>

      {urgent.length === 0 ? (
        <SellerEmptyState kind="no-urgent" compact />
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
          {urgent.map((i, idx) => {
            const s = i.seller;
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: idx * 0.05 }}
                onClick={() => onOpen(s.id)}
                className="bg-card border-line hover:border-brand-light hover:shadow-[var(--shadow-lift)] flex min-w-[230px] shrink-0 cursor-pointer flex-col gap-2.5 rounded-[20px] border p-4 shadow-[var(--shadow-card)] transition-all lg:min-w-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-brand-soft text-brand-strong grid h-9 w-9 place-items-center rounded-full text-sm font-black">
                      {s.full_name.trim().charAt(0) || "?"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-ink truncate text-sm font-extrabold">{s.full_name}</p>
                      <p className="text-muted text-[11px]">{i.lastActivityLabel}</p>
                    </div>
                  </div>
                  <Badge tone={i.churnTone} size="sm">{i.churnLabel}</Badge>
                </div>

                <p className="text-brand-strong text-base font-black">{sellerPriceLine(s)}</p>
                <p className="text-muted truncate text-xs">{sellerContextLine(s)}</p>

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
