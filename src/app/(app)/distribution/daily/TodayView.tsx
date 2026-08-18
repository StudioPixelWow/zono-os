"use client";
// ============================================================================
// ZONO — "מה מפרסמים היום?" · unified daily Facebook publishing surface.
// ONE operational Today over the canonical distribution_posts (the same posts a
// campaign activation creates + the extension publishes). Presents today's plan
// with ONE customer status vocabulary (today-status), a single next-action hero,
// a chronological timeline, progress + completion/empty states, and inline
// reconciliation. It REUSES the existing engine actions (reconcile/retry/resume)
// — no new publishing mechanics. Ready items are published by the existing
// assisted extension; a "פתח קבוצה" fallback is offered.
// ============================================================================
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import type { PublishingControlData, ControlPost } from "@/lib/distribution/publishing-control-data";
import { toTodayStatus, type TodayStatus } from "@/lib/distribution/today-status";
import type { ExtensionReadinessView } from "@/lib/distribution/extension-readiness";
import { reconcilePostAction, retryPostAction, resumePostAction, requestPublishNowAction } from "@/lib/distribution/publishing-control-actions";

const TONE: Record<TodayStatus["tone"], string> = {
  muted: "bg-surface text-muted", brand: "bg-brand-soft text-brand", warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success", danger: "bg-danger-soft text-danger",
};
const timeHe = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "—");
const isToday = (iso: string | null) => { if (!iso) return false; const d = new Date(iso), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };

interface Row { post: ControlPost; st: TodayStatus; overdue: boolean }


