"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { STAGE_DEFS } from "@/lib/journey/stages";
import type { JourneyBoard, JourneyItem } from "@/lib/journey/repository";

type Tone = "brand" | "danger" | "success";

const TONE: Record<
  Tone,
  { icon: string; ring: string; chip: string; count: string }
> = {
  brand: {
    icon: "bg-brand-soft text-brand",
    ring: "border-brand-light",
    chip: "bg-brand-soft text-brand-strong",
    count: "text-brand-strong",
  },
  danger: {
    icon: "bg-danger-soft text-danger",
    ring: "border-danger/30",
    chip: "bg-danger-soft text-danger",
    count: "text-danger",
  },
  success: {
    icon: "bg-success-soft text-success",
    ring: "border-success/30",
    chip: "bg-success-soft text-success",
    count: "text-success",
  },
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
  items: JourneyItem[];
}) {
  const t = TONE[tone];
  return (
    <div
      className={cn(
        "bg-card flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]",
        t.ring,
      )}
    >
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
          {items.slice(0, 4).map(({ journey, property }) => (
            <li key={journey.id}>
              <Link
                href={`/properties/${property.id}`}
                className="hover:bg-surface flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 transition"
              >
                <span className="text-ink min-w-0 flex-1 truncate text-sm font-semibold">
                  {property.title}
                </span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", t.chip)}>
                  {STAGE_DEFS[journey.current_stage].short}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function JourneyBoardWidgets({ board }: { board: JourneyBoard }) {
  if (board.total === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Widget
        tone="brand"
        icon="AlertTriangle"
        title="נכסים הדורשים פעולה"
        empty="הכול מטופל ✓"
        items={board.needingAction}
      />
      <Widget
        tone="danger"
        icon="Clock"
        title="נכסים תקועים"
        empty="אין נכסים תקועים"
        items={board.stalled}
      />
      <Widget
        tone="success"
        icon="TrendingUp"
        title="עודכנו לאחרונה"
        empty="אין עדכונים אחרונים"
        items={board.recentlyUpdated}
      />
    </div>
  );
}
