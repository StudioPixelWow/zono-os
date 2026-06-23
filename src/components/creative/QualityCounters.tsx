"use client";
import { motion } from "framer-motion";

/** Three animated quality counters (exact Hebrew, RTL). Parent passes the live
 *  values so they ramp up gradually rather than appearing at once. */
export function QualityCounters({ generated, rejected, finalists }: { generated: number; rejected: number; finalists: number }) {
  const items: { value: number; label: string; tone: string }[] = [
    { value: generated, label: "גרסאות נוצרו", tone: "text-ink" },
    { value: rejected, label: "נפסלו בבקרת איכות", tone: "text-muted" },
    { value: finalists, label: "עלו לגמר", tone: "text-brand-strong" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((it) => (
        <div key={it.label} className="border-line/60 bg-surface/50 flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-center">
          <motion.span key={it.value} initial={{ scale: 0.6, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }} className={`text-xl font-black tabular-nums ${it.tone}`}>
            {it.value}
          </motion.span>
          <span className="text-muted text-[10px] font-bold leading-tight">{it.label}</span>
        </div>
      ))}
    </div>
  );
}
