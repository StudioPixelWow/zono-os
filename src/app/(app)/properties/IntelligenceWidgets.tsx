"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import type { IntelBoardItem, IntelligenceBoard } from "@/lib/intelligence/service";

type Tone = "danger" | "warning" | "brand";
const TONE: Record<Tone, { icon: string; ring: string; count: string }> = {
  danger: { icon: "bg-danger-soft text-danger", ring: "border-danger/30", count: "text-danger" },
  warning: { icon: "bg-warning-soft text-warning", ring: "border-warning/30", count: "text-warning" },
  brand: { icon: "bg-brand-soft text-brand", ring: "border-brand-light", count: "text-brand-strong" },
};

function Widget({
  tone,
  icon,
  title,
  empty,
  items,
}: {
  tone: Tone;
  icon: string;
  title: string;
  empty: string;
  items: IntelBoardItem[];
}) {
  const t = TONE[tone];
  return (
    <div className={cn("bg-card flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]", t.ring)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("grid h-9 w-9 place-items-center rounded-xl", t.icon)}>
            <Icon name={icon} size={18} />
          </span>
          <p className="text-ink text-sm font-extrabold">{title}</p>
        </div>
        <span className={cn("text-2xl font-black", t.count)}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-muted py-3 text-center text-xs">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.slice(0, 4).map((it, i) => (
            <li key={`${it.propertyId}-${i}`}>
              <Link
                href={`/properties/${it.propertyId}`}
                className="hover:bg-surface flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 transition"
              >
                <span className="text-ink min-w-0 flex-1 truncate text-sm font-semibold">{it.title}</span>
                <span className="text-muted shrink-0 text-[11px] font-semibold">{it.meta}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function IntelligenceWidgets({ board }: { board: IntelligenceBoard }) {
  if (board.total === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Widget tone="danger" icon="AlertTriangle" title="ציון בריאות נמוך" empty="כל הנכסים בריאים ✓" items={board.lowHealth} />
      <Widget tone="warning" icon="Shield" title="דורשים עדכון מוכר" empty="כל המוכרים מעודכנים ✓" items={board.sellerUpdate} />
      <Widget tone="brand" icon="Clock" title="הצעות יומן קרובות" empty="אין הצעות יומן" items={board.upcomingCalendar} />
    </div>
  );
}