export function TodayView({ data, readiness }: { data: PublishingControlData; readiness?: ExtensionReadinessView }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [observing, setObserving] = useState(false);
  const startObserving = () => setObserving(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());

  const rows: Row[] = useMemo(() => {
    const all = [...data.inFlight, ...data.reconciliation, ...data.failed, ...data.deadLetter, ...data.paused, ...data.queued];
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const p of all) {
      if (seen.has(p.id)) continue; seen.add(p.id);
      const due = !!p.scheduledAt && new Date(p.scheduledAt).getTime() <= nowMs;
      const st = toTodayStatus(p.state, { dueNow: due });
      // Today's operational set: due/overdue items + anything scheduled for today.
      if (!isToday(p.scheduledAt) && !(due && st.key !== "published")) continue;
      out.push({ post: p, st, overdue: due && (st.key === "ready" || st.key === "scheduled") });
    }
    return out.sort((a, b) => (a.post.scheduledAt ?? "").localeCompare(b.post.scheduledAt ?? ""));
  }, [data, nowMs]);

  const doneCount = rows.filter((r) => r.st.key === "published").length;
  const totalCount = rows.length;
  const pendingRows = rows.filter((r) => r.st.key !== "published" && r.st.key !== "cancelled");
  // Prefer a ready "publish next" item as the hero; fall back to any action-required item.
  const hero = pendingRows.find((r) => r.st.key === "ready") ?? pendingRows.find((r) => r.st.action) ?? pendingRows[0] ?? null;

  const run = (fn: () => Promise<{ error?: string }>) => {
    startObserving(); // sync Today quickly after any action
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res?.error) setError(res.error);
      router.refresh(); // pull authoritative state immediately after the action
    });
  };

  const [requested, setRequested] = useState<Set<string>>(new Set());
  const publishNow = (id: string) => {
    setRequested((r) => new Set(r).add(id)); // optimistic: mark queued-to-extension
    run(() => requestPublishNowAction(id));
  };

  // Active observation window (fast poll) auto-expires after ~2 minutes.
  useEffect(() => {
    if (!observing) return;
    const t = setTimeout(() => setObserving(false), 120_000);
    return () => clearTimeout(t);
  }, [observing]);

  // AUTHORITATIVE auto-sync: router.refresh() re-runs the server page (no full
  // reload, no scroll reset). Fast (3s) while observing an in-flight publish,
  // idle (12s) otherwise; paused while the tab is hidden; immediate on
  // return-from-Facebook (focus / visibility). All listeners cleaned up.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => { if (typeof document !== "undefined" && !document.hidden) router.refresh(); };
    const start = () => { if (timer) clearInterval(timer); timer = setInterval(tick, observing ? 3000 : 12000); };
    const onVis = () => { if (!document.hidden) { router.refresh(); start(); } };
    const onFocus = () => router.refresh();
    start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => { if (timer) clearInterval(timer); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onFocus); };
  }, [observing, router]);

  // DERIVED (not an effect): the optimistic "בתור לפרסום" note applies only while a
  // requested post is still a pre-dispatch ready/scheduled item. Once authoritative
  // data advances it (claimed / published / …), it drops out and the REAL status shows.
  const requestedActive = useMemo(() => {
    if (requested.size === 0) return requested;
    const byId = new Map(rows.map((r) => [r.post.id, r]));
    const next = new Set<string>();
    for (const id of requested) { const r = byId.get(id); if (r && (r.st.key === "ready" || r.st.key === "scheduled")) next.add(id); }
    return next;
  }, [requested, rows]);

  const nextFuture = useMemo(() => {
    const fut = data.queued
      .filter((p) => p.scheduledAt && new Date(p.scheduledAt).getTime() > nowMs)
      .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
    return fut[0] ?? null;
  }, [data, nowMs]);
  const dateHe = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }) : "");

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      {/* Header + progress */}
      <div>
        <h1 className="text-ink flex items-center gap-2 text-2xl font-black"><Icon name="Sun" size={22} /> פרסומים להיום</h1>
        <p className="text-muted mt-1 text-sm">
          {totalCount === 0 ? "אין פרסומים מתוכננים להיום." : `${totalCount} פרסומים · ${doneCount} פורסמו · ${pendingRows.length} ממתינים`}
        </p>
        {readiness && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[12px]">
            <span className={cn("inline-block h-2 w-2 rounded-full", readiness.isPublishable ? "bg-success" : readiness.state === "error" || readiness.state === "not_installed" ? "bg-danger" : "bg-warning")} />
            <span className="text-muted">תוסף ZONO</span>
            <span className={cn("font-bold", readiness.isPublishable ? "text-success" : "text-warning")}>{readiness.label}</span>
          </div>
        )}
        <div className="mt-1"><Link href="/distribution" className="text-brand text-[12px] font-bold">לכל הנכסים והכיסוי השיווקי ←</Link></div>
      </div>

      {error && <div className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-[12px]">{error}</div>}

      {readiness && !readiness.isPublishable && (
        <div className="bg-warning-soft text-warning rounded-[18px] px-4 py-3 text-[13px]">
          <b>הפרסום מתבצע דרך תוסף ZONO בדפדפן — כרגע הוא לא מוכן לפרסום.</b>{" "}
          ״פרסום עכשיו״ מסמן את הפריט לפרסום, והתוסף מפרסם אותו בקבוצה שבחרת לאחר אישורך.{" "}
          {readiness.hint}{" "}
          <span className="opacity-80">סטטוס התוסף: {readiness.label}.</span>{" "}
          <Link href="/settings/distribution-connections" className="font-bold underline">הגדרת התוסף</Link>
        </div>
      )}

      {/* Empty state */}
      {totalCount === 0 && (
        <div className="bg-card border-line rounded-[22px] border p-8 text-center">
          <div className="text-3xl">🗓️</div>
          <p className="text-ink mt-2 text-lg font-black">אין פרסומים מתוכננים להיום</p>
          {nextFuture ? (
            <div className="bg-brand-soft mx-auto mt-3 max-w-sm rounded-2xl p-4 text-right">
              <p className="text-brand text-xs font-bold">הפרסום הבא</p>
              <div className="text-ink mt-1 text-sm font-black">{dateHe(nextFuture.scheduledAt)} · {timeHe(nextFuture.scheduledAt)}</div>
              <div className="text-muted text-[12px]">{[nextFuture.groupName, nextFuture.campaignName].filter(Boolean).join(" · ") || "קמפיין פייסבוק"}</div>
              <Link href="/distribution" className="text-brand mt-2 inline-block text-[12px] font-bold">צפייה בקמפיין ←</Link>
            </div>
          ) : (
            <p className="text-muted mt-1 text-sm">כשתפעיל קמפיין, הפרסומים של היום יופיעו כאן.</p>
          )}
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/distribution/campaign-wizard" className="bg-brand rounded-xl px-5 py-2 text-sm font-black text-white">יצירת קמפיין</Link>
            <Link href="/distribution" className="border-line text-ink rounded-xl border px-5 py-2 text-sm font-bold">ליומן</Link>
          </div>
        </div>
      )}

      {/* Completion state */}
      {totalCount > 0 && pendingRows.length === 0 && (
        <div className="bg-success-soft rounded-[22px] p-6 text-center">
          <p className="text-success text-lg font-black">סיימת את הפרסומים להיום ✓</p>
          <p className="text-ink mt-1 text-sm">{doneCount} מתוך {totalCount} פורסמו</p>
        </div>
      )}

      {/* Next action hero */}
      {hero && (
        <div className="bg-brand-soft rounded-[22px] p-5">
          <p className="text-brand text-xs font-bold">הפרסום הבא שלך</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-ink text-xl font-black">{timeHe(hero.post.scheduledAt)} · {hero.post.title ?? hero.post.campaignName ?? "פרסום"}</div>
              <div className="text-muted text-[13px]">{[hero.post.groupName, hero.post.campaignName].filter(Boolean).join(" · ") || "קבוצת פייסבוק"}</div>
            </div>
            <span className={cn("rounded-full px-3 py-1 text-[12px] font-bold", TONE[hero.st.tone])}>{hero.st.label}</span>
          </div>
          <div className="mt-3"><HeroAction row={hero} pending={pending} run={run} requested={requestedActive} onPublishNow={publishNow} /></div>
        </div>
      )}

      {/* Timeline */}
      {totalCount > 0 && (
        <div className="bg-card border-line rounded-[22px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">לוח היום</p>
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.post.id} className={cn("border-line flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5", r.overdue && "border-warning/40")}>
                <span className="text-ink w-12 shrink-0 text-[13px] font-black tabular-nums">{timeHe(r.post.scheduledAt)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-ink truncate text-[13px] font-bold">{r.post.title ?? r.post.campaignName ?? "פרסום"}</div>
                  <div className="text-muted truncate text-[11px]">{[r.post.groupName, r.post.campaignName].filter(Boolean).join(" · ") || "קבוצת פייסבוק"}{r.overdue ? " · באיחור" : ""}</div>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold", TONE[r.st.tone])}>{r.st.label}</span>
                <div className="shrink-0"><RowAction row={r} pending={pending} run={run} requested={requestedActive} onPublishNow={publishNow} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fallback / advanced */}
      <details className="text-muted text-[12px]">
        <summary className="cursor-pointer font-bold">אפשרויות נוספות</summary>
        <div className="mt-2 flex gap-3">
          <Link href="/publishing-control" className="text-brand font-bold">בקרת פרסום מתקדמת</Link>
          <Link href="/distribution" className="text-brand font-bold">מרכז ההפצה</Link>
        </div>
      </details>
    </div>
  );
}

