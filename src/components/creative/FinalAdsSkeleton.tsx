"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/** Honest in-progress labels for each final ad. We rotate these to show the
 *  pipeline is alive — but completion itself is NEVER faked: a card only flips
 *  to ✓ when `complete` (the real backend response) is true. */
const WORK_STEPS = [
  "יוצרת ויזואל באיכות מלאה…",
  "בודקת QA עברית וקריאות…",
  "מוודאת התאמה למותג…",
  "משפרת ומרעננת…",
];

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")} דק׳` : `${s} שנ׳`;
}

/** The "Final ads are being generated" area: 2 large preview cards that show
 *  live per-ad working state + elapsed time until the real images arrive. */
export function FinalAdsSkeleton({ complete }: { complete: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (complete) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [complete]);
  useEffect(() => {
    if (complete) return;
    const id = setInterval(() => setStep((s) => (s + 1) % WORK_STEPS.length), 2600);
    return () => clearInterval(id);
  }, [complete]);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-ink text-[13px] font-black">
          {complete ? "🏆 2 מודעות סופיות מוכנות" : "2 מודעות סופיות נוצרות"}
        </span>
        <span className="text-muted text-[11px] font-bold tabular-nums">
          {complete ? "הושלם" : `${fmtElapsed(elapsed)} · נמשך בדרך כלל 1–3 דק׳`}
        </span>
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
              <>
                {/* shimmer */}
                <motion.div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-br from-transparent via-white/30 to-transparent"
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
                />
                {/* honest per-ad working label */}
                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-2.5 text-center">
                  <span className="text-ink/80 text-[10px] font-black">מודעה {i + 1}</span>
                  <motion.span
                    key={step}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="text-muted text-[10px] font-semibold leading-tight"
                  >
                    {WORK_STEPS[(step + i) % WORK_STEPS.length]}
                  </motion.span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
