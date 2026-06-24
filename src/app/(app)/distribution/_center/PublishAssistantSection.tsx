"use client";

// ============================================================================
// ZONO — עוזר פרסום (Publish Assistant, Phase 6). The MANUAL publishing flow:
// no Meta API yet. For each queued post the assistant prepares copy-ready text,
// the property asset, the destination URL and a compliance checklist — then the
// agent publishes by hand and records the result. Every control here calls a
// real server action; there is NO mock data and NOTHING contacts Facebook.
// ============================================================================
import { useState } from "react";
import type { AssistantPost } from "@/lib/distribution/manual-publish-service";
import {
  markPostPublishedAction,
  markPostFailedAction,
  saveExternalPostUrlAction,
  refreshProviderStatusAction,
} from "@/lib/distribution/manual-publish-actions";
import { cn } from "@/lib/utils";
import { Glass, SectionHeading, EmptyState, Icon } from "./shared";
import type { RunAction } from "./DistributionCenterView";

const field =
  "border-line bg-card/70 text-ink focus:border-brand focus:ring-brand/30 w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none focus:ring-2";

// Statuses still actionable in the manual flow (not yet published / cancelled).
const ACTIONABLE = new Set(["draft", "scheduled", "queued", "failed"]);

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

export function PublishAssistantSection({
  posts,
  complianceWarnings,
  runAction,
  pending,
}: {
  posts: AssistantPost[];
  complianceWarnings: string[];
  runAction: RunAction;
  pending: boolean;
}) {
  const [providerMsg, setProviderMsg] = useState<string | null>(null);
  const [providerChecking, setProviderChecking] = useState(false);

  // Per-post local UI state (paste URL, failure reason, copy confirmation).
  const [urlDraft, setUrlDraft] = useState<Record<string, string>>({});
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toPublish = posts.filter((p) => ACTIONABLE.has(p.status));
  const published = posts.filter((p) => p.status === "published");

  async function checkProvider() {
    setProviderChecking(true);
    try {
      const res = await refreshProviderStatusAction({});
      if (res.error) setProviderMsg(res.error);
      else if (res.status) setProviderMsg(res.status.message);
      else setProviderMsg("לא ניתן לבדוק את החיבור");
    } catch {
      setProviderMsg("לא ניתן לבדוק את החיבור");
    } finally {
      setProviderChecking(false);
    }
  }

  async function copyText(post: AssistantPost) {
    try {
      await navigator.clipboard.writeText(post.text);
      setCopiedId(post.postId);
      setTimeout(() => setCopiedId((id) => (id === post.postId ? null : id)), 2200);
    } catch {
      setCopiedId(null);
    }
  }

  function openGroup(url: string | null) {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function saveUrl(postId: string) {
    const url = (urlDraft[postId] ?? "").trim();
    if (!url) return;
    runAction(() => saveExternalPostUrlAction({ postId, url }), "הקישור נשמר");
  }

  function markPublished(postId: string) {
    const url = (urlDraft[postId] ?? "").trim();
    runAction(
      () => markPostPublishedAction({ postId, externalPostUrl: url || undefined }),
      "הפוסט סומן כפורסם",
    );
  }

  function markFailed(postId: string) {
    const reason = (reasonDraft[postId] ?? "").trim();
    runAction(() => markPostFailedAction({ postId, reason: reason || undefined }), "הפוסט סומן ככשל");
  }

  function renderCard(post: AssistantPost) {
    const isFailed = post.status === "failed";
    return (
      <Glass key={post.postId} className="flex flex-col gap-4 p-5">
        {/* Destination header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-ink truncate text-base font-black">{post.groupName ?? "יעד פרסום"}</p>
            <p className="text-muted mt-0.5 inline-flex items-center gap-1.5 text-[11px] font-semibold">
              <Icon name="Clock" size={12} /> {fmtDate(post.scheduledAt)}
            </p>
            {post.groupUrl && (
              <a href={post.groupUrl} target="_blank" rel="noopener noreferrer"
                className="text-brand-strong mt-1 inline-flex max-w-full items-center gap-1 truncate text-[11px] font-bold">
                <Icon name="ExternalLink" size={12} /> <span className="truncate">{post.groupUrl}</span>
              </a>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="bg-brand-soft text-brand-strong inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold">
              <Icon name="Send" size={11} /> {post.providerLabel}
            </span>
            {post.requiresMembership && (
              <span className="text-warning bg-warning-soft inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold">
                <Icon name="Lock" size={11} /> דרושה חברות בקבוצה
              </span>
            )}
            {isFailed && (
              <span className="text-danger bg-danger-soft inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold">
                <Icon name="AlertTriangle" size={11} /> נכשל
              </span>
            )}
          </div>
        </div>

        {/* Property asset */}
        {post.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.imageUrl} alt={post.title ?? "תמונת המודעה"}
            className="border-line max-h-72 w-full rounded-2xl border object-cover" />
        )}

        {/* Copy-ready variation text */}
        <div className="bg-card/60 border-line rounded-2xl border p-3.5">
          <p className="text-muted mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold">
            <Icon name="FileText" size={12} /> טקסט הפוסט המוכן
          </p>
          <p className="text-ink whitespace-pre-wrap text-sm font-medium leading-relaxed">{post.text}</p>
        </div>

        {/* Checklist */}
        {post.checklist.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-muted inline-flex items-center gap-1.5 text-[11px] font-bold">
              <Icon name="ListChecks" size={12} /> צ׳קליסט לפרסום ידני
            </p>
            <ol className="flex flex-col gap-1">
              {post.checklist.map((step, i) => (
                <li key={i} className="text-ink flex items-start gap-2 text-[13px] font-medium">
                  <span className="bg-brand-soft text-brand-strong mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-black tabular-nums">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Primary actions: copy + open group */}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => copyText(post)}
            className="zono-gradient inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-white transition hover:brightness-95">
            <Icon name={copiedId === post.postId ? "Check" : "Copy"} size={14} />
            {copiedId === post.postId ? "הועתק" : "העתק טקסט"}
          </button>
          <button type="button" disabled={!post.groupUrl} onClick={() => openGroup(post.groupUrl)}
            className="zono-glass text-ink hover:text-brand-strong inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition disabled:opacity-50">
            <Icon name="ExternalLink" size={14} /> פתח קבוצה
          </button>
        </div>

        {/* Paste the published Facebook URL */}
        <div className="flex flex-col gap-2">
          <label className="text-muted inline-flex items-center gap-1.5 text-[11px] font-bold">
            <Icon name="ExternalLink" size={12} /> קישור הפוסט שפורסם בפייסבוק
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input type="url" dir="ltr" placeholder="https://facebook.com/groups/..."
              className={field}
              value={urlDraft[post.postId] ?? post.externalPostUrl ?? ""}
              onChange={(e) => setUrlDraft((d) => ({ ...d, [post.postId]: e.target.value }))} />
            <button type="button" disabled={pending || !(urlDraft[post.postId] ?? "").trim()}
              onClick={() => saveUrl(post.postId)}
              className="zono-glass text-ink hover:text-brand-strong inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition disabled:opacity-50">
              <Icon name="Check" size={14} /> שמור קישור
            </button>
          </div>
        </div>

        {/* Failure reason (optional) */}
        <input type="text" placeholder="סיבת כשל (לא חובה)"
          className={field}
          value={reasonDraft[post.postId] ?? ""}
          onChange={(e) => setReasonDraft((d) => ({ ...d, [post.postId]: e.target.value }))} />

        {/* Outcome actions */}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => markPublished(post.postId)}
            className="text-success bg-success-soft inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition hover:brightness-95 disabled:opacity-50">
            <Icon name="Check" size={14} /> סמן כפורסם
          </button>
          <button type="button" disabled={pending} onClick={() => markFailed(post.postId)}
            className="text-danger bg-danger-soft inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition hover:brightness-95 disabled:opacity-50">
            <Icon name="AlertTriangle" size={14} /> סמן ככשל
          </button>
        </div>
      </Glass>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="עוזר פרסום"
        subtitle="פרסום ידני תואם-מדיניות — ZONO מכין את הטקסט, הנכס והקישור, ואתה מפרסם בעצמך ומדווח על התוצאה"
        icon="ShieldCheck"
      />

      {/* Compliance banner — calm, clear */}
      <Glass className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2.5">
          <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl">
            <Icon name="ShieldCheck" size={18} />
          </span>
          <div>
            <p className="text-ink text-sm font-black">פרסום אחראי ותואם מדיניות</p>
            <p className="text-muted text-[11px] font-medium">ZONO מסייע לך לפרסם ידנית, מבלי לעקוף את כללי פייסבוק.</p>
          </div>
        </div>
        <ul className="flex flex-col gap-1.5">
          {complianceWarnings.map((w, i) => (
            <li key={i} className="text-ink flex items-start gap-2 text-[13px] font-medium leading-snug">
              <Icon name="Check" size={14} className="text-brand-strong mt-0.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      </Glass>

      {/* Provider status */}
      <Glass className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <span className="bg-line/70 text-muted grid h-9 w-9 place-items-center rounded-xl">
            <Icon name="Send" size={17} />
          </span>
          <div>
            <p className="text-ink text-sm font-extrabold">מצב חיבור הפרסום</p>
            <p className="text-muted text-[11px] font-medium">
              {providerMsg
                ? providerMsg
                : "פרסום ידני — אין כרגע חיבור API מאושר. כל פרסום מתבצע על ידך בעצמך."}
            </p>
          </div>
        </div>
        <button type="button" disabled={providerChecking} onClick={checkProvider}
          className="zono-glass text-ink hover:text-brand-strong inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition disabled:opacity-50">
          <Icon name={providerChecking ? "Loader" : "RefreshCw"} size={14} className={cn(providerChecking && "animate-spin")} />
          בדוק חיבור
        </button>
      </Glass>

      {/* Posts to publish */}
      {toPublish.length === 0 ? (
        <EmptyState
          icon="ShieldCheck"
          title="אין כרגע פוסטים לפרסום"
          body="כשתבנה תור פרסום, הפוסטים המתוזמנים יופיעו כאן עם טקסט מוכן, נכס וצ׳קליסט לפרסום ידני תואם-מדיניות."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{toPublish.map(renderCard)}</div>
      )}

      {/* Already published — read-only */}
      {published.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Icon name="Check" size={15} className="text-success" />
            <p className="text-ink text-sm font-extrabold">פורסמו לאחרונה</p>
            <span className="text-muted text-xs font-semibold tabular-nums">{published.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {published.map((p) => (
              <Glass key={p.postId} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-extrabold">{p.groupName ?? "יעד פרסום"}</p>
                  <p className="text-muted text-[11px] font-medium">{fmtDate(p.scheduledAt)}</p>
                </div>
                {p.externalPostUrl ? (
                  <a href={p.externalPostUrl} target="_blank" rel="noopener noreferrer"
                    className="text-brand-strong inline-flex shrink-0 items-center gap-1 text-xs font-bold">
                    <Icon name="ExternalLink" size={13} /> צפה בפוסט
                  </a>
                ) : (
                  <span className="text-success bg-success-soft inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold">
                    <Icon name="Check" size={11} /> פורסם
                  </span>
                )}
              </Glass>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
