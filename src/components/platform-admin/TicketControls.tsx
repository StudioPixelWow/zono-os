"use client";
// ============================================================================
// ZONO — PLATFORM SUPPORT ticket controls (P5.7, client). Interactive status /
// priority / assignment / note controls that invoke the audited server actions.
// No service-role, no direct DB — every mutation goes through the action layer.
// NO impersonation control (P5.8).
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  TICKET_STATUSES, TICKET_PRIORITIES, STATUS_LABEL, PRIORITY_LABEL,
  canTransition, requiresReason,
  type TicketStatus, type TicketPriority,
} from "@/lib/platform-admin/support/model";
import {
  supportChangeStatusAction, supportChangePriorityAction, supportAssignTicketAction, supportAddNoteAction,
} from "@/lib/platform-admin/server/support-actions";

function Err({ msg }: { msg: string | null }) { return msg ? <p className="text-danger mt-1 text-[11px] font-semibold">{msg}</p> : null; }

export function StatusControl({ ticketId, current }: { ticketId: string; current: TicketStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const targets = TICKET_STATUSES.filter((s) => canTransition(current, s));
  return (
    <div>
      <label className="text-muted mb-1 block text-[11px] font-bold">סטטוס</label>
      <select
        disabled={pending}
        value={current}
        onChange={(e) => {
          const to = e.target.value;
          setErr(null);
          start(async () => {
            const r = await supportChangeStatusAction(ticketId, to);
            if (!r.ok) setErr(r.error ?? "נכשל"); else router.refresh();
          });
        }}
        className="border-line bg-card text-ink w-full rounded-lg border px-3 py-2 text-[13px] font-semibold"
      >
        <option value={current}>{STATUS_LABEL[current]} (נוכחי)</option>
        {targets.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
      <Err msg={err} />
    </div>
  );
}

export function PriorityControl({ ticketId, current }: { ticketId: string; current: TicketPriority }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <label className="text-muted mb-1 block text-[11px] font-bold">עדיפות</label>
      <select
        disabled={pending}
        value={current}
        onChange={(e) => {
          const to = e.target.value as TicketPriority;
          if (to === current) return;
          setErr(null);
          let reason: string | undefined;
          if (requiresReason(current, to)) {
            const r = window.prompt("נדרש נימוק להסלמה לדחוף:");
            if (!r || !r.trim()) { setErr("נדרש נימוק"); return; }
            reason = r.trim();
          }
          start(async () => {
            const res = await supportChangePriorityAction(ticketId, to, reason);
            if (!res.ok) setErr(res.error ?? "נכשל"); else router.refresh();
          });
        }}
        className="border-line bg-card text-ink w-full rounded-lg border px-3 py-2 text-[13px] font-semibold"
      >
        {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
      </select>
      <Err msg={err} />
    </div>
  );
}

export function AssignControl({ ticketId, current, operators }: { ticketId: string; current: string | null; operators: { userId: string; name: string | null; role: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <label className="text-muted mb-1 block text-[11px] font-bold">אחראי</label>
      <select
        disabled={pending}
        value={current ?? ""}
        onChange={(e) => {
          const v = e.target.value || null;
          setErr(null);
          start(async () => {
            const r = await supportAssignTicketAction(ticketId, v);
            if (!r.ok) setErr(r.error ?? "נכשל"); else router.refresh();
          });
        }}
        className="border-line bg-card text-ink w-full rounded-lg border px-3 py-2 text-[13px] font-semibold"
      >
        <option value="">לא משויך</option>
        {operators.map((o) => <option key={o.userId} value={o.userId}>{o.name ?? o.userId.slice(0, 8)} · {o.role}</option>)}
      </select>
      <Err msg={err} />
    </div>
  );
}

export function NoteForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [val, setVal] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!val.trim()) return;
        setErr(null);
        start(async () => {
          const r = await supportAddNoteAction(ticketId, val);
          if (!r.ok) setErr(r.error ?? "נכשל"); else { setVal(""); router.refresh(); }
        });
      }}
    >
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        disabled={pending}
        rows={3}
        placeholder="הוסף הערה פנימית (גלויה למפעילי פלטפורמה בלבד)…"
        className="border-line bg-card text-ink w-full rounded-lg border px-3 py-2 text-[13px]"
      />
      <div className="mt-2 flex items-center justify-between">
        <Err msg={err} />
        <button type="submit" disabled={pending || !val.trim()} className="bg-brand rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "מוסיף…" : "הוסף הערה"}</button>
      </div>
    </form>
  );
}
