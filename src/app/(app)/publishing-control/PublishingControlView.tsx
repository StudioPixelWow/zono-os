"use client";
// ============================================================================
// ZONO — Publishing Control Center (client). Real-time operational cockpit for
// the canonical Facebook Groups publishing engine (P0). Wired to the P0 control
// actions — every button routes through the state machine + append-only audit.
// RTL, ZONO glass/purple language, honest empty states, real data only.
// ============================================================================
import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Glass, StatTile, SectionHeading, EmptyState, Icon, nfmt,
} from "@/app/(app)/distribution/_center/shared";
import { cn } from "@/lib/utils";
import {
  retryPostAction, pausePostAction, resumePostAction, cancelPostAction,
  reconcilePostAction, engageEmergencyStopAction, releaseEmergencyStopAction,
} from "@/lib/distribution/publishing-control-actions";
import type { ControlPost, ControlEvent, PublishingControlData } from "@/lib/distribution/publishing-control-data";

// ── State display metadata (Hebrew labels + tone) ────────────────────────────
const STATE_META: Record<string, { label: string; tone: string; icon: string }> = {
  draft: { label: "טיוטה", tone: "text-muted bg-line/40", icon: "Pencil" },
  queued: { label: "בתור", tone: "text-brand-strong bg-brand-soft", icon: "ListChecks" },
  scheduled: { label: "מתוזמן", tone: "text-brand-strong bg-brand-soft", icon: "Clock" },
  dispatching: { label: "נשלח לפרסום", tone: "text-sky-700 bg-sky-100", icon: "Send" },
  awaiting_confirmation: { label: "ממתין לאישור", tone: "text-sky-700 bg-sky-100", icon: "Loader" },
  awaiting_reconciliation: { label: "דורש הכרעה", tone: "text-warning bg-warning-soft", icon: "HelpCircle" },
  published: { label: "פורסם", tone: "text-success bg-success-soft", icon: "CheckCircle" },
  failed: { label: "נכשל", tone: "text-danger bg-danger-soft", icon: "AlertTriangle" },
  paused: { label: "מושהה", tone: "text-muted bg-line/50", icon: "Lock" },
  cancelled: { label: "בוטל", tone: "text-muted bg-line/40", icon: "X" },
  dead_letter: { label: "כשל סופי", tone: "text-danger bg-danger-soft", icon: "AlertCircle" },
};

function StatePill({ state }: { state: string }) {
  const m = STATE_META[state] ?? { label: state, tone: "text-muted bg-line/40", icon: "Tag" };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold", m.tone)}>
      <Icon name={m.icon} size={12} />
      {m.label}
    </span>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return "עכשיו";
  if (min < 60) return `לפני ${min} ד׳`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `לפני ${hr} ש׳`;
  const d = Math.round(hr / 24);
  return `לפני ${d} ימים`;
}

// ── One execution row with contextual actions ────────────────────────────────
function PostRow({
  post, actions, busy, onAction,
}: {
  post: ControlPost;
  actions: Array<{ key: string; label: string; icon: string; tone?: "brand" | "danger" | "muted" | "success"; run: () => Promise<{ ok: boolean; error?: string }> }>;
  busy: boolean;
  onAction: (run: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const toneCls: Record<string, string> = {
    brand: "zono-gradient text-white",
    success: "bg-success text-white",
    danger: "bg-danger text-white",
    muted: "zono-glass text-ink",
  };
  return (
    <Glass className="flex flex-col gap-2.5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <StatePill state={post.state} />
            {post.groupName && (
              <span className="text-ink inline-flex items-center gap-1 text-xs font-bold">
                <Icon name="Users" size={12} /> {post.groupName}
              </span>
            )}
            {post.campaignName && <span className="text-muted text-[11px]">· {post.campaignName}</span>}
          </div>
          <p className="text-ink line-clamp-2 text-sm font-medium">{post.text ?? post.title ?? "—"}</p>
          <div className="text-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
            {post.attemptCount > 0 && <span>ניסיון {post.attemptCount}/{post.maxAttempts}</span>}
            {post.failureCode && <span className="text-danger">קוד: {post.failureCode}</span>}
            {post.failureReason && <span className="text-danger line-clamp-1 max-w-[240px]">{post.failureReason}</span>}
            {post.nextRetryAt && <span>ניסיון חוזר {timeAgo(post.nextRetryAt)}</span>}
            {post.leaseExpiresAt && post.state === "dispatching" && <span>נעילה עד {new Date(post.leaseExpiresAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>}
            {post.updatedAt && <span>עודכן {timeAgo(post.updatedAt)}</span>}
            {post.externalPostUrl && (
              <a href={post.externalPostUrl} target="_blank" rel="noopener noreferrer" className="text-brand-strong inline-flex items-center gap-0.5 font-bold">
                <Icon name="ExternalLink" size={11} /> הפוסט
              </a>
            )}
          </div>
        </div>
      </div>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={busy}
              onClick={() => onAction(a.run)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50",
                toneCls[a.tone ?? "muted"],
              )}
            >
              <Icon name={a.icon} size={13} /> {a.label}
            </button>
          ))}
        </div>
      )}
    </Glass>
  );
}

