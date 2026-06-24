"use client";

// ============================================================================
// ZONO — תגובות ולידים (Comments & Leads, Phase 7). The MANUAL comment-import
// flow: no Facebook API. The agent pastes comments from published posts; a
// deterministic classifier scores them, suggests replies, and can create leads.
// Every control here calls a real server action; there is NO mock data and
// NOTHING contacts Facebook.
// ============================================================================
import { useMemo, useState } from "react";
import type { CommentView, CommentsBoard } from "@/lib/distribution/distribution-comment-service";
import type { CenterGroup, CenterPost } from "@/lib/distribution/center-data";
import {
  importCommentAction,
  bulkImportCommentsAction,
  analyzeCommentAction,
  createLeadFromCommentAction,
  markCommentHandledAction,
} from "@/lib/distribution/distribution-comment-actions";
import { cn } from "@/lib/utils";
import { Glass, SectionHeading, StatTile, EmptyState, Chip, ScoreBar, Icon, compact, pct } from "./shared";
import type { RunAction, RunActionAsync } from "./DistributionCenterView";

const field =
  "border-line bg-card/70 text-ink focus:border-brand focus:ring-brand/30 w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none focus:ring-2";

// Categories treated as "ignored" (spam / irrelevant / negative / broker chatter).
const IGNORED = ["spam", "not_relevant", "negative", "broker_comment"];
// Lead-intent categories (a comment in one of these can become a lead).
const LEAD_CATS = ["asks_for_price", "asks_for_details", "asks_for_location", "asks_for_photos", "asks_for_phone", "interested"];

// Short Hebrew labels for the classifier categories.
const CAT_LABEL: Record<string, string> = {
  asks_for_price: "שואל על מחיר",
  asks_for_details: "מבקש פרטים",
  asks_for_location: "שואל על מיקום",
  asks_for_photos: "מבקש תמונות",
  asks_for_phone: "מבקש טלפון",
  interested: "מתעניין",
  not_relevant: "לא רלוונטי",
  spam: "ספאם",
  negative: "שלילי",
  broker_comment: "תגובת מתווך",
};

const SENTIMENT_LABEL: Record<string, string> = {
  positive: "חיובי",
  neutral: "נייטרלי",
  negative: "שלילי",
};

