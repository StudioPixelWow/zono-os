"use client";

import { marketStats } from "@/data/mock";
import { cn } from "@/lib/utils";
import { Icon } from "../Icon";
import { MiniChart } from "../MiniChart";
import { SectionShell } from "../SectionShell";
import { motion } from "../motion";

export function MarketSection() {
  return (
    <SectionShell title="מודיעין שוק" eyebrow="נתוני שוק חיים">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {marketStats.map((s, i) => {
          const isGood = s.changePct > 0 === s.positiveIsGood;
          return (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
              whileHover={{ y: -3 }}
              className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
            >
              <p className="text-muted text-xs font-semibold leading-tight">
                {s.label}
              </p>
              <div className="flex items-end gap-1.5">
                <span className="text-ink text-2xl font-black leading-none">
                  {s.value}
                </span>
                {s.unit && (
                  <span className="text-muted mb-0.5 text-xs font-semibold">
                    {s.unit}
                  </span>
                )}
              </div>

              <MiniChart series={s.series} type={s.chart} tone={s.tone} />

              <span
                className={cn(
                  "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                  isGood
                    ? "bg-success-soft text-success"
                    : "bg-danger-soft text-danger",
                )}
              >
                <Icon
                  name={s.changePct > 0 ? "TrendingUp" : "TrendingDown"}
                  size={13}
                  strokeWidth={2.4}
                />
                {s.changePct > 0 ? "+" : ""}
                {s.changePct}%
              </span>
            </motion.div>
          );
        })}
      </div>
    </SectionShell>
  );
}
