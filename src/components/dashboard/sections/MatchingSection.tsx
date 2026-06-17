"use client";

import { buyerMatches, matchingNote } from "@/data/mock";
import { Icon } from "../Icon";
import { SectionShell } from "../SectionShell";
import { motion } from "../motion";

function ScoreRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg width={64} height={64} className="-rotate-90">
        <circle cx={32} cy={32} r={r} fill="none" strokeWidth={6} className="text-line" stroke="currentColor" />
        <circle
          cx={32}
          cy={32}
          r={r}
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          className="text-brand"
          stroke="currentColor"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <span className="text-brand-strong absolute inset-0 grid place-items-center text-sm font-black">
        {score}%
      </span>
    </div>
  );
}

export function MatchingSection() {
  return (
    <SectionShell title="התאמות חכמות" eyebrow="AI Matching">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {buyerMatches.map((m, i) => (
          <motion.article
            key={m.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.45 }}
            whileHover={{ y: -4 }}
            className="bg-card border-line flex flex-col gap-4 rounded-[24px] border p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
          >
            <div className="flex items-center gap-3">
              <div className="from-brand to-brand-light grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-base font-black text-white">
                {m.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-ink truncate text-base font-extrabold">{m.name}</h3>
                <p className="text-muted text-xs font-semibold">{m.budgetLabel}</p>
              </div>
              <ScoreRing score={m.score} />
            </div>

            <div className="bg-surface rounded-2xl p-3">
              <p className="text-muted text-xs">{m.want}</p>
              <p className="text-ink mt-1 flex items-center gap-1.5 text-sm font-bold">
                <Icon name="Building2" size={15} className="text-brand" />
                {m.property}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {m.reasons.map((r) => (
                <span
                  key={r}
                  className="bg-brand-soft text-brand-strong rounded-full px-2.5 py-1 text-[11px] font-bold"
                >
                  ✓ {r}
                </span>
              ))}
            </div>

            <button className="bg-brand hover:bg-brand-strong mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition">
              <Icon name="Send" size={16} />
              שלח תיק נכס
            </button>
          </motion.article>
        ))}
      </div>

      <div className="text-muted mt-4 flex items-center gap-2 text-xs font-medium">
        <Icon name="Sparkles" size={14} className="text-brand" />
        {matchingNote}
      </div>
    </SectionShell>
  );
}
