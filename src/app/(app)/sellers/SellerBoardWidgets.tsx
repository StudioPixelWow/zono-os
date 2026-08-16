"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { IconSurface, type Accent } from "@/components/ui/action-surfaces";
import type { SellerBoard, SellerBoardItem } from "@/lib/seller-intelligence/service";

type Tone = "danger" | "warning" | "brand" | "success";
const TONE_ACCENT: Record<Tone, Accent> = { danger: "danger", warning: "warn", brand: "brand", success: "success" };
const TONE: Record<Tone, { icon: string; ring: string; count: string }> = {
  danger: { icon: "bg-danger-soft text-danger", ring: "border-danger/30", count: "text-danger" },
  warning: { icon: "bg-warning-soft text-warning", ring: "border-warning/30", count: "text-warning" },
  brand: { icon: "bg-brand-soft text-brand", ring: "border-brand-light", count: "text-brand-strong" },
  success: { icon: "bg-success-soft text-success", ring: "border-success/30", count: "text-success" },
};

function Widget({ tone, icon, title, empty, items }: { tone: Tone; icon: string; title: string; empty: string; items: SellerBoardItem[] }) {
  const t = TONE[tone];
  return (
    <div className={cn("bg-card flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]", t.ring)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconSurface name={icon} tier="s" accent={TONE_ACCENT[tone]} variant="soft" />
          <p className="text-ink text-sm font-extrabold">{title}</p>
        </div>
        <span className={cn("text-2xl font-black", t.count)}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-muted py-3 text-center text-xs">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.slice(0, 4).map((it, i) => (
            <li key={`${it.sellerId}-${i}`}>
              <Link href={`/sellers/${it.sellerId}`} className="hover:bg-surface flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 transition">
                <span className="text-ink min-w-0 flex-1 truncate text-sm font-semibold">{it.name}</span>
                <span className="text-muted shrink-0 text-[11px] font-semibold">{it.meta}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SellerBoardWidgets({ board }: { board: SellerBoard }) {
  if (board.total === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Widget tone="danger" icon="AlertTriangle" title="מוכרים הדורשים טיפול" empty="הכול מטופל ✓" items={board.needingAttention} />
      <Widget tone="danger" icon="TrendingDown" title="סיכון נטישה גבוה" empty="אין סיכון גבוה" items={board.highChurn} />
      <Widget tone="warning" icon="Shield" title="אמון נמוך" empty="כל המוכרים באמון תקין" items={board.lowTrust} />
      <Widget tone="warning" icon="Clock" title="מוכרים ללא קשר" empty="כל המוכרים בקשר" items={board.noContact} />
      <Widget tone="brand" icon="Route" title="התחייבויות קרובות" empty="אין התחייבויות פתוחות" items={board.upcomingCommitments} />
      <Widget tone="success" icon="TrendingUp" title="שינויי אמון" empty="אין שינויי אמון" items={board.trustChanges} />
    </div>
  );
}
