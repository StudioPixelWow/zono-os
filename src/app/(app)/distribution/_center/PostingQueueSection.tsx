"use client";

// ============================================================================
// ZONO — תור פרסום (Posting Queue, Phase 5). Manages every post across the 7
// lifecycle statuses with client-side filters (campaign / group / status / date
// range), a list ⇄ day-grouped "calendar" toggle, and per-post mutations wired
// to the real scheduler actions (edit-time / cancel / reschedule).
// ============================================================================
import { useMemo, useState } from "react";
import type { DailyWorkspace } from "@/lib/distribution/service";
import type { CenterPost, CenterCampaign, CenterGroup } from "@/lib/distribution/center-data";
import type { PostingStatus } from "@/lib/distribution/scheduler-planner";
import {
  updatePostScheduleAction,
  cancelScheduledPostAction,
  reschedulePostAction,
} from "@/lib/distribution/distribution-actions";
import { cn } from "@/lib/utils";
import { Glass, SectionHeading, EmptyState, Chip, Icon, compact } from "./shared";
import type { RunAction } from "./DistributionCenterView";

const STATUSES: PostingStatus[] = ["draft", "scheduled", "queued", "publishing", "published", "failed", "cancelled"];

const STATUS_META: Record<PostingStatus, { l: string; c: string; icon: string }> = {
  draft: { l: "טיוטה", c: "bg-line/70 text-muted", icon: "FileText" },
  scheduled: { l: "מתוזמן", c: "bg-brand-soft text-brand-strong", icon: "Clock" },
  queued: { l: "בתור", c: "bg-sky-100 text-sky-700", icon: "ListChecks" },
  publishing: { l: "מפרסם", c: "bg-warning-soft text-warning", icon: "Loader" },
  published: { l: "פורסם", c: "bg-success-soft text-success", icon: "Check" },
  failed: { l: "נכשל", c: "bg-danger-soft text-danger", icon: "AlertTriangle" },
  cancelled: { l: "בוטל", c: "bg-line/70 text-muted", icon: "X" },
};

/** Statuses the user may still edit/cancel/reschedule. */
const EDITABLE: Set<string> = new Set<PostingStatus>(["draft", "scheduled", "queued", "failed"]);
const READONLY: Set<string> = new Set<PostingStatus>(["publishing", "published", "cancelled"]);

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

function dayKey(iso: string | null): string {
  if (!iso) return "ללא תאריך";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return "ללא תאריך"; }
}

