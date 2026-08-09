"use client";
import { useState } from "react";

/** Ephemeral favorite toggle on a property card (local, session-only — no
 *  persistence, no tracking). Purely a browsing affordance; keyboard + aria safe. */
export function FavoriteButton({ label }: { label: string }) {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOn((v) => !v); }}
      className="absolute start-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-[color:var(--brand-primary)] shadow-sm backdrop-blur transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]"
    >
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" width={18} height={18} fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
        <path d="M12 21s-7.5-4.9-10-9.3C.4 8.4 2 5 5.2 5c2 0 3.3 1.1 4 2.3C10 6.1 11.2 5 13.2 5 16.5 5 18 8.4 16.4 11.7 14.5 16.1 12 21 12 21z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