function RowAction({ row, pending, run, requested, onPublishNow }: { row: Row; pending: boolean; run: (fn: () => Promise<{ error?: string }>) => void; requested: Set<string>; onPublishNow: (id: string) => void }) {
  const { post, st } = row;
  if (st.action === "reconcile") return <ReconcileButtons postId={post.id} pending={pending} run={run} />;
  if (st.action === "fix") return <button disabled={pending} onClick={() => run(() => retryPostAction(post.id))} className="text-danger text-xs font-bold disabled:opacity-50">נסה שוב</button>;
  if (st.action === "resume") return <button disabled={pending} onClick={() => run(() => resumePostAction(post.id))} className="text-brand text-xs font-bold disabled:opacity-50">חידוש</button>;
  if (st.action === "assist_publish") {
    if (requested.has(post.id)) return <span className="text-brand text-[11px] font-bold">בתור לפרסום ✓</span>;
    return <button disabled={pending} onClick={() => onPublishNow(post.id)} className="bg-brand rounded-lg px-3 py-1 text-[11px] font-black text-white disabled:opacity-50">פרסום עכשיו</button>;
  }
  if (st.key === "published") return post.externalPostUrl ? <a href={post.externalPostUrl} target="_blank" rel="noopener noreferrer" className="text-success text-[11px] font-bold">צפייה בפוסט ↗</a> : null;
  return null;
}

