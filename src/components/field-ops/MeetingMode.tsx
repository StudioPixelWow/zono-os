"use client";
// ============================================================================
// 📱 ZONO Mobile Field Operations™ — Meeting Mode (RTL, one-hand). 41.0.
// Timer + quick notes + tasks + next follow-up. Saving a meeting summary REUSES
// logCommunication (channel: meeting) — approval-gated, evidence-only. Voice
// recording + AI summary are explicit placeholders (no fabricated output).
// ============================================================================
import { useEffect, useRef, useState, useTransition } from "react";
import { fieldLogMeetingAction, fieldCreateTaskAction } from "@/lib/field-ops/actions";

function fmt(sec: number): string { const m = Math.floor(sec / 60), s = sec % 60; return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; }

export function MeetingMode({ entityType, entityId, subject }: { entityType: string; entityId: string; subject: string }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [notes, setNotes] = useState("");
  const [task, setTask] = useState("");
  const [followup, setFollowup] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) timer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running]);

  const saveMeeting = () => start(async () => {
    const dueAt = followup ? new Date(Date.now() + 3 * 86_400_000).toISOString() : null;
    const r = await fieldLogMeetingAction(entityType, entityId, `פגישה · ${subject}`, notes || `פגישה בת ${fmt(elapsed)}`, dueAt);
    setMsg(r.message ?? (r.ok ? "נשמר" : "שגיאה"));
    if (r.ok) setRunning(false);
  });
  const addTask = () => { if (!task.trim()) return; start(async () => { const r = await fieldCreateTaskAction(entityId, task); setMsg(r.message ?? "משימה נוצרה"); if (r.ok) setTask(""); }); };

  return (
    <div dir="rtl" className="bg-card border-line rounded-2xl border p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <div className="text-ink text-[15px] font-black">🤝 מצב פגישה</div>
        <div className={`rounded-xl px-3 py-1.5 text-lg font-black tabular-nums ${running ? "bg-success-soft text-success" : "bg-surface text-muted"}`}>{fmt(elapsed)}</div>
      </div>
      <button onClick={() => setRunning((v) => !v)} className={`mt-3 w-full rounded-xl py-2.5 text-[13px] font-bold ${running ? "bg-danger-soft text-danger" : "btn-zono-primary text-white"}`}>{running ? "עצור פגישה" : elapsed > 0 ? "המשך" : "התחל פגישה"}</button>

      <div className="mt-3">
        <label className="text-muted text-[11px] font-bold">🎙️ הקלטה קולית</label>
        <div className="bg-surface text-muted mt-1 rounded-xl p-2.5 text-center text-[12px]">בקרוב — הקלטה + סיכום AI (דורש אישור)</div>
      </div>

      <div className="mt-3">
        <label className="text-muted text-[11px] font-bold">📝 הערות מהירות</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="נקודות עיקריות מהפגישה…" className="bg-surface border-line text-ink mt-1 w-full rounded-xl border p-2 text-[13px] outline-none" />
      </div>

      <div className="mt-3 flex gap-2">
        <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="משימת המשך…" className="bg-surface border-line text-ink flex-1 rounded-xl border px-3 py-2 text-[13px] outline-none" />
        <button disabled={pending} onClick={addTask} className="bg-brand-soft text-brand rounded-xl px-3 py-2 text-[12px] font-bold disabled:opacity-50">הוסף</button>
      </div>

      <label className="mt-3 flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={followup} onChange={(e) => setFollowup(e.target.checked)} className="h-4 w-4" />
        <span className="text-ink font-semibold">קבע מעקב (בעוד 3 ימים)</span>
      </label>

      <button disabled={pending} onClick={saveMeeting} className="btn-zono-primary zono-focus-ring mt-3 w-full rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "…" : "שמור סיכום פגישה"}</button>
      {msg && <div className="text-success mt-2 text-center text-[12px] font-bold">{msg}</div>}
      <div className="text-muted mt-1 text-center text-[10px]">הסיכום נשמר בהיסטוריית התקשורת — לא נשלח ללקוח.</div>
    </div>
  );
}
