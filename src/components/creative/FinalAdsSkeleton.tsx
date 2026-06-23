"use client";
import { motion } from "framer-motion";

/** The "Final ads are being generated" area: 2 large skeleton preview cards
 *  that PULSE until the real image-generation response arrives (complete).
 *  We never fake completion — the parent flips `complete` only on the real
 *  backend response. */
export function FinalAdsSkeleton({ complete }: { complete: boolean }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-ink text-[13px] font-black">
          {complete ? "🏆 2 מודעות סופיות מוכנות" : "2 מודעות סופיות נוצרות"}
        </span>
        <span className="text-muted text-[11px] font-bold">Final ads are being generated</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className={`relative aspect-[4/5] overflow-hidden rounded-2xl border ${
              complete ? "border-brand-strong/60 bg-brand-soft/30" : "border-line/60 bg-surface/60"
            }`}
          >
            {complete ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.45, delay: i * 0.12 }}
                className="absolute inset-0 grid place-items-center"
              >
                <span className="text-brand-strong text-3xl">✓</span>
              </motion.div>
            ) : (
              <motion.div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-br from-transparent via-white/30 to-transparent"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