/** Convert an ISO timestamp to the value a <input type=datetime-local> expects (local time). */
function toLocalInput(iso: string | null): string {
  const base = iso ? new Date(iso) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(base.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`;
}

const field = "border-line bg-card/70 text-ink focus:border-brand focus:ring-brand/30 w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none focus:ring-2";

export function PostingQueueSection({
  posts,
  campaigns,
  groups,
  daily,
  runAction,
  pending,
}: {
  posts: CenterPost[];
  campaigns: CenterCampaign[];
  groups: CenterGroup[];
  daily: DailyWorkspace;
  runAction: RunAction;
  pending: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<PostingStatus | "all">("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("");
  const [groupFilter, setGroupFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const campaignName = useMemo(() => Object.fromEntries(campaigns.map((c) => [c.id, c.name])), [campaigns]);
  const groupName = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g.name])), [groups]);

  // Counts per status (over the full post set, ignoring the status chip itself).
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of posts) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [posts]);

  const filtered = useMemo(() => {
    const fromTs = fromDate ? new Date(fromDate).getTime() : null;
    const toTs = toDate ? new Date(toDate).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    return posts.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (campaignFilter && p.campaignId !== campaignFilter) return false;
      if (groupFilter && p.groupId !== groupFilter) return false;
      if (fromTs != null || toTs != null) {
        const ref = p.scheduledAt ?? p.publishedAt;
        const ts = ref ? new Date(ref).getTime() : null;
        if (ts == null) return false;
        if (fromTs != null && ts < fromTs) return false;
        if (toTs != null && ts > toTs) return false;
      }
      return true;
    });
  }, [posts, statusFilter, campaignFilter, groupFilter, fromDate, toDate]);

  // Day-grouped buckets for the "calendar" view, sorted chronologically.
  const byDay = useMemo(() => {
    const map = new Map<string, { key: string; ref: number; items: CenterPost[] }>();
    for (const p of filtered) {
      const ref = p.scheduledAt ?? p.publishedAt;
      const k = dayKey(ref);
      const ts = ref ? new Date(ref).getTime() : Number.POSITIVE_INFINITY;
      if (!map.has(k)) map.set(k, { key: k, ref: ts, items: [] });
      const bucket = map.get(k)!;
      bucket.ref = Math.min(bucket.ref, ts);
      bucket.items.push(p);
    }
    return Array.from(map.values()).sort((a, b) => a.ref - b.ref);
  }, [filtered]);

  const hasFilters = statusFilter !== "all" || campaignFilter || groupFilter || fromDate || toDate;

  function clearFilters() {
    setStatusFilter("all"); setCampaignFilter(""); setGroupFilter(""); setFromDate(""); setToDate("");
  }

  function startEdit(p: CenterPost) {
    setEditingId(p.id);
    setEditValue(toLocalInput(p.scheduledAt));
  }

  function saveEdit(postId: string) {
    const iso = new Date(editValue).toISOString();
    runAction(() => updatePostScheduleAction({ postId, scheduledAt: iso }), "התזמון עודכן");
    setEditingId(null);
  }

  function reschedule(postId: string) {
    const iso = new Date(editValue).toISOString();
    runAction(() => reschedulePostAction({ postId, scheduledAt: iso }), "הפוסט תוזמן מחדש");
    setEditingId(null);
  }

  function cancelPost(postId: string) {
    runAction(() => cancelScheduledPostAction({ postId }), "הפוסט בוטל");
  }

  function renderCard(p: CenterPost) {
    const meta = STATUS_META[p.status as PostingStatus] ?? STATUS_META.draft;
    const editable = EDITABLE.has(p.status);
    const readonly = READONLY.has(p.status);
    const isEditing = editingId === p.id;
    return (
      <Glass key={p.id} className="flex flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-ink truncate text-sm font-extrabold">{p.postTitle ?? "פוסט הפצה"}</p>
            <p className="text-muted text-[11px]">
              {p.publishedAt ? `פורסם: ${fmtDate(p.publishedAt)}` : `מתוזמן: ${fmtDate(p.scheduledAt)}`}
            </p>
            <p className="text-muted mt-0.5 truncate text-[11px] font-medium">
              {p.campaignId ? (campaignName[p.campaignId] ?? "קמפיין") : "—"}
              {p.groupId ? ` · ${groupName[p.groupId] ?? "קבוצה"}` : ""}
            </p>
          </div>
          <span className={cn("shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold", meta.c)}>
            <Icon name={meta.icon} size={11} />{meta.l}
          </span>
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

        {readonly && !p.externalPostUrl && (
          <p className="text-muted text-[11px] font-semibold">לקריאה בלבד — לא ניתן לערוך פוסט בסטטוס זה.</p>
        )}

        {editable && (
          isEditing ? (
            <div className="flex flex-col gap-2">
              <input type="datetime-local" className={field} value={editValue} onChange={(e) => setEditValue(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={pending || !editValue} onClick={() => saveEdit(p.id)}
                  className="zono-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                  <Icon name="Check" size={13} /> שמור זמן
                </button>
                <button type="button" disabled={pending || !editValue} onClick={() => reschedule(p.id)}
                  className="zono-glass text-ink hover:text-brand-strong inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50">
                  <Icon name="RefreshCw" size={13} /> תזמן מחדש
                </button>
                <button type="button" onClick={() => setEditingId(null)}
                  className="text-muted inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold">
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => startEdit(p)}
                className="zono-glass text-ink hover:text-brand-strong inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50">
                <Icon name="Clock" size={13} /> ערוך זמן
              </button>
              <button type="button" disabled={pending} onClick={() => cancelPost(p.id)}
                className="text-danger bg-danger-soft inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 hover:brightness-95">
                <Icon name="X" size={13} /> בטל
              </button>
            </div>
          )
        )}
      </Glass>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="תור פרסום" subtitle="כל הפוסטים בקמפיינים — סינון, תזמון מחדש, ביטול ומעקב מצב" icon="Send"
        action={
          <div className="zono-glass flex items-center gap-1 rounded-full p-1">
            <button type="button" onClick={() => setView("list")}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition", view === "list" ? "zono-gradient text-white" : "text-ink hover:text-brand-strong")}>
              <Icon name="ListChecks" size={13} /> רשימה
            </button>
            <button type="button" onClick={() => setView("calendar")}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition", view === "calendar" ? "zono-gradient text-white" : "text-ink hover:text-brand-strong")}>
              <Icon name="Calendar" size={13} /> לפי יום
            </button>
          </div>
        } />

      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")} count={posts.length}>הכל</Chip>
        {STATUSES.map((s) => (
          <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} count={counts[s] ?? 0}>{STATUS_META[s].l}</Chip>
        ))}
      </div>

      {/* Filters */}
      <Glass className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select className={field} value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}>
            <option value="">כל הקמפיינים</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={field} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="">כל הקבוצות</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <span className="text-muted shrink-0 text-[11px] font-bold">מ־</span>
            <input type="date" className={field} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted shrink-0 text-[11px] font-bold">עד</span>
            <input type="date" className={field} value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
        {hasFilters && (
          <div className="flex items-center justify-between">
            <span className="text-muted text-[11px] font-semibold tabular-nums">{filtered.length} פוסטים תואמים</span>
            <button type="button" onClick={clearFilters} className="text-brand-strong inline-flex items-center gap-1 text-xs font-bold">
              <Icon name="X" size={13} /> נקה סינון
            </button>
          </div>
        )}
      </Glass>

      {/* Body */}
      {posts.length === 0 ? (
        <EmptyState icon="Send" title="אין עדיין פוסטים בתור" body="בנה תור פרסום בלשונית בניית התור — בחר קמפיין, קבוצות ווריאציות וZONO ירכיב את הפוסטים המתוזמנים." />
      ) : filtered.length === 0 ? (
        <EmptyState icon="Filter" title="אין פוסטים תואמים לסינון" body="שנה את הסטטוס, הקמפיין, הקבוצה או טווח התאריכים כדי לראות פוסטים." />
      ) : view === "list" ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map(renderCard)}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {byDay.map((d) => (
            <div key={d.key} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Icon name="Calendar" size={15} className="text-brand-strong" />
                <p className="text-ink text-sm font-extrabold">{d.key}</p>
                <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums">{d.items.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {d.items.map(renderCard)}
              </div>
            </div>
          ))}
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