function HeroAction({ row, pending, run, requested, onPublishNow }: { row: Row; pending: boolean; run: (fn: () => Promise<{ error?: string }>) => void; requested: Set<string>; onPublishNow: (id: string) => void }) {
  const { post, st } = row;
  if (st.action === "reconcile") return <ReconcileButtons postId={post.id} pending={pending} run={run} big />;
  if (st.action === "fix") return <button disabled={pending} onClick={() => run(() => retryPostAction(post.id))} className="bg-danger rounded-xl px-5 py-2 text-sm font-black text-white disabled:opacity-50">טיפול בפרסום</button>;
  if (st.action === "resume") return <button disabled={pending} onClick={() => run(() => resumePostAction(post.id))} className="bg-brand rounded-xl px-5 py-2 text-sm font-black text-white disabled:opacity-50">חידוש הפרסום</button>;
  // ready → explicit "publish now": prioritize this post for the extension session.
  if (requested.has(post.id)) return <p className="text-brand text-[13px] font-bold">בתור לפרסום ✓ · תוסף ZONO יפרסם את הפריט בקבוצה — ודא שהתוסף פעיל. הפרסום מאושר על ידך.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button disabled={pending} onClick={() => onPublishNow(post.id)} className="bg-brand rounded-xl px-6 py-2.5 text-sm font-black text-white disabled:opacity-50">{pending ? "מכינים את הפרסום…" : "פרסום עכשיו"}</button>
      <span className="text-muted text-[11px]">הפרסום בקבוצה מתבצע דרך התוסף ומאושר על ידך.</span>
    </div>
  );
}

function ReconcileButtons({ postId, pending, run, big }: { postId: string; pending: boolean; run: (fn: () => Promise<{ error?: string }>) => void; big?: boolean }) {
  const [url, setUrl] = useState("");
  const base = big ? "rounded-xl px-4 py-2 text-sm font-black" : "rounded-lg px-2.5 py-1 text-[11px] font-bold";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-warning w-full text-[11px]">לא הצלחנו לוודא אם הפרסום עלה לפייסבוק. בדוק בקבוצה: אם פרסמת — הדבק קישור לפוסט ולחץ ״פורסם״. אם לא — ״לא פורסם״. (כדי למנוע פרסום כפול, ZONO לא מנחש.)</span>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="קישור לפוסט (לא חובה)" dir="ltr" className="border-line bg-card text-ink w-44 rounded-lg border px-2 py-1 text-[11px]" />
      <button disabled={pending} onClick={() => run(() => reconcilePostAction(postId, "published", url.trim() || undefined))} className={cn(base, "bg-success-soft text-success disabled:opacity-50")}>פורסם</button>
      <button disabled={pending} onClick={() => run(() => reconcilePostAction(postId, "not_published"))} className={cn(base, "bg-surface text-ink disabled:opacity-50")}>לא פורסם</button>
      <button disabled={pending} onClick={() => run(() => reconcilePostAction(postId, "cancel"))} className={cn(base, "text-muted disabled:opacity-50")}>ביטול</button>
    </div>
  );
}
