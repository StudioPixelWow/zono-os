"use client";
// ============================================================================
// ☀️ My Morning Brief™ — "מה השתנה מאז הביקור האחרון?" (presentation only).
// Computes deltas ONLY from already-loaded persisted data vs the last visit
// timestamp (localStorage). It counts real rows — it never fabricates an event.
// If there is no prior visit it falls back to the last 7 days, clearly labelled.
// ============================================================================
import { useEffect, useState } from "react";

const KEY = "zono_intel_last_visit";

interface BriefListing { firstSeenAt: string | null; hasAgent: boolean | null; opportunityScore: number }
interface BriefState { items: { n: number; text: string }[]; label: string }

export function MorningBrief({ listings, priceDrops, activeSignals }: { listings: BriefListing[]; priceDrops: number; activeSignals: number }) {
  // Everything is derived from localStorage + Date (client-only, impure) — so it
  // is computed inside the effect and committed once, not during render.
  const [state, setState] = useState<BriefState | null>(null);

  useEffect(() => {
    let since: string | null = null;
    try { since = localStorage.getItem(KEY); localStorage.setItem(KEY, new Date().toISOString()); } catch { /* storage optional */ }
    const cut = since ? new Date(since).getTime() : Date.now() - 7 * 86_400_000;
    const label = since ? "מאז הביקור האחרון" : "ב-7 הימים האחרונים";
    const recent = listings.filter((l) => l.firstSeenAt && new Date(l.firstSeenAt).getTime() >= cut);
    const items = [
      { n: recent.length, text: "מודעות חדשות" },
      { n: priceDrops, text: "ירידות מחיר" },
      { n: recent.filter((l) => l.opportunityScore >= 70).length, text: "הזדמנויות חדשות (פוטנציאל גבוה)" },
      { n: recent.filter((l) => l.hasAgent === false).length, text: "מודעות חדשות ללא מתווך" },
      { n: activeSignals, text: "אותות שוק פעילים" },
    ].filter((i) => i.n > 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time commit of localStorage-derived client values
    setState({ items, label });
  }, [listings, priceDrops, activeSignals]);

  const items = state?.items ?? [];
  const label = state?.label ?? "מאז הביקור האחרון";

  return (
    <section dir="rtl" className="relative overflow-hidden rounded-2xl border border-brand-light/40 bg-gradient-to-bl from-brand-soft/50 to-transparent p-5 sm:p-6">
      <p className="text-brand text-[11px] font-black tracking-wide">MY MORNING BRIEF™ · {label}</p>
      <h2 className="text-ink mt-0.5 text-xl font-black sm:text-2xl">מה השתנה מאז הביקור האחרון?</h2>
      {items.length ? (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((i, idx) => (
            <li key={idx} className="flex items-baseline gap-2 text-sm">
              <span className="text-brand-strong min-w-[2.5rem] text-2xl font-black tabular-nums">{i.n}</span>
              <span className="text-ink font-bold">{i.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted mt-3 text-sm">אין שינויים חדשים לדווח עליהם {label}.</p>
      )}
    </section>
  );
}
