"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { CHANNEL_LABELS, SENTIMENT_LABELS } from "@/lib/communication/engine";
import {
  completeFollowupAction, logCommunicationAction, setCommitmentStatusAction,
} from "@/lib/communication/actions";
import type { CommunicationHealth } from "@/lib/communication/service";

const field = "bg-surface border-line text-ink focus:border-brand-light w-full rounded-xl border px-3 py-2 text-sm outline-none transition";
const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-danger");
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");
const CHANNELS = ["phone", "whatsapp", "email", "meeting", "note", "system"] as const;
const SENTIMENTS = ["positive", "neutral", "negative", "urgent"] as const;
const evLabel = (t: string) => CHANNEL_LABELS[t.replace("communication.", "").replace("_logged", "")] ?? "תקשורת";

// ── CommunicationLogForm ─────────────────────────────────────────────────────
export function CommunicationLogForm({ entityType, entityId, onDone }: { entityType: string; entityId: string; onDone?: () => void }) {
  const router = useRouter();
  const [channel, setChannel] = useState("phone");
  const [direction, setDirection] = useState("outbound");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sentiment, setSentiment] = useState("neutral");
  const [hasFollowup, setHasFollowup] = useState(false);
  const [followupTitle, setFollowupTitle] = useState("");
  const [followupDue, setFollowupDue] = useState("");
  const [createTask, setCreateTask] = useState(false);
  const [hasCommitment, setHasCommitment] = useState(false);
  const [commitmentText, setCommitmentText] = useState("");
  const [commitmentDue, setCommitmentDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    if (!title.trim()) { setError("נדרשת כותרת"); return; }
    setError(null);
    start(async () => {
      const r = await logCommunicationAction({
        entityType, entityId, channel, direction, title: title.trim(), body: body.trim() || null, sentiment,
        followupTitle: hasFollowup && followupTitle.trim() ? followupTitle.trim() : null,
        followupDueAt: hasFollowup && followupDue ? new Date(followupDue).toISOString() : null,
        createTask: hasFollowup && createTask,
        commitmentText: hasCommitment && commitmentText.trim() ? commitmentText.trim() : null,
        commitmentDueDate: hasCommitment && commitmentDue ? new Date(commitmentDue).toISOString() : null,
      });
      if (r.error) { setError(r.error); return; }
      setTitle(""); setBody(""); setSentiment("neutral"); setHasFollowup(false); setFollowupTitle(""); setFollowupDue("");
      setCreateTask(false); setHasCommitment(false); setCommitmentText(""); setCommitmentDue("");
      router.refresh();
      onDone?.();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">ערוץ</span>
          <select className={field} value={channel} onChange={(e) => setChannel(e.target.value)}>{CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">כיוון</span>
          <select className={field} value={direction} onChange={(e) => setDirection(e.target.value)}><option value="outbound">יוצא</option><option value="inbound">נכנס</option></select></label>
        <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">סנטימנט</span>
          <select className={field} value={sentiment} onChange={(e) => setSentiment(e.target.value)}>{SENTIMENTS.map((s) => <option key={s} value={s}>{SENTIMENT_LABELS[s]}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">כותרת</span>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="נושא השיחה" /></label>
      </div>
      <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">סיכום / תוכן</span>
        <textarea className={cn(field, "min-h-[64px]")} value={body} onChange={(e) => setBody(e.target.value)} placeholder="מה נאמר, מה הוסכם, מה השלב הבא" /></label>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="bg-surface rounded-xl p-2.5">
          <label className="text-ink flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={hasFollowup} onChange={(e) => setHasFollowup(e.target.checked)} /> פולואפ נדרש?</label>
          {hasFollowup && (
            <div className="mt-2 flex flex-col gap-2">
              <input className={field} value={followupTitle} onChange={(e) => setFollowupTitle(e.target.value)} placeholder="מה לעשות בפולואפ" />
              <input className={field} type="date" value={followupDue} onChange={(e) => setFollowupDue(e.target.value)} />
              <label className="text-muted flex items-center gap-2 text-[11px]"><input type="checkbox" checked={createTask} onChange={(e) => setCreateTask(e.target.checked)} /> צור גם משימה</label>
            </div>
          )}
        </div>
        <div className="bg-surface rounded-xl p-2.5">
          <label className="text-ink flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={hasCommitment} onChange={(e) => setHasCommitment(e.target.checked)} /> הובטחה התחייבות?</label>
          {hasCommitment && (
            <div className="mt-2 flex flex-col gap-2">
              <input className={field} value={commitmentText} onChange={(e) => setCommitmentText(e.target.value)} placeholder="למשל: אשלח דוח עד מחר" />
              <input className={field} type="date" value={commitmentDue} onChange={(e) => setCommitmentDue(e.target.value)} />
            </div>
          )}
        </div>
      </div>
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      <div><Button size="sm" onClick={submit} disabled={pending} leadingIcon={<Icon name="Send" size={15} />}>{pending ? "שומר…" : "תעד תקשורת"}</Button></div>
    </div>
  );
}

// ── CommunicationHealthCard (+ followups, commitments, timeline, reply) ───────
export function CommunicationHealthCard({ entityType, entityId, health }: { entityType: string; entityId: string; health: CommunicationHealth }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const p = health.profile;
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => { await fn(); router.refresh(); });

  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="MessageCircle" size={16} /></span>
          <h3 className="text-ink text-sm font-extrabold">בריאות תקשורת</h3>
        </div>
        <Button size="sm" variant={open ? "ghost" : "secondary"} onClick={() => setOpen((v) => !v)} leadingIcon={<Icon name="Plus" size={14} />}>{open ? "סגור" : "תקשורת חדשה"}</Button>
      </div>

      {open && <div className="border-line mb-4 rounded-2xl border p-3"><CommunicationLogForm entityType={entityType} entityId={entityId} onDone={() => setOpen(false)} /></div>}

      {!p ? (
        <p className="text-muted text-sm">אין עדיין תקשורת מתועדת. לחץ ״תקשורת חדשה״ כדי להתחיל.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="בריאות" value={p.communication_health_score} />
            <Tile label="היענות" value={p.responsiveness_score} />
            <Tile label="סנטימנט" value={p.sentiment_score} />
            <Tile label="סיכון פולואפ" value={p.followup_risk_score} invert />
          </div>
          <p className="text-muted mt-3 grid grid-cols-2 gap-1 text-xs sm:grid-cols-4">
            <span>קשר אחרון: <b className="text-ink">{p.days_since_contact == null ? "—" : `${p.days_since_contact} ימים`}</b></span>
            <span>לא נענו: <b className="text-ink">{p.unanswered_messages_count}</b></span>
            <span>פולואפים פתוחים: <b className="text-ink">{health.followups.length}</b></span>
            <span>התחייבויות: <b className="text-ink">{health.commitments.length}</b></span>
          </p>
          <div className="bg-brand-soft mt-3 rounded-xl p-3">
            <p className="text-brand-strong flex items-center gap-1.5 text-sm font-bold"><Icon name="Sparkles" size={15} /> פעולה מומלצת</p>
            <p className="text-ink mt-1 text-sm">{p.next_best_action}</p>
            <p className="text-muted mt-1 text-[11px]">השפעה: אמון {sign(p.trust_impact_score)} · מעורבות {sign(p.engagement_impact_score)} · מומנטום {sign(p.momentum_impact_score)}</p>
          </div>

          {health.commitments.length > 0 && (
            <div className="mt-3">
              <p className="text-ink mb-1 text-xs font-bold">התחייבויות פתוחות</p>
              <ul className="flex flex-col gap-1.5">
                {health.commitments.map((c) => (
                  <li key={c.id} className="border-line flex items-center justify-between gap-2 rounded-xl border p-2 text-xs">
                    <span className="text-ink min-w-0 flex-1 truncate">{c.commitment_text} {c.due_date && <span className="text-muted">· עד {fmt(c.due_date)}</span>}</span>
                    <button className="text-success font-bold" disabled={pending} onClick={() => run(() => setCommitmentStatusAction(c.id, "fulfilled", entityType, entityId))}>קוים</button>
                    <button className="text-danger font-bold" disabled={pending} onClick={() => run(() => setCommitmentStatusAction(c.id, "broken", entityType, entityId))}>נשבר</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {health.followups.length > 0 && (
            <div className="mt-3">
              <p className="text-ink mb-1 text-xs font-bold">פולואפים</p>
              <ul className="flex flex-col gap-1.5">
                {health.followups.map((f) => (
                  <li key={f.id} className="border-line flex items-center justify-between gap-2 rounded-xl border p-2 text-xs">
                    <span className="text-ink min-w-0 flex-1 truncate">{f.title} {f.due_at && <span className="text-muted">· עד {fmt(f.due_at)}</span>}</span>
                    <button className="text-success font-bold" disabled={pending} onClick={() => run(() => completeFollowupAction(f.id, entityType, entityId))}>בוצע</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested reply (draft only — no external sending yet) */}
          <div className="bg-surface mt-3 rounded-xl p-3">
            <p className="text-ink flex items-center gap-1.5 text-xs font-bold"><Icon name="Send" size={13} /> טיוטת הודעה מוצעת</p>
            <p className="text-muted mt-1 whitespace-pre-wrap text-[11px] leading-relaxed">{health.suggestedReply}</p>
          </div>

          {health.recent.length > 0 && (
            <div className="mt-3">
              <p className="text-ink mb-1 text-xs font-bold">ציר תקשורת</p>
              <ul className="flex flex-col gap-1">
                {health.recent.slice(0, 6).map((r, i) => (
                  <li key={i} className="text-muted flex items-center gap-2 text-[11px]">
                    <span className={cn("rounded-md px-1.5 py-0.5 font-bold", r.direction === "inbound" ? "bg-success-soft text-success" : "bg-brand-soft text-brand-strong")}>{evLabel(r.eventType)}</span>
                    <span className="text-ink min-w-0 flex-1 truncate">{r.title}</span>
                    {r.sentiment && <span className="shrink-0">{SENTIMENT_LABELS[r.sentiment] ?? r.sentiment}</span>}
                    <span className="shrink-0">{fmt(r.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const t = invert ? (value >= 55 ? "text-danger" : value >= 30 ? "text-brand-strong" : "text-success") : tone(value);
  return (
    <div className="bg-surface rounded-2xl p-2.5">
      <p className="text-muted text-[11px] font-bold">{label}</p>
      <p className={cn("text-2xl font-black", t)}>{value}</p>
    </div>
  );
}
function sign(n: number) { return `${n >= 0 ? "+" : ""}${n}`; }
