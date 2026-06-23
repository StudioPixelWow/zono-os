"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/** Honest in-progress labels for each final ad. We rotate these to show the
 *  pipeline is alive — but completion itself is NEVER faked: a card only shows
 *  its real result when `complete` (the real backend response) is true. */
const WORK_STEPS = [
  "יוצרת ויזואל באיכות מלאה…",
  "בודקת QA עברית וקריאות…",
  "מוודאת התאמה למותג…",
  "משפרת ומרעננת…",
];

/** One finished ad to preview. imageUrl null = produced via the deterministic
 *  renderer (no standalone image) — we show a "ready" tile instead of a photo. */
export interface FinalAdPreview {
  imageUrl: string | null;
  label: string;
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")} דק׳` : `${s} שנ׳`;
}

/** The "Final ads" area: 2 large preview cards. While generating they show live
 *  per-ad working state + elapsed time; on completion they show the REAL
 *  generated ads (images) when available. */
export function FinalAdsSkeleton({ complete, ads = [] }: { complete: boolean; ads?: FinalAdPreview[] }) {
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
        {[0, 1].map((i) => {
          const ad = ads[i];
          return (
            <div
              key={i}
              className={`relative aspect-[4/5] overflow-hidden rounded-2xl border ${
                complete ? "border-brand-strong/60 bg-brand-soft/30" : "border-line/60 bg-surface/60"
              }`}
            >
              {complete && ad?.imageUrl ? (
                // Real generated ad image.
                <motion.img
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.45, delay: i * 0.12 }}
                  src={ad.imageUrl}
                  alt={ad.label}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : complete ? (
                // Completed, but this ad came from the deterministic renderer
                // (no standalone image) — show a labeled "ready" tile, not a blank.
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.45, delay: i * 0.12 }}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center"
                >
                  <span className="bg-brand-strong text-card grid h-12 w-12 place-items-center rounded-full text-2xl">✓</span>
                  <span className="text-ink text-[12px] font-black">{ad?.label ?? `מודעה ${i + 1}`}</span>
                  <span className="text-muted text-[10px] font-semibold">מוכנה — לחץ/י “צפה בתוצאות”</span>
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
          );
        })}
      </div>
    </div>
  );
}
