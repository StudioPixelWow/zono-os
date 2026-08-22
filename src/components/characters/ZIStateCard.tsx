"use client";
// ============================================================================
// ZONO — ZI Character System · <ZIStateCard>. A compact card that pairs a small
// ZI (card-edge) with a title, short message and one real action — for AI
// insights, success confirmations and (real-action) alerts. Tone tints the accent
// only; it never becomes an aggressive red unless the alert is truly critical.
// The character is decorative; the label + text always carry the meaning. An
// optional dismiss lets the broker clear it.
// ============================================================================
import Link from "next/link";
import { X } from "lucide-react";
import { ZICharacter } from "./ZICharacter";
import type { ZIState, ZISize } from "@/lib/characters/zi-registry";

export type ZICardTone = "brand" | "success" | "alert";

const TAG: Record<ZICardTone, string> = {
  brand: "המלצה של ZI",
  success: "ZI",
  alert: "ZI — לתשומת ליבך",
};

export function ZIStateCard({
  state,
  title,
  message,
  action,
  tone = "brand",
  size = "sm",
  label,
  onDismiss,
  className = "",
}: {
  state: ZIState;
  title: string;
  message?: string;
  action?: { label: string; href: string };
  tone?: ZICardTone;
  size?: ZISize;
  label?: string;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div className={`zi-card zi-card--${tone} ${className}`}>
      <ZICharacter state={state} size={size} placement="card-edge" decorative />
      <div className="zi-card__body">
        <span className="zi-card__tag">{label ?? TAG[tone]}</span>
        <p className="zi-card__title">{title}</p>
        {message && <p className="zi-card__msg">{message}</p>}
        {action && <Link href={action.href} className="zi-card__cta">{action.label}</Link>}
      </div>
      {onDismiss && (
        <button type="button" className="zi-card__x" onClick={onDismiss} aria-label="סגור">
          <X size={15} />
        </button>
      )}
    </div>
  );
}
