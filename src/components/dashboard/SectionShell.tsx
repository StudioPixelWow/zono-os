"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Reveal } from "./motion";

interface SectionShellProps {
  title: string;
  /** Optional small label above the title. */
  eyebrow?: string;
  /** "הצג הכל" style label. Only rendered when actionHref or onAction is set. */
  actionLabel?: string;
  /** Destination for the action — renders a real link (preferred). */
  actionHref?: string;
  onAction?: () => void;
  children: ReactNode;
  className?: string;
  /** When true the body is not wrapped in a card padding container. */
  bare?: boolean;
}

/** Consistent section wrapper: heading row + scroll-reveal animation. */
export function SectionShell({
  title,
  eyebrow,
  actionLabel = "הצג הכל",
  actionHref,
  onAction,
  children,
  className,
}: SectionShellProps) {
  const actionCls = "text-brand hover:text-brand-strong shrink-0 text-sm font-bold transition-colors";
  return (
    <Reveal className={cn("scroll-mt-24", className)}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          {eyebrow && (
            <p className="text-brand mb-1 text-xs font-bold tracking-wide">
              {eyebrow}
            </p>
          )}
          <h2 className="text-ink text-lg font-extrabold sm:text-xl">{title}</h2>
        </div>
        {actionHref ? (
          <Link href={actionHref} className={actionCls}>{actionLabel} ←</Link>
        ) : onAction ? (
          <button type="button" onClick={onAction} className={actionCls}>{actionLabel}</button>
        ) : null}
      </div>
      {children}
    </Reveal>
  );
}
