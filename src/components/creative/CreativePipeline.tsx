"use client";
import { motion } from "framer-motion";

/** The 6-stage ZONO Creative Engine pipeline (exact Hebrew labels, RTL). */
export const PIPELINE_STEPS = [
  "ניתוח הנכס",
  "בחירת סגנון",
  "יצירת 16 גרסאות",
  "דירוג Wow Score",
  "QA עברית",
  "בחירת 4 מנצחות",
] as const;

/** activeStep is 0-based; steps below it are complete, the one at it is active,
 *  above it are muted. activeStep === PIPELINE_STEPS.length ⇒ all complete. */
export function CreativePipeline({ activeStep }: { activeStep: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      {PIPELINE_STEPS.map((label, i) => {
        const done = i < activeStep;
        const active = i === activeStep;
        return (
          <div
            key={label}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-bold transition-colors ${
              active ? "bg-brand-soft/70 text-brand-strong" : done ? "text-ink" : "text-muted/55"
            }`}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                done ? "bg-success text-card" : active ? "bg-brand-strong text-card" : "bg-line/60 text-muted"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className="flex-1">{`שלב ${i + 1} — ${label}`}</span>
            {active && (
              <motion.span
                aria-hidden
                className="bg-brand-strong h-2 w-2 rounded-full"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.15, 0.8] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
            {done && <span className="text-success text-[12px]">✓</span>}
          </div>
        );
      })}
    </div>
  );
}
