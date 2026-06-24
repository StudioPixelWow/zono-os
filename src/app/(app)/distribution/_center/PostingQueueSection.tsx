"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DailyWorkspace } from "@/lib/distribution/service";
import type { CenterPost } from "@/lib/distribution/center-data";
import { cn } from "@/lib/utils";
import { Glass, SectionHeading, EmptyState, Chip, Icon, compact } from "./shared";

type Bucket = "upcoming" | "progress" | "completed" | "failed";

const BUCKET_OF: Record<string, Bucket> = {
  pending: "upcoming", scheduled: "upcoming",
  in_progress: "progress",
  published: "completed",
  failed: "failed", skipped: "failed",
};
const TABS: { key: Bucket; label: string; icon: string }[] = [
  { key: "upcoming", label: "מתוכננים", icon: "Clock" },
  { key: "progress", label: "בתהליך", icon: "Loader" },
  { key: "completed", label: "הושלמו", icon: "CheckCircle2" },
  { key: "failed", label: "נכשלו / דולגו", icon: "AlertTriangle" },
];

const STATUS_PILL: Record<string, { l: string; c: string }> = {
  pending: { l: "ממתין", c: "bg-warning-soft text-warning" },
  scheduled: { l: "מתוזמן", c: "bg-brand-soft text-brand-strong" },
  in_progress: { l: "בתהליך", c: "bg-brand-soft text-brand-strong" },
  published: { l: "פורסם", c: "bg-success-soft text-success" },
  skipped: { l: "דולג", c: "bg-line/70 text-muted" },
  failed: { l: "נכשל", c: "bg-danger-soft text-danger" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

export function PostingQueueSection({ posts, daily }: { posts: CenterPost[]; daily: DailyWorkspace }) {
  const [tab, setTab] = useState<Bucket>("upcoming");

  const grouped = useMemo(() => {
    const g: Record<Bucket, CenterPost[]> = { upcoming: [], progress: [], completed: [], failed: [] };
    for (const p of posts) g[BUCKET_OF[p.status] ?? "upcoming"].push(p);
    return g;
  }, [posts]);

  const list = grouped[tab];

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="תור פרסום" subtitle="כל הפוסטים בקמפיינים — מתוכננים, בתהליך, שפורסמו וכשלים" icon="Send"
        action={<Link href="/distribution/daily" className="text-brand-strong text-sm font-bold">שולחן יומי מלא ←</Link>} />

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} count={grouped[t.key].length}>{t.label}</Chip>)}
      </div>

      {posts.length === 0 ? (
        <EmptyState icon="Send" title="אין עדיין פוסטים בתור" body="צור קמפיין ובחר קבוצות — ZONO ירכיב את תור הפרסום עם הפוסטים המתוזמנים לכל קבוצה." />
      ) : list.length === 0 ? (
        <EmptyState icon={TABS.find((t) => t.key === tab)!.icon} title="אין פריטים בקטגוריה זו" body="כל הפוסטים נמצאים בשלב אחר של תור הפרסום." />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((p) => {
            const pill = STATUS_PILL[p.status] ?? STATUS_PILL.pending;
            return (
              <Glass key={p.id} className="flex flex-col gap-2.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-ink truncate text-sm font-extrabold">{p.postTitle ?? "פוסט הפצה"}</p>
                    <p className="text-muted text-[11px]">
                      {p.publishedAt ? `פורסם: ${fmtDate(p.publishedAt)}` : `מתוזמן: ${fmtDate(p.scheduledAt)}`}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", pill.c)}>{pill.l}</span>
                </div>
                {p.failedReason && (
                  <p className="text-danger bg-danger-soft rounded-lg px-2.5 py-1.5 text-[11px] font-semibold leading-snug">
                    <Icon name="AlertTriangle" size={12} className="ml-1 inline" />{p.failedReason}
                  </p>
                )}
                {p.externalPostUrl && (
                  <a href={p.externalPostUrl} target="_blank" rel="noopener" className="text-brand-strong inline-flex items-center gap-1 text-xs font-bold">
                    <Icon name="ExternalLink" size={12} /> צפה בפוסט שפורסם
                  </a>
                )}
              </Glass>
            );
          })}
        </div>
      )}

      {/* Secondary — today's daily workspace recommendations (real) */}
      {daily.items.length > 0 && (
        <Glass className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <Icon name="CalendarClock" size={16} className="text-brand-strong" />
            <p className="text-ink text-sm font-extrabold">מחזור הפצה יומי מומלץ</p>
            <span className="text-muted text-xs font-semibold tabular-nums">{daily.items.length} פריטים</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {daily.items.slice(0, 6).map((it) => (
              <div key={it.id} className="bg-card/60 border-line flex items-center justify-between gap-2 rounded-xl border p-2.5">
                <div className="min-w-0">
                  <p className="text-ink truncate text-[13px] font-bold">{it.property_title ?? "נכס"}</p>
                  <p className="text-muted text-[11px]">{it.community_name ?? "קהילה"} · {it.recommended_time ?? "—"}</p>
                </div>
                <span className="text-muted shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold"><Icon name="Eye" size={12} /> {compact(it.expected_reach)}</span>
              </div>
            ))}
          </div>
        </Glass>
      )}
    </div>
  );
}
