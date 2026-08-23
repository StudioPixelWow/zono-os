"use client";
import { useState } from "react";
import { PublicIcon } from "@/components/public-site/PublicIcon";

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
      {on
        ? <PublicIcon name="heart" size="button" />
        : <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden><path d="M12 21s-7-4.4-9.5-8.5C.7 9.3 2 6 5.2 6c1.9 0 3 1 3.8 2 .8-1 1.9-2 3.8-2 3.2 0 4.5 3.3 2.7 6.5C19 16.6 12 21 12 21Z" strokeLinejoin="round" /></svg>}
    </button>
  );
}
