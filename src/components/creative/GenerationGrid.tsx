"use client";
import { motion } from "framer-motion";

/** Live 16-card generation grid. Cards fill in, then show scores, then the top 4
 *  glow ("נבחרה") while the rest dim. Driven by the parent's simulated/real state. */
export function GenerationGrid({
  generated, scored, scores, topSet, finalPhase,
}: {
  generated: number;            // how many of 16 are "generated"
  scored: boolean;              // show wow-score badges
  scores: number[];             // 16 pseudo wow scores
  topSet: Set<number>;          // indices of the 4 winners
  finalPhase: boolean;          // highlight winners + dim rejected
}) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
      {scores.map((sc, i) => {
        const isGen = i < generated;
        const isTop = finalPhase && topSet.has(i);
        const isRejected = finalPhase && !topSet.has(i);
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0.4, scale: 0.94 }}
            animate={{ opacity: isRejected ? 0.4 : 1, scale: isTop ? 1.02 : 1 }}
            transition={{ duration: 0.35 }}
            className={`relative aspect-[4/5] overflow-hidden rounded-lg border ${
              isTop ? "border-brand-strong ring-brand-strong/40 shadow-[0_0_18px_rgba(124,58,237,0.45)] ring-2" : "border-line/50"
            } ${isGen ? "bg-surface" : "bg-line/20"}`}
          >
            {/* image area */}
            <div className={`h-[55%] w-full ${isGen ? "bg-gradient-to-br from-brand-soft/60 to-line/40" : "bg-line/30 animate-pulse"}`} />
            {/* content lines */}
            <div className="flex flex-col gap-1 p-1.5">
              <div className={`h-1.5 w-[85%] rounded-full ${isGen ? "bg-ink/70" : "bg-line/50"}`} />
              <div className={`h-1.5 w-[60%] rounded-full ${isGen ? "bg-ink/40" : "bg-line/40"}`} />
              <div className={`mt-0.5 h-2 w-[45%] rounded-full ${isGen ? "bg-brand-strong/70" : "bg-line/40"}`} />
            </div>
            {/* wow badge */}
            {scored && isGen && (
              <span className={`absolute right-1 top-1 rounded-md px-1 py-0.5 text-[8px] font-black ${isTop ? "bg-brand-strong text-card" : "bg-ink/70 text-card"}`}>{sc}</span>
            )}
            {/* winner label */}
            {isTop && (
              <motion.span
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="bg-brand-strong text-card absolute bottom-1 left-1 rounded-md px-1.5 py-0.5 text-[8px] font-black"
              >
                נבחרה
              </motion.span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
