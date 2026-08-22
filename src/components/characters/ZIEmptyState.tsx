"use client";
// ============================================================================
// ZONO — ZI Character System · <ZIEmptyState>. A full, centred empty state for a
// meaningful zero-state (no properties / buyers / matches / …). Always carries a
// clear title, a short reassuring line, and a REAL primary action — the character
// supports the message, never replaces it. Actions are real: an href (navigation)
// or an `event` (a window CustomEvent the page already handles, e.g. Quick-Create).
// ============================================================================
import Link from "next/link";
import { ZICharacter } from "./ZICharacter";
import type { ZIState, ZISize } from "@/lib/characters/zi-registry";

export interface ZIEmptyAction { label: string; href?: string; event?: string; primary?: boolean }

export function ZIEmptyState({
  title,
  message,
  state = "empty",
  size = "lg",
  actions = [],
  className = "",
}: {
  title: string;
  message?: string;
  state?: ZIState;
  size?: ZISize;
  actions?: ZIEmptyAction[];
  className?: string;
}) {
  const fire = (name: string) => { try { window.dispatchEvent(new CustomEvent(name)); } catch { /* noop */ } };
  const cls = (primary?: boolean) => primary ? "zi-empty__cta zi-empty__cta--primary" : "zi-empty__cta";

  return (
    <div className={`zi-empty ${className}`}>
      <ZICharacter state={state} size={size} decorative />
      <div className="zi-empty__body">
        <p className="zi-empty__title">{title}</p>
        {message && <p className="zi-empty__msg">{message}</p>}
      </div>
      {actions.length > 0 && (
        <div className="zi-empty__actions">
          {actions.map((a) => a.href
            ? <Link key={a.label} href={a.href} className={cls(a.primary)}>{a.label}</Link>
            : <button key={a.label} type="button" onClick={() => a.event && fire(a.event)} className={cls(a.primary)}>{a.label}</button>)}
        </div>
      )}
    </div>
  );
}