// ── Reconciliation row: explicit human decision only ─────────────────────────
function ReconcileRow({ post, busy, onAction }: { post: ControlPost; busy: boolean; onAction: (run: () => Promise<{ ok: boolean; error?: string }>) => void }) {
  const [url, setUrl] = useState("");
  return (
    <Glass className="flex flex-col gap-2.5 border border-warning/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatePill state={post.state} />
        {post.groupName && <span className="text-ink inline-flex items-center gap-1 text-xs font-bold"><Icon name="Users" size={12} /> {post.groupName}</span>}
        <span className="text-muted text-[11px]">עודכן {timeAgo(post.updatedAt)}</span>
      </div>
      <p className="text-ink line-clamp-2 text-sm font-medium">{post.text ?? post.title ?? "—"}</p>
      <p className="text-warning text-[11px] font-semibold">אישור אבד — יש להכריע ידנית האם הפוסט פורסם בפועל. לא יישלח שוב אוטומטית.</p>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="קישור לפוסט שפורסם (אופציונלי)"
        dir="ltr"
        className="zono-glass text-ink w-full rounded-xl px-3 py-2 text-xs outline-none placeholder:text-muted"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => onAction(() => reconcilePostAction(post.id, "published", url || null))}
          className="bg-success inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-50">
          <Icon name="CheckCircle" size={13} /> פורסם בפועל
        </button>
        <button type="button" disabled={busy} onClick={() => onAction(() => reconcilePostAction(post.id, "not_published"))}
          className="zono-gradient inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-50">
          <Icon name="RefreshCw" size={13} /> לא פורסם — לתור מחדש
        </button>
        <button type="button" disabled={busy} onClick={() => onAction(() => reconcilePostAction(post.id, "cancel"))}
          className="zono-glass text-ink inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50">
          <Icon name="X" size={13} /> ביטול
        </button>
      </div>
    </Glass>
  );
}

