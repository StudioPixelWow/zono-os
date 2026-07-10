"use client";
// ============================================================================
// 📅 ZONO OS 2.0 — Stage 0.4 · Meeting lifecycle controls (drop-in).
// Renders explicit status actions for a selected meeting: complete (+outcome,
// +optional follow-up task), no-show, cancel. Each calls an approval-gated
// server action; nothing auto-transitions. RTL, premium-light.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Spinner } from "@/components/ui/Button";
import {
  completeMeetingAction, markNoShowAction, cancelMeetingAction,
} from "@/lib/calendar-os/meeting-lifecycle-actions";

/** Strips the source-qualified id ("meeting:<uuid>") back to the raw meeting id. */
function rawMeetingId(eventId: string): string {
  return eventId.startsWith("meeting:") ? eventId.slice("meeting:".length) : eventId;
}

const TERMINAL = new Set(["completed", "cancelled", "no_show"]);
const STATUS_HE: Record<string, string> = {
  scheduled: "מתוכננת", confirmed: "מאושרת", completed: "הושלמה",
  cancelled: "בוטלה", no_show: "לא הגיע", rescheduled: "נדחתה",
};

export function MeetingLifecycleControls({ eventId, status }: { eventId: string; status: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<null | "complete">(null);
  const [outcome, setOutcome] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const id = rawMeetingId(eventId);
  const st = status ?? "scheduled";
  const done = TERMINAL.has(st);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (r.ok) { setMode(null); setOutcome(""); setFollowUp(""); router.refresh(); }
      else setErr(r.error ?? "הפעולה נכשלה.");
    });
  };

  return (
    <div className="bg-card border-line rounded-[18px] border p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-ink text-[13px] font-black">ניהול הפגישה</p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${done ? "bg-success-soft text-success" : "bg-brand-soft text-brand-strong"}`}>
          {STATUS_HE[st] ?? st}
        </span>
      </div>

      {done ? (
        <p className="text-muted text-[12px]">הפגישה נסגרה. ניתן לפתוח פגישה חדשה במקום.</p>
      ) : mode === "complete" ? (
        <div className="flex flex-col gap-2">
          <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={2}
            placeholder="סיכום ותוצאת הפגישה…"
            className="bg-surface border-line focus:border-brand w-full rounded-xl border px-3 py-2 text-[13px] outline-none" />
          <input value={followUp} onChange={(e) => setFollowUp(e.target.value)}
            placeholder="משימת המשך (אופציונלי)…"
            className="bg-surface border-line focus:border-brand w-full rounded-xl border px-3 py-2 text-[13px] outline-none" />
          <div className="flex gap-2">
            <button disabled={pending} onClick={() => run(() => completeMeetingAction(id, { outcome: outcome.trim() || null, followUpTitle: followUp.trim() || null }))}
              className="btn-zono-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-black text-white disabled:opacity-60">
              {pending ? <Spinner size={14} /> : <Icon name="Check" size={14} />} שמור סיכום
            </button>
            <button disabled={pending} onClick={() => setMode(null)} className="btn-zono-secondary rounded-xl px-3 py-2 text-[13px] font-bold">ביטול</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button disabled={pending} onClick={() => setMode("complete")}
            className="btn-zono-primary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-black text-white disabled:opacity-60">
            <Icon name="Check" size={14} /> הושלמה
          </button>
          <button disabled={pending} onClick={() => run(() => markNoShowAction(id))}
            className="btn-zono-secondary rounded-xl px-3 py-2 text-[13px] font-bold disabled:opacity-60">לא הגיע</button>
          <button disabled={pending} onClick={() => run(() => cancelMeetingAction(id))}
            className="text-danger border-line hover:border-danger rounded-xl border px-3 py-2 text-[13px] font-bold disabled:opacity-60">בטל פגישה</button>
        </div>
      )}
      {err && <p className="text-danger mt-2 text-[11px] font-bold">{err}</p>}
    </div>
  );
}
