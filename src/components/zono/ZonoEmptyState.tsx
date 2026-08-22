"use client";
// ============================================================================
// ZONO — Empty state for SELECTED meaningful zero-states only (not every empty).
// A good ZONO empty state says what's empty, why that's fine, and the real next
// action. Actions must be REAL: an href (navigation) or an `event` (a window
// CustomEvent the page already handles, e.g. opening Quick-Create) — never a
// no-op. Uses the standard mascot size; the text carries the meaning.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { ZonoMark } from "./ZonoMark";
import type { ZonoState } from "./states";
import { ZICharacter } from "@/components/characters/ZICharacter";
import type { ZIState } from "@/lib/characters/zi-registry";

export interface ZonoEmptyAction { label: string; href?: string; event?: string; primary?: boolean }

export function ZonoEmptyState({ title, description, actions = [], state = "welcome", character, className = "" }: {
  title: string;
  description?: string;
  actions?: ZonoEmptyAction[];
  state?: ZonoState;
  /** Opt-in: render the ZI character (given state) instead of the plain mark. */
  character?: ZIState;
  className?: string;
}) {
  const cls = (primary?: boolean) => primary
    ? "bg-brand inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"
    : "border-line text-ink hover:bg-surface inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-[13px] font-bold transition";
  const fire = (name: string) => { try { window.dispatchEvent(new CustomEvent(name)); } catch { /* noop */ } };

  return (
    <div className={`bg-card border-line flex flex-col items-center gap-3 rounded-[22px] border p-8 text-center shadow-[var(--shadow-card)] ${className}`}>
      {character ? <ZICharacter state={character} size="lg" decorative /> : <ZonoMark size="standard" state={state} />}
      <div>
        <p className="text-ink text-[15px] font-black">{title}</p>
        {description && <p className="text-muted mx-auto mt-1 max-w-sm text-[13px] leading-relaxed">{description}</p>}
      </div>
      {actions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {actions.map((a) => a.href
            ? <Link key={a.label} href={a.href} className={cls(a.primary)}>{a.primary && <Icon name="Plus" size={15} />}{a.label}</Link>
            : <button key={a.label} type="button" onClick={() => a.event && fire(a.event)} className={cls(a.primary)}>{a.primary && <Icon name="Plus" size={15} />}{a.label}</button>)}
        </div>
      )}
    </div>
  );
}
