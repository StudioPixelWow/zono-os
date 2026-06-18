"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { buyerBudgetLine, type BuyerRow } from "@/lib/buyers/labels";
import type { BuyerBoard } from "@/lib/buyers/repository";

type Tone = "brand" | "danger" | "warning" | "success";

const TONE: Record<Tone, { icon: string; ring: string; count: string }> = {
  brand: { icon: "bg-brand-soft text-brand", ring: "border-brand-light", count: "text-brand-strong" },
  danger: { icon: "bg-danger-soft text-danger", ring: "border-danger/30", count: "text-danger" },
  warning: { icon: "bg-warning-soft text-warning", ring: "border-warning/30", count: "text-warning" },
  success: { icon: "bg-success-soft text-success", ring: "border-success/30", count: "text-success" },
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
  items: BuyerRow[];
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
          {items.slice(0, 4).map((b) => (
            <li key={b.id}>
              <Link
                href={`/buyers/${b.id}`}
                className="hover:bg-surface flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 transition"
              >
                <span className="text-ink min-w-0 flex-1 truncate text-sm font-semibold">
                  {b.full_name}
                </span>
                <span className="text-muted shrink-0 text-[11px] font-semibold">
                  {buyerBudgetLine(b)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BuyerBoardWidgets({ board }: { board: BuyerBoard }) {
  if (board.total === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Widget
        tone="brand"
        icon="Sparkles"
        title="קונים חדשים"
        empty="אין קונים חדשים השבוע"
        items={board.newBuyers}
      />
      <Widget
        tone="danger"
        icon="Clock"
        title="דורשים מעקב"
        empty="הכול במעקב ✓"
        items={board.followUp}
      />
      <Widget
        tone="warning"
        icon="AlertTriangle"
        title="חסרות העדפות"
        empty="לכל הקונים יש העדפות ✓"
        items={board.missingPreferences}
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
