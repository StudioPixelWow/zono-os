"use client";
import { motion } from "framer-motion";

export interface CounterItem { value: number; label: string; tone?: string }

/** Animated quality counters (exact Hebrew, RTL). Parent passes live values so
 *  they ramp up gradually rather than appearing all at once. */
export function QualityCounters({ items }: { items: CounterItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="border-line/60 bg-surface/50 flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-center">
          <motion.span key={it.value} initial={{ scale: 0.6, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }} className={`text-xl font-black tabular-nums ${it.tone ?? "text-ink"}`}>
            {it.value}
          </motion.span>
          <span className="text-muted text-[10px] font-bold leading-tight">{it.label}</span>
        </div>
      ))}
    </div>
  );
}
