"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { eventIcon } from "@/lib/activity/types";
import type { ActivityBoard, ActivityBoardItem } from "@/lib/activity/service";

const cardCls = "bg-card border-line flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]";

function Header({ icon, title, tone }: { icon: string; title: string; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("grid h-9 w-9 place-items-center rounded-xl", tone)}>
        <Icon name={icon} size={18} />
      </span>
      <p className="text-ink text-sm font-extrabold">{title}</p>
    </div>
  );
}

function LinkList({ items, empty }: { items: ActivityBoardItem[]; empty: string }) {
  if (items.length === 0) return <p className="text-muted py-3 text-center text-xs">{empty}</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.slice(0, 4).map((it, i) => {
        const inner = (
          <span className="hover:bg-surface flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 transition">
            <span className="text-ink min-w-0 flex-1 truncate text-sm font-semibold">{it.title}</span>
            <span className="text-muted shrink-0 text-[11px] font-semibold">{it.meta}</span>
          </span>
        );
        return (
          <li key={`${it.propertyId}-${i}`}>
            {it.propertyId ? <Link href={`/properties/${it.propertyId}`}>{inner}</Link> : inner}
          </li>
        );
      })}
    </ul>
  );
}

export function ActivityWidgets({ board }: { board: ActivityBoard }) {
  if (board.total === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Recent activity */}
      <div className={cardCls}>
        <Header icon="Sparkles" title="פעילות אחרונה" tone="bg-brand-soft text-brand" />
        {board.recent.length === 0 ? (
          <p className="text-muted py-3 text-center text-xs">אין פעילות עדיין</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {board.recent.slice(0, 4).map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <span className="bg-surface text-brand grid h-6 w-6 shrink-0 place-items-center rounded-lg">
                  <Icon name={eventIcon(e.event_type)} size={12} />
                </span>
                <span className="text-ink min-w-0 flex-1 truncate text-xs font-semibold">{e.title}</span>
                <span className="text-muted shrink-0 text-[10px]">
                  {new Date(e.occurred_at).toLocaleDateString("he-IL")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Properties with no activity */}
      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <Header icon="Clock" title="נכסים ללא פעילות" tone="bg-danger-soft text-danger" />
          <span className="text-danger text-2xl font-black">{board.noActivity.length}</span>
        </div>
        <LinkList items={board.noActivity} empty="כל הנכסים פעילים ✓" />
      </div>

      {/* Tasks completed today */}
      <div className={cardCls}>
        <Header icon="UserCheck" title="משימות שהושלמו היום" tone="bg-success-soft text-success" />
        <div className="flex flex-1 items-center justify-center py-3">
          <span className="text-success text-5xl font-black">{board.tasksCompletedToday}</span>
        </div>
      </div>

      {/* Upcoming meetings */}
      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <Header icon="Clock" title="פגישות קרובות" tone="bg-brand-soft text-brand" />
          <span className="text-brand-strong text-2xl font-black">{board.upcomingMeetings.length}</span>
        </div>
        <LinkList items={board.upcomingMeetings} empty="אין פגישות מתוזמנות" />
      </div>
    </div>
  );
}
