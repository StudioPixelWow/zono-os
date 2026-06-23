"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AICanvasAnimation } from "./AICanvasAnimation";
import { CreativePipeline, PIPELINE_STEPS } from "./CreativePipeline";
import { CreativeStatusTicker, TICKER_MESSAGES } from "./CreativeStatusTicker";
import { QualityCounters } from "./QualityCounters";
import { CreativeConceptGrid, CONCEPTS } from "./CreativeConceptGrid";
import { FinalAdsSkeleton } from "./FinalAdsSkeleton";

/**
 * Premium "ZONO Creative Engine" waiting experience.
 *
 * New 12→2 flow: explore 12 text-level concepts → rank by Wow → Hebrew QA →
 * select the 2 strongest → generate ONLY 2 final image ads.
 *
 * The concept timeline (12 cards, scoring, selection) is SIMULATED so the modal
 * feels alive. But the FINAL ADS area is gated on the real backend response:
 * the 2 skeleton cards keep pulsing until `complete` (the real image-generation
 * response) is true. We never fake final completion.
 */
export function CreativeGenerationModal({ complete, onView }: { complete: boolean; onView: () => void }) {
  const [t, setT] = useState(0); // simulated concept progress 0..1 (held ≤0.92 until complete)
  const [tick, setTick] = useState(0); // rotating ticker index
  const startedComplete = useRef(false);

  // 12 deterministic pseudo Wow scores + QA risk + the 2 selected winners.
  const { scores, qaRisk, selectedSet } = useMemo(() => {
    const s = Array.from({ length: CONCEPTS.length }, (_, i) => 72 + ((i * 37 + 13) % 27)); // 72..98
    const risk: ("low" | "medium" | "high")[] = s.map((v) => (v >= 90 ? "low" : v >= 82 ? "medium" : "high"));
    const order = [...s.keys()].sort((a, b) => s[b] - s[a]);
    return { scores: s, qaRisk: risk, selectedSet: new Set(order.slice(0, 2)) };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setT((p) => Math.min(p + 0.01, 0.92)), 200);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setTick((p) => (p + 1) % TICKER_MESSAGES.length), 3200);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (complete) startedComplete.current = true;
  }, [complete]);

  const final = complete;
  const tt = final ? 1 : t;

  // Concept simulation (cheap, text-level). Final-ad readiness is NOT simulated.
  const generated = final ? 12 : Math.min(12, Math.round((tt / 0.45) * 12));
  const scored = final || tt >= 0.55;
  const selectPhase = final || tt >= 0.78;
  const rejected = selectPhase ? 10 : 0;
  const selectedCount = selectPhase ? 2 : 0;
  const finalAdsCount = final ? 2 : 0;
  const activeStep = final
    ? PIPELINE_STEPS.length
    : tt < 0.1
      ? 0
      : tt < 0.45
        ? 1
        : tt < 0.62
          ? 2
          : tt < 0.78
            ? 3
            : tt < 0.92
              ? 4
              : 5; // holds at "יצירת 2 מודעות סופיות" until the real response arrives

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
            <p className="text-muted mt-1 text-sm font-bold">בוחן 12 רעיונות ומפיק את 2 המודעות החזקות ביותר עבור הנכס שלך</p>
          </div>

          {/* desktop: pipeline + status side by side; mobile: stacked */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-line/50 bg-surface/40 rounded-2xl border p-3">
              <CreativePipeline activeStep={activeStep} />
            </div>
            <div className="border-line/50 bg-surface/40 flex flex-col gap-3 rounded-2xl border p-3">
              {final ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-2 text-center">
                  <motion.p initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-ink text-lg font-black">
                    הגרסאות המנצחות מוכנות
                  </motion.p>
                  <p className="text-brand-strong text-2xl font-black">🏆 2 מודעות נבחרו</p>
                </div>
              ) : (
                <CreativeStatusTicker message={TICKER_MESSAGES[tick]} />
              )}
              <QualityCounters
                items={[
                  { value: generated, label: "רעיונות נוצרו", tone: "text-ink" },
                  { value: rejected, label: "נפסלו בבקרת איכות", tone: "text-danger" },
                  { value: selectedCount, label: "נבחרו להפקה", tone: "text-brand-strong" },
                  { value: finalAdsCount, label: "מודעות סופיות נוצרות", tone: "text-success" },
                ]}
              />
            </div>
          </div>

          {/* live 12 concept-card grid (text-level strategy, NOT images) */}
          <div className="mt-4">
            <CreativeConceptGrid
              generated={generated}
              scored={scored}
              scores={scores}
              qaRisk={qaRisk}
              selectedSet={selectedSet}
              selectPhase={selectPhase}
            />
          </div>

          {/* final ads area — 2 large skeletons, gated on the REAL backend response */}
          {selectPhase && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="border-line/50 mt-4 rounded-2xl border border-dashed p-3.5">
              <FinalAdsSkeleton complete={final} />
            </motion.div>
          )}

          {/* footer */}
          <p className="text-muted mt-4 text-center text-[11px] font-bold">
            המערכת בוחנת 12 רעיונות, מדרגת ומסננת — ומפיקה רק את 2 המודעות הסופיות הטובות ביותר.
          </p>

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
