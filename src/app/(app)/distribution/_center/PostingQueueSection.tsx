"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DailyWorkspace } from "@/lib/distribution/service";
import { cn } from "@/lib/utils";
import { Glass, SectionHeading, EmptyState, Chip, Icon, compact } from "./shared";

type Item = DailyWorkspace["items"][number];
type Bucket = "upcoming" | "progress" | "completed" | "failed";

const BUCKET_OF: Record<string, Bucket> = {
  pending: "upcoming", copied: "progress", community_opened: "progress",
  manual_published: "completed", skipped: "failed", failed: "failed",
};
const TABS: { key: Bucket; label: string; icon: string }[] = [
  { key: "upcoming", label: "מתוכננים", icon: "Clock" },
  { key: "progress", label: "בתהליך", icon: "Loader" },
  { key: "completed", label: "הושלמו", icon: "CheckCircle2" },
  { key: "failed", label: "נכשלו / דולגו", icon: "AlertTriangle" },
];

export function PostingQueueSection({ daily }: { daily: DailyWorkspace }) {
  const [tab, setTab] = useState<Bucket>("upcoming");
  const grouped = useMemo(() => {
    const g: Record<Bucket, Item[]> = { upcoming: [], progress: [], completed: [], failed: [] };
    for (const it of daily.items) g[BUCKET_OF[it.status] ?? "upcoming"].push(it);
    return g;
  }, [daily.items]);

  const list = grouped[tab];

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="תור פרסום" subtitle="מחזור ההפצה היומי — מתוכננים, בתהליך, הושלמו וכשלים" icon="Send"
        action={<Link href="/distribution/daily" className="text-brand-strong text-sm font-bold">שולחן יומי מלא ←</Link>} />

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} count={grouped[t.key].length}>{t.label}</Chip>)}
      </div>

      {daily.items.length === 0 ? (
        <EmptyState icon="Send" title="אין מחזור הפצה היום" body="צור מחזור הפצה יומי כדי שZONO ירכיב את רשימת הפוסטים המומלצים לפי תוכניות ההפצה הפעילות." />
      ) : list.length === 0 ? (
        <EmptyState icon={TABS.find((t) => t.key === tab)!.icon} title="אין פריטים בקטגוריה זו" body="כל הפריטים נמצאים בשלב אחר של מחזור ההפצה." />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((it) => (
            <Glass key={it.id} className="flex flex-col gap-2.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-extrabold">{it.property_title ?? "נכס"}</p>
                  <p className="text-muted text-[11px]">{it.community_name ?? "קהילה"} · {it.platform === "facebook" ? "פייסבוק" : it.platform ?? "—"} · {it.recommended_time ?? "—"}</p>
                </div>
                <StatusPill status={it.status} />
              </div>
              {it.post_title && <p className="text-ink text-[13px] font-bold leading-snug">{it.post_title}</p>}
              {it.post_text && <p className="text-muted line-clamp-2 text-xs leading-relaxed">{it.post_text}</p>}
              <div className="border-line text-muted flex items-center gap-3 border-t pt-2 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1"><Icon name="Eye" size={12} /> {compact(it.expected_reach)} חשיפה</span>
                <span className="inline-flex items-center gap-1"><Icon name="UserPlus" size={12} /> {it.expected_leads} לידים</span>
                <span className="text-brand-strong mr-auto tabular-nums">עדיפות {Math.round(it.priority_score)}</span>
              </div>
            </Glass>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { l: string; c: string }> = {
    pending: { l: "ממתין", c: "bg-warning-soft text-warning" },
    copied: { l: "הועתק", c: "bg-brand-soft text-brand-strong" },
    community_opened: { l: "קהילה נפתחה", c: "bg-brand-soft text-brand-strong" },
    manual_published: { l: "פורסם", c: "bg-success-soft text-success" },
    skipped: { l: "דולג", c: "bg-line/70 text-muted" },
    failed: { l: "נכשל", c: "bg-danger-soft text-danger" },
  };
  const m = map[status] ?? map.pending;
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", m.c)}>{m.l}</span>;
}