function catLabel(cat: string | null): string {
  return cat ? CAT_LABEL[cat] ?? cat : "לא מסווג";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "ללא תאריך";
  try {
    return new Date(iso).toLocaleString("he-IL", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "ללא תאריך";
  }
}

type FilterKey = "new" | "hot" | "needsReply" | "ignored" | "converted";

const FILTERS: { key: FilterKey; label: string; icon: string }[] = [
  { key: "new", label: "תגובות חדשות", icon: "MessageCircle" },
  { key: "hot", label: "לידים חמים", icon: "Flame" },
  { key: "needsReply", label: "דורש מענה", icon: "PenLine" },
  { key: "ignored", label: "ספאם/לא רלוונטי", icon: "Filter" },
  { key: "converted", label: "לידים שנוצרו", icon: "UserCheck" },
];

function matchesFilter(c: CommentView, f: FilterKey): boolean {
  const cat = c.category ?? "";
  switch (f) {
    case "new":
      return !c.handled && !c.isLead && !c.leadId && !IGNORED.includes(cat);
    case "hot":
      return c.leadIntentScore >= 80 && LEAD_CATS.includes(cat);
    case "needsReply":
      return !c.handled && !IGNORED.includes(cat) && (c.suggestedReply?.length ?? 0) > 0;
    case "ignored":
      return IGNORED.includes(cat);
    case "converted":
      return Boolean(c.leadId);
  }
}

export function CommentsLeadsSection({
  commentsBoard,
  posts,
  groups,
  runAction,
  runActionAsync,
  pending,
}: {
  commentsBoard: CommentsBoard;
  posts: CenterPost[];
  groups: CenterGroup[];
  runAction: RunAction;
  runActionAsync: RunActionAsync;
  pending: boolean;
}) {
  const counts = commentsBoard.counts;
  const comments = commentsBoard.comments;

  const [filter, setFilter] = useState<FilterKey>("new");

  // Manual import form state.
  const [importPostId, setImportPostId] = useState<string>("");
  const [authorName, setAuthorName] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentUrl, setCommentUrl] = useState("");
  const [profileUrl, setProfileUrl] = useState("");

  // Bulk paste state.
  const [bulkPostId, setBulkPostId] = useState<string>("");
  const [bulkText, setBulkText] = useState("");

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Published posts the agent can attach comments to.
  const publishedPosts = useMemo(() => posts.filter((p) => p.status === "published"), [posts]);
  const groupName = useMemo(() => {
    const map = new Map(groups.map((g) => [g.id, g.name]));
    return (groupId: string | null) => (groupId ? map.get(groupId) ?? null : null);
  }, [groups]);

  function postLabel(p: CenterPost): string {
    const g = groupName(p.groupId);
    const title = p.postTitle?.trim() || "פוסט ללא כותרת";
    return g ? `${title} · ${g}` : title;
  }

  const filterCount = (f: FilterKey) => comments.filter((c) => matchesFilter(c, f)).length;
  const visible = useMemo(() => comments.filter((c) => matchesFilter(c, filter)), [comments, filter]);

  async function copyReply(comment: CommentView) {
    if (!comment.suggestedReply) return;
    try {
      await navigator.clipboard.writeText(comment.suggestedReply);
      setCopiedId(comment.id);
      setTimeout(() => setCopiedId((id) => (id === comment.id ? null : id)), 2200);
    } catch {
      setCopiedId(null);
    }
  }

  function openPost(url: string | null) {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function submitImport() {
    const text = commentText.trim();
    if (!text) return;
    runActionAsync(
      () =>
        importCommentAction({
          postId: importPostId || null,
          authorName: authorName.trim() || undefined,
          commentText: text,
          commentUrl: commentUrl.trim() || undefined,
          profileUrl: profileUrl.trim() || undefined,
        }),
      "התגובה יובאה ונותחה",
    ).then((res) => {
      if (!res?.error) {
        setAuthorName("");
        setCommentText("");
        setCommentUrl("");
        setProfileUrl("");
      }
    });
  }

  function submitBulk() {
    const items = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => ({ text: l }));
    if (!items.length) return;
    runActionAsync(
      () => bulkImportCommentsAction({ postId: bulkPostId || null, items }),
      "התגובות יובאו ונותחו",
    ).then((res) => {
      const r = res as { error?: string; imported?: number };
      if (!r?.error) {
        setBulkText("");
      }
    });
  }

  function renderCard(c: CommentView) {
    const isLead = Boolean(c.leadId);
    const ignored = IGNORED.includes(c.category ?? "");
    return (
      <Glass key={c.id} className="flex flex-col gap-3.5 p-5">
        {/* Author + source */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-ink truncate text-base font-black">{c.authorName?.trim() || "מגיב אנונימי"}</p>
            <p className="text-muted mt-0.5 inline-flex items-center gap-1.5 text-[11px] font-semibold">
              <Icon name="Clock" size={12} /> {fmtDate(c.occurredAt)}
            </p>
            {c.authorProfileUrl && (
              <a href={c.authorProfileUrl} target="_blank" rel="noopener noreferrer"
                className="text-brand-strong mt-1 inline-flex max-w-full items-center gap-1 truncate text-[11px] font-bold">
                <Icon name="ExternalLink" size={12} /> <span className="truncate">פרופיל המגיב</span>
              </a>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
              ignored ? "bg-line/70 text-muted" : "bg-brand-soft text-brand-strong",
            )}>
              <Icon name="Tag" size={11} /> {catLabel(c.category)}
            </span>
            {c.sentiment && (
              <span className="bg-card/70 border-line text-muted inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold">
                {SENTIMENT_LABEL[c.sentiment] ?? c.sentiment}
              </span>
            )}
            {isLead && (
              <span className="text-success bg-success-soft inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold">
                <Icon name="UserCheck" size={11} /> ליד נוצר
              </span>
            )}
          </div>
        </div>

        {/* Comment text */}
        <div className="bg-card/60 border-line rounded-2xl border p-3.5">
          <p className="text-ink whitespace-pre-wrap text-sm font-medium leading-relaxed">{c.text}</p>
        </div>

        {/* Source + intent score */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold">
            <Icon name="Megaphone" size={12} className="shrink-0" />
            <span className="truncate">
              {(c.postTitle?.trim() || "ללא פוסט")}{c.groupName ? ` · ${c.groupName}` : ""}
            </span>
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-muted text-[11px] font-bold">כוונת ליד</span>
            <ScoreBar value={c.leadIntentScore} />
          </div>
        </div>

        {/* Suggested reply */}
        {c.suggestedReply && (
          <div className="border-brand-soft rounded-2xl border bg-brand-soft/40 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-brand-strong inline-flex items-center gap-1.5 text-[11px] font-bold">
                <Icon name="Sparkles" size={12} /> מענה מוצע
              </p>
              <button type="button" onClick={() => copyReply(c)}
                className="text-brand-strong inline-flex items-center gap-1 text-[11px] font-bold transition hover:brightness-95">
                <Icon name={copiedId === c.id ? "Check" : "Copy"} size={13} />
                {copiedId === c.id ? "הועתק" : "העתק מענה"}
              </button>
            </div>
            <p className="text-ink mt-1.5 whitespace-pre-wrap text-[13px] font-medium leading-relaxed">{c.suggestedReply}</p>
          </div>
        )}

        {/* Reason */}
        {c.reason && (
          <p className="text-muted text-[11px] font-medium leading-snug">{c.reason}</p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {!isLead && (
            <button type="button" disabled={pending}
              onClick={() => runAction(() => createLeadFromCommentAction({ commentId: c.id }), "ליד נוצר מהתגובה")}
              className="zono-gradient inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-white transition hover:brightness-95 disabled:opacity-50">
              <Icon name="UserPlus" size={14} /> צור ליד
            </button>
          )}
          {!c.handled && (
            <button type="button" disabled={pending}
              onClick={() => runAction(() => markCommentHandledAction({ commentId: c.id, handled: true }), "התגובה סומנה כטופלה")}
              className="text-success bg-success-soft inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition hover:brightness-95 disabled:opacity-50">
              <Icon name="Check" size={14} /> סמן כטופל
            </button>
          )}
          <button type="button" disabled={pending}
            onClick={() => runAction(() => analyzeCommentAction({ commentId: c.id }), "התגובה נותחה מחדש")}
            className="zono-glass text-ink hover:text-brand-strong inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition disabled:opacity-50">
            <Icon name="RefreshCw" size={14} /> נתח מחדש
          </button>
          <button type="button" disabled={!c.externalPostUrl} onClick={() => openPost(c.externalPostUrl)}
            className="zono-glass text-ink hover:text-brand-strong inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition disabled:opacity-50">
            <Icon name="ExternalLink" size={14} /> פתח פוסט
          </button>
        </div>
      </Glass>
    );
  }

  const emptyBody: Record<FilterKey, { title: string; body: string }> = {
    new: { title: "אין תגובות חדשות", body: "ייבא תגובות מפוסטים שפורסמו והן יסווגו אוטומטית ויופיעו כאן." },
    hot: { title: "אין לידים חמים", body: "תגובות עם כוונת רכישה גבוהה (80+) יופיעו כאן כהזדמנויות חמות." },
    needsReply: { title: "אין תגובות הממתינות למענה", body: "תגובות עם מענה מוצע שטרם טופלו יופיעו כאן." },
    ignored: { title: "אין ספאם או תגובות לא רלוונטיות", body: "תגובות שסווגו כספאם, לא רלוונטי, שלילי או תגובת מתווך יופיעו כאן." },
    converted: { title: "עדיין לא נוצרו לידים", body: "תגובות שהומרו ללידים יופיעו כאן עם קישור לליד." },
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="תגובות ולידים"
        subtitle="ייבא תגובות מפוסטים שפורסמו, ZONO מסווג אותן, מציע מענה ומזהה לידים — ללא חיבור לפייסבוק"
        icon="MessageCircle"
      />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        <StatTile label="תגובות" value={compact(counts.comments)} icon="MessageCircle" tone="brand" />
        <StatTile label="לידים חמים" value={compact(counts.hotLeads)} icon="Flame" tone="danger" />
        <StatTile label="לידים" value={compact(counts.leads)} icon="UserCheck" tone="success" />
        <StatTile label="דורש מענה" value={compact(counts.needsReply)} icon="PenLine" tone="warning" />
        <StatTile label="ספאם/לא רלוונטי" value={compact(counts.ignored)} icon="Filter" tone="accent" />
        <StatTile label="הומרו ללידים" value={compact(counts.converted)} icon="UserPlus" tone="success" />
        <StatTile label="שיעור המרה" value={pct(counts.conversionRate)} icon="Percent" tone="brand" />
      </div>

      {/* Manual import */}
      <Glass className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2.5">
          <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl">
            <Icon name="FilePlus2" size={18} />
          </span>
          <div>
            <p className="text-ink text-sm font-black">ייבוא תגובות ידני</p>
            <p className="text-muted text-[11px] font-medium">העתק תגובות מפוסט שפורסם — ZONO ינתח ויסווג כל אחת.</p>
          </div>
        </div>

        {publishedPosts.length === 0 && (
          <p className="text-warning bg-warning-soft inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold">
            <Icon name="AlertTriangle" size={13} /> אין עדיין פוסטים שפורסמו — אפשר לייבא תגובות גם ללא שיוך לפוסט.
          </p>
        )}

        {/* Single import */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-muted text-[11px] font-bold">פוסט שפורסם</label>
            <select className={field} value={importPostId} onChange={(e) => setImportPostId(e.target.value)}>
              <option value="">ללא שיוך לפוסט</option>
              {publishedPosts.map((p) => (
                <option key={p.id} value={p.id}>{postLabel(p)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-muted text-[11px] font-bold">שם המגיב (לא חובה)</label>
            <input type="text" className={field} placeholder="לדוגמה: דנה כהן"
              value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2 lg:col-span-2">
            <label className="text-muted text-[11px] font-bold">טקסט התגובה</label>
            <textarea rows={3} className={cn(field, "resize-y")} placeholder="הדבק כאן את תוכן התגובה..."
              value={commentText} onChange={(e) => setCommentText(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-muted text-[11px] font-bold">קישור לתגובה (לא חובה)</label>
            <input type="url" dir="ltr" className={field} placeholder="https://facebook.com/..."
              value={commentUrl} onChange={(e) => setCommentUrl(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-muted text-[11px] font-bold">קישור לפרופיל (לא חובה)</label>
            <input type="url" dir="ltr" className={field} placeholder="https://facebook.com/..."
              value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} />
          </div>
        </div>
        <div>
          <button type="button" disabled={pending || !commentText.trim()} onClick={submitImport}
            className="zono-gradient inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50">
            <Icon name="Plus" size={15} /> ייבא ונתח תגובה
          </button>
        </div>

        {/* Bulk paste */}
        <div className="border-line mt-1 flex flex-col gap-3 border-t pt-4">
          <div className="flex items-center gap-2">
            <Icon name="Layers" size={15} className="text-brand-strong" />
            <p className="text-ink text-sm font-extrabold">ייבוא מרובה — תגובה בכל שורה</p>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-muted text-[11px] font-bold">פוסט שפורסם</label>
              <select className={field} value={bulkPostId} onChange={(e) => setBulkPostId(e.target.value)}>
                <option value="">ללא שיוך לפוסט</option>
                {publishedPosts.map((p) => (
                  <option key={p.id} value={p.id}>{postLabel(p)}</option>
                ))}
              </select>
            </div>
          </div>
          <textarea rows={4} className={cn(field, "resize-y")} placeholder={"כל שורה היא תגובה נפרדת...\nמה המחיר?\nאפשר תמונות נוספות?"}
            value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
          <div>
            <button type="button" disabled={pending || !bulkText.trim()} onClick={submitBulk}
              className="zono-glass text-ink hover:text-brand-strong inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-50">
              <Icon name="Upload" size={15} /> ייבא תגובות מרובות
            </button>
          </div>
        </div>
      </Glass>

      {/* Filters */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)} count={filterCount(f.key)}>
            <Icon name={f.icon} size={14} />
            {f.label}
          </Chip>
        ))}
      </div>

      {/* Comment cards */}
      {visible.length === 0 ? (
        <EmptyState icon="MessageCircle" title={emptyBody[filter].title} body={emptyBody[filter].body} />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{visible.map(renderCard)}</div>
      )}
    </div>
  );
}