export function PublishingControlView({ data }: { data: PublishingControlData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [showStop, setShowStop] = useState(false);
  const [stopReason, setStopReason] = useState("");

  const run = useCallback((fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setMsg(res.error ?? "הפעולה נכשלה");
      router.refresh();
    });
  }, [router]);

  if (!data.ready) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8" dir="rtl">
        <EmptyState icon="Lock" title="נדרשת התחברות" body="יש להתחבר לחשבון עם ארגון פעיל כדי לצפות במרכז בקרת הפרסום." />
      </div>
    );
  }

  const { totals, stateCounts, controls } = data;
  const hasAnyActivity = totals.active > 0 || totals.publishedAllTime > 0 || data.events.length > 0 || controls.length > 0;
  const stopActive = controls.length > 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="zono-ai-gradient grid h-11 w-11 place-items-center rounded-2xl text-white">
            <Icon name="Shield" size={22} />
          </span>
          <div>
            <h1 className="text-ink text-2xl font-black">מרכז בקרת פרסום</h1>
            <p className="text-muted text-xs font-medium">ניטור וניהול תפעולי של מנוע הפרסום בקבוצות — בזמן אמת, על בסיס נתונים אמיתיים בלבד.</p>
          </div>
        </div>
        <button type="button" onClick={() => router.refresh()} disabled={pending}
          className="zono-glass text-ink inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition disabled:opacity-50">
          <Icon name="RefreshCw" size={15} /> רענון
        </button>
      </div>

      {msg && (
        <div className="bg-danger-soft text-danger flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
          <Icon name="AlertTriangle" size={16} /> {msg}
        </div>
      )}

      {/* Emergency stop banner / control */}
      <Glass className={cn("flex flex-col gap-3 p-4", stopActive ? "border border-danger/40 bg-danger-soft/40" : "")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className={cn("grid h-9 w-9 place-items-center rounded-xl", stopActive ? "bg-danger text-white" : "bg-danger-soft text-danger")}>
              <Icon name={stopActive ? "AlertTriangle" : "ShieldCheck"} size={17} />
            </span>
            <div>
              <p className="text-ink text-sm font-black">{stopActive ? "עצירת חירום פעילה" : "עצירת חירום"}</p>
              <p className="text-muted text-[11px] font-medium">
                {stopActive ? "אף פוסט לא יישלח לפרסום כל עוד העצירה פעילה." : "עצירה מיידית של כל שליחה לפרסום בארגון. מנהל+ בלבד."}
              </p>
            </div>
          </div>
          {!stopActive && (
            <button type="button" onClick={() => setShowStop((v) => !v)}
              className="bg-danger inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-white transition">
              <Icon name="AlertTriangle" size={15} /> עצור הכל
            </button>
          )}
        </div>

        {showStop && !stopActive && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="text" value={stopReason} onChange={(e) => setStopReason(e.target.value)}
              placeholder="סיבת העצירה (אופציונלי)"
              className="zono-glass text-ink min-w-[220px] flex-1 rounded-xl px-3 py-2 text-sm outline-none placeholder:text-muted" />
            <button type="button" disabled={pending}
              onClick={() => run(() => engageEmergencyStopAction("organization", null, stopReason).then((r) => { if (r.ok) { setShowStop(false); setStopReason(""); } return r; }))}
              className="bg-danger inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              <Icon name="AlertTriangle" size={15} /> אשר עצירת חירום
            </button>
          </div>
        )}

        {stopActive && (
          <div className="flex flex-col gap-2">
            {controls.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/60 px-3 py-2">
                <div className="text-ink text-xs font-bold">
                  {c.scopeLabel}
                  {c.reason && <span className="text-muted mr-2 font-medium">· {c.reason}</span>}
                  <span className="text-muted mr-2 font-medium">· {c.createdByName ?? "—"} · {timeAgo(c.createdAt)}</span>
                </div>
                <button type="button" disabled={pending}
                  onClick={() => run(() => releaseEmergencyStopAction(c.scope, c.scopeId))}
                  className="bg-success inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                  <Icon name="Check" size={13} /> שחרר
                </button>
              </div>
            ))}
          </div>
        )}
      </Glass>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="פעילים כעת" value={nfmt(totals.active)} hint="רשומות ביצוע לא-סופיות" icon="Activity" tone="brand" />
        <StatTile label="בטיפול (in-flight)" value={nfmt(totals.inFlight)} hint="נשלחו / ממתינים לאישור" icon="Send" tone="accent" />
        <StatTile label="דורש התערבות" value={nfmt(totals.needsHuman)} hint="הכרעה / כשל / כשל סופי" icon="AlertTriangle" tone={totals.needsHuman > 0 ? "warning" : "success"} />
        <StatTile label="פורסמו (מצטבר)" value={nfmt(totals.publishedAllTime)} hint="סה״כ פרסומים שהושלמו" icon="CheckCircle" tone="success" />
      </div>

      {!hasAnyActivity && (
        <EmptyState icon="Megaphone" title="אין עדיין פעילות פרסום"
          body="כשקמפיינים יתחילו לרוץ, כל רשומת ביצוע לכל קבוצה תופיע כאן בזמן אמת עם מצב, ניסיונות, וכלי בקרה. אין כאן נתוני דמה — רק פעילות אמיתית." />
      )}

      {/* Needs human — reconciliation */}
      {data.reconciliation.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading icon="HelpCircle" title="דורש הכרעה ידנית" subtitle="אישור פרסום אבד — הכרעה מפורשת בלבד, לעולם לא שליחה חוזרת אוטומטית" />
          <div className="grid gap-3 md:grid-cols-2">
            {data.reconciliation.map((p) => <ReconcileRow key={p.id} post={p} busy={pending} onAction={run} />)}
          </div>
        </section>
      )}

      {/* Failed */}
      {data.failed.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading icon="AlertTriangle" title="נכשלו" subtitle="ניתן לנסות שוב (חוזר לתור לניסיון בטוח) או לבטל" />
          <div className="grid gap-3 md:grid-cols-2">
            {data.failed.map((p) => (
              <PostRow key={p.id} post={p} busy={pending} onAction={run} actions={[
                { key: "retry", label: "נסה שוב", icon: "RefreshCw", tone: "brand", run: () => retryPostAction(p.id) },
                { key: "cancel", label: "בטל", icon: "X", tone: "muted", run: () => cancelPostAction(p.id) },
              ]} />
            ))}
          </div>
        </section>
      )}

      {/* Dead letter */}
      {data.deadLetter.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading icon="AlertCircle" title="כשל סופי" subtitle="מוצו כל הניסיונות — החייאה ידנית בלבד" />
          <div className="grid gap-3 md:grid-cols-2">
            {data.deadLetter.map((p) => (
              <PostRow key={p.id} post={p} busy={pending} onAction={run} actions={[
                { key: "revive", label: "החזר לתור", icon: "RefreshCw", tone: "brand", run: () => retryPostAction(p.id) },
                { key: "cancel", label: "בטל", icon: "X", tone: "muted", run: () => cancelPostAction(p.id) },
              ]} />
            ))}
          </div>
        </section>
      )}

      {/* In-flight */}
      {data.inFlight.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading icon="Send" title="בטיפול כעת" subtitle="נשלחו לפרסום או ממתינים לאישור מהסוכן" />
          <div className="grid gap-3 md:grid-cols-2">
            {data.inFlight.map((p) => (
              <PostRow key={p.id} post={p} busy={pending} onAction={run} actions={[
                { key: "cancel", label: "בטל", icon: "X", tone: "muted", run: () => cancelPostAction(p.id) },
              ]} />
            ))}
          </div>
        </section>
      )}

      {/* Paused */}
      {data.paused.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading icon="Lock" title="מושהים" subtitle="ממתינים לחידוש ידני" />
          <div className="grid gap-3 md:grid-cols-2">
            {data.paused.map((p) => (
              <PostRow key={p.id} post={p} busy={pending} onAction={run} actions={[
                { key: "resume", label: "חדש", icon: "RefreshCw", tone: "success", run: () => resumePostAction(p.id) },
                { key: "cancel", label: "בטל", icon: "X", tone: "muted", run: () => cancelPostAction(p.id) },
              ]} />
            ))}
          </div>
        </section>
      )}

      {/* Queued */}
      {data.queued.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading icon="ListChecks" title={`בתור לפרסום (${nfmt(data.queued.length)})`} subtitle="ממתינים להישלח — ניתן להשהות או לבטל" />
          <div className="grid gap-3 md:grid-cols-2">
            {data.queued.slice(0, 40).map((p) => (
              <PostRow key={p.id} post={p} busy={pending} onAction={run} actions={[
                { key: "pause", label: "השהה", icon: "Lock", tone: "muted", run: () => pausePostAction(p.id) },
                { key: "cancel", label: "בטל", icon: "X", tone: "muted", run: () => cancelPostAction(p.id) },
              ]} />
            ))}
          </div>
          {data.queued.length > 40 && <p className="text-muted text-center text-xs">מוצגים 40 מתוך {nfmt(data.queued.length)} — צמצם דרך הקמפיין.</p>}
        </section>
      )}

      {/* Per-group publishing performance (canonical: publish_state) */}
      {data.groupStats.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading icon="BarChart3" title="ביצועי פרסום לפי קבוצה" subtitle="אחוז הצלחה, פרסומים/כשלים, ניסיונות ופרסום אחרון — מתוך מנוע הפרסום הקנוני" />
          <Glass className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="text-muted border-line/60 border-b text-[11px]">
                    <th className="px-3 py-2 font-bold">קבוצה</th>
                    <th className="px-3 py-2 font-bold">הצלחה</th>
                    <th className="px-3 py-2 font-bold">פורסמו</th>
                    <th className="px-3 py-2 font-bold">נכשלו</th>
                    <th className="px-3 py-2 font-bold">בטיפול</th>
                    <th className="px-3 py-2 font-bold">ניסיונות</th>
                    <th className="px-3 py-2 font-bold">פורסם לאחרונה</th>
                  </tr>
                </thead>
                <tbody>
                  {data.groupStats.slice(0, 50).map((g) => {
                    const tone = g.published + g.failed + g.deadLetter === 0 ? "text-muted"
                      : g.successRate >= 80 ? "text-success" : g.successRate >= 50 ? "text-brand-strong" : "text-danger";
                    return (
                      <tr key={g.groupId} className="border-line/40 border-b last:border-0">
                        <td className="text-ink px-3 py-2 font-bold">
                          {g.groupName || "—"}
                          {g.topFailureCode && <span className="text-danger mr-2 text-[10px] font-medium">· {g.topFailureCode}</span>}
                        </td>
                        <td className={cn("px-3 py-2 font-black tabular-nums", tone)}>
                          {g.published + g.failed + g.deadLetter === 0 ? "—" : `${g.successRate}%`}
                        </td>
                        <td className="text-success px-3 py-2 tabular-nums">{nfmt(g.published)}</td>
                        <td className="text-danger px-3 py-2 tabular-nums">{nfmt(g.failed + g.deadLetter)}</td>
                        <td className="text-muted px-3 py-2 tabular-nums">{nfmt(g.inFlight)}</td>
                        <td className="text-muted px-3 py-2 tabular-nums">{g.avgAttempts || "—"}</td>
                        <td className="text-muted px-3 py-2 text-[11px]">{g.lastPublishedAt ? timeAgo(g.lastPublishedAt) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Glass>
          {data.groupStats.length > 50 && <p className="text-muted text-center text-xs">מוצגות 50 קבוצות מובילות מתוך {nfmt(data.groupStats.length)}.</p>}
        </section>
      )}

      {/* Live event feed */}
      <section className="flex flex-col gap-3">
        <SectionHeading icon="Activity" title="יומן פעילות" subtitle="היסטוריית מעברי מצב — לוג בלתי-ניתן-לשינוי (append-only)" />
        {data.events.length === 0 ? (
          <EmptyState icon="ScrollText" title="אין עדיין אירועים" body="כל מעבר מצב של כל פוסט יירשם כאן אוטומטית ברגע שהמנוע יתחיל לפעול." />
        ) : (
          <Glass className="flex flex-col divide-y divide-line/60">
            {data.events.map((e: ControlEvent) => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon name={STATE_META[e.toState]?.icon ?? "Tag"} size={14} />
                  <span className="text-ink text-xs font-bold">
                    {e.fromState ? `${STATE_META[e.fromState]?.label ?? e.fromState} → ` : ""}{STATE_META[e.toState]?.label ?? e.toState}
                  </span>
                  <span className="text-muted truncate text-[11px]">
                    {e.groupName ? `· ${e.groupName} ` : ""}{e.reason ? `· ${e.reason}` : ""}
                  </span>
                </div>
                <div className="text-muted shrink-0 text-[11px]">
                  {e.actorName ? `${e.actorName} · ` : ""}{timeAgo(e.occurredAt)}
                </div>
              </div>
            ))}
          </Glass>
        )}
      </section>

      {/* State distribution footer */}
      {totals.active > 0 && (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(stateCounts) as Array<keyof typeof stateCounts>)
            .filter((s) => stateCounts[s] > 0)
            .map((s) => (
              <span key={s} className="zono-glass text-ink inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold">
                <StatePill state={s} /> {nfmt(stateCounts[s])}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
