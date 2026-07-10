"use client";
// ============================================================================
// ZONO Command Center — "ZONO ממליץ עכשיו".
// Consumes the SINGLE shared Broker-Intelligence priority queue (same source as
// Home V3 / Daily OS / Today / Attention Center / Executive OS) — NOT a separate
// suggestion model. Live, deduped, evidence-based recommendations in priority
// order. When intelligence is still assembling (or the DB isn't connected yet),
// falls back to the neutral, data-honest static hints — never a fabricated number.
// ============================================================================
import { useEffect, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { AI_SUGGESTIONS } from "./commandRegistry";
import { brokerQueueSuggestionsAction, type QueueSuggestion } from "@/lib/broker-intelligence/actions";

// Map queue urgency → the existing priority chip styling.
const URGENCY_CHIP: Record<QueueSuggestion["urgency"], { label: string; cls: string }> = {
  critical: { label: "קריטי", cls: "bg-rose-500/15 text-rose-300 border-rose-400/20" },
  high: { label: "עדיפות גבוהה", cls: "bg-rose-500/15 text-rose-300 border-rose-400/20" },
  medium: { label: "מומלץ", cls: "bg-amber-500/15 text-amber-200 border-amber-400/20" },
  low: { label: "לעיון", cls: "bg-violet-500/15 text-violet-200 border-violet-400/20" },
};

const STATIC_CHIP: Record<string, { label: string; cls: string }> = {
  high: { label: "עדיפות גבוהה", cls: "bg-rose-500/15 text-rose-300 border-rose-400/20" },
  medium: { label: "מומלץ", cls: "bg-amber-500/15 text-amber-200 border-amber-400/20" },
  info: { label: "לעיון", cls: "bg-violet-500/15 text-violet-200 border-violet-400/20" },
};

export function AISuggestions({ onGoHref }: { onGoHref: (href: string, label: string) => void }) {
  const [live, setLive] = useState<QueueSuggestion[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await brokerQueueSuggestionsAction({ limit: 4 });
        if (alive) setLive(rows);
      } catch {
        if (alive) setLive([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const hasLive = (live?.length ?? 0) > 0;

  return (
    <section aria-label="המלצות ZONO" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-violet-500/20 text-violet-300"><Icon name="Sparkles" size={14} /></span>
        <p className="text-sm font-black text-white">ZONO ממליץ עכשיו</p>
        {loading && <span className="text-[11px] font-medium text-white/40">טוען מהתור החכם…</span>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {hasLive
          ? live!.map((s) => {
              const p = URGENCY_CHIP[s.urgency];
              return (
                <div key={s.id} className="group flex flex-col gap-2 rounded-2xl border border-violet-400/15 bg-white/[0.04] p-4 transition hover:border-violet-400/35 hover:bg-white/[0.07]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200"><Icon name="Sparkles" size={16} /></span>
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${p.cls}`}>{p.label}</span>
                  </div>
                  <p className="text-sm font-bold leading-snug text-white">{s.title}</p>
                  <p className="text-xs leading-relaxed text-white/55">{s.why}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-white/45">
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5">ביטחון {s.confidence}%</span>
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5">{s.sourceCount} מקורות ראיה</span>
                    {s.mergedCount > 1 && <span className="rounded-md bg-white/5 px-1.5 py-0.5">{s.mergedCount} מנועים תואמים</span>}
                  </div>
                  <button type="button" onClick={() => onGoHref(s.href, s.title)} className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-violet-200 transition hover:bg-violet-500/20 hover:text-white">
                    {s.suggestedAction} <Icon name="ChevronLeft" size={13} />
                  </button>
                </div>
              );
            })
          : AI_SUGGESTIONS.map((s) => {
              const p = STATIC_CHIP[s.priority];
              return (
                <div key={s.id} className="group flex flex-col gap-2 rounded-2xl border border-violet-400/15 bg-white/[0.04] p-4 transition hover:border-violet-400/35 hover:bg-white/[0.07]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200"><Icon name={s.icon} size={16} /></span>
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${p.cls}`}>{p.label}</span>
                  </div>
                  <p className="text-sm font-bold leading-snug text-white">{s.title}</p>
                  <p className="text-xs leading-relaxed text-white/55">{s.detail}</p>
                  <button type="button" onClick={() => onGoHref(s.href, s.title)} className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-violet-200 transition hover:bg-violet-500/20 hover:text-white">
                    {s.cta} <Icon name="ChevronLeft" size={13} />
                  </button>
                </div>
              );
            })}
      </div>

      <p className="text-[11px] text-white/35">
        {hasLive
          ? "ההמלצות מגיעות מהתור החכם המשותף — מדורגות לפי השפעה עסקית, מאוחדות וללא כפילויות."
          : "בדיקה זמינה לאחר חיבור נתונים מלא — ההמלצות מתעדכנות לפי המאגר הפעיל שלך."}
      </p>
    </section>
  );
}
