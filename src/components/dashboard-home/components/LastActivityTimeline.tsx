"use client";

import { Icon } from "@/components/dashboard/Icon";
import type { ActivityEvent } from "@/lib/dashboard-home/types";
import { SectionHead, type Translate } from "./shared";

/** "פעילות אחרונה" — full-width horizontal timeline cards at the bottom. */
export function LastActivityTimeline({ t, activity }: { t: Translate; activity: ActivityEvent[] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHead title={t("recentActivity.title")} />
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-5 lg:overflow-visible">
        {activity.map((a) => (
          <div key={a.id} className="bg-card border-line flex min-w-[210px] shrink-0 flex-col gap-2 rounded-[20px] border p-4 shadow-[var(--shadow-soft)] lg:min-w-0">
            <div className="flex items-center justify-between">
              <span className="bg-brand-soft text-brand-strong grid h-9 w-9 place-items-center rounded-xl"><Icon name={a.icon} size={15} /></span>
              <span className="text-muted text-[11px]">{a.time}</span>
            </div>
            <p className="text-ink text-[13px] font-bold leading-snug">{t(a.detailKey)}</p>
            <p className="text-muted truncate text-[11px]">{a.entity}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
