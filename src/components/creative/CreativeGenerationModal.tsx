"use client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AICanvasAnimation } from "./AICanvasAnimation";
import { CreativePipeline, PIPELINE_STEPS } from "./CreativePipeline";
import { CreativeStatusTicker, TICKER_MESSAGES } from "./CreativeStatusTicker";
import { QualityCounters } from "./QualityCounters";
import { GenerationGrid } from "./GenerationGrid";

/**
 * Premium "ZONO Creative Engine" waiting experience for the post-generation flow.
 * The visual timeline is SIMULATED so the modal feels alive, but the final
 * "ready" state only appears once `complete` (the real backend response) is true.
 * It never fakes completion — if the backend is slow it holds near the end and
 * keeps rotating reassuring messages.
 */
export function CreativeGenerationModal({ complete, onView }: { complete: boolean; onView: () => void }) {
  const [t, setT] = useState(0);              // simulated progress 0..1 (held ≤0.92 until complete)
  const [tick, setTick] = useState(0);        // rotating ticker index
  const startedComplete = useRef(false);

  // 16 deterministic pseudo Wow scores + the 4 winners.
  const { scores, topSet } = useMemo(() => {
    const s = Array.from({ length: 16 }, (_, i) => 72 + ((i * 37 + 13) % 27)); // 72..98
    const order = [...s.keys()].sort((a, b) => s[b] - s[a]);
    return { scores: s, topSet: new Set(order.slice(0, 4)) };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setT((p) => Math.min(p + 0.01, 0.92)), 220);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setTick((p) => (p + 1) % TICKER_MESSAGES.length), 3500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { if (complete) startedComplete.current = true; }, [complete]);

  const final = complete;
  const tt = final ? 1 : t;
  const generated = final ? 16 : Math.min(16, Math.round((tt / 0.6) * 16));
  const scored = final || tt >= 0.7;
  const rejected = final ? 12 : tt >= 0.72 ? Math.min(12, Math.round(((tt - 0.72) / 0.18) * 12)) : 0;
  const finalists = final ? 4 : 0;
  const activeStep = final ? PIPELINE_STEPS.length : tt < 0.1 ? 0 : tt < 0.2 ? 1 : tt < 0.6 ? 2 : tt < 0.72 ? 3 : tt < 0.85 ? 4 : 5;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4 backdrop-blur-sm">
      <motion.div
        dir="rtl"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="bg-card relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl p-5 shadow-2xl sm:p-6"
      >
        <AICanvasAnimation />
        <div className="relative">
          {/* header */}
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <span className="bg-brand-strong text-card grid h-7 w-7 place-items-center rounded-lg text-[13px] font-black">Z</span>
              <h3 className="text-ink text-xl font-black">ZONO Creative Engine</h3>
            </div>
            <p className="text-muted mt-1 text-sm font-bold">יוצר את 4 הגרסאות החזקות ביותר עבור הנכס שלך</p>
          </div>

          {/* desktop: pipeline + status side by side; mobile: stacked */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-line/50 bg-surface/40 rounded-2xl border p-3">
              <CreativePipeline activeStep={activeStep} />
            </div>
            <div className="border-line/50 bg-surface/40 flex flex-col gap-3 rounded-2xl border p-3">
              {final ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-2 text-center">
                  <motion.p initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-ink text-lg font-black">הגרסאות המנצחות מוכנות</motion.p>
                  <p className="text-brand-strong text-2xl font-black">🏆 4 מודעות נבחרו</p>
                </div>
              ) : (
                <CreativeStatusTicker message={TICKER_MESSAGES[tick]} />
              )}
              <QualityCounters generated={generated} rejected={rejected} finalists={finalists} />
            </div>
          </div>

          {/* live 16-card grid */}
          <div className="mt-4">
            <GenerationGrid generated={generated} scored={scored} scores={scores} topSet={topSet} finalPhase={final} />
          </div>

          {/* footer */}
          <p className="text-muted mt-4 text-center text-[11px] font-bold">המערכת מייצרת ומדרגת עשרות אפשרויות כדי להציג רק את הטובות ביותר.</p>

          <AnimatePresence>
            {final && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex justify-center">
                <button onClick={onView} className="bg-brand-strong text-card rounded-full px-7 py-2.5 text-sm font-black shadow-lg transition-transform hover:scale-[1.02]">
                  צפה בתוצאות
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
