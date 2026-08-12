"use client";
// ============================================================================
// ZONO — PLATFORM SUPPORT create-ticket form (P5.7, client). Opens a new ticket
// bound to a specific org via the audited create action. NO CRM mutation, NO
// service-role. Manual platform source only.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, CATEGORY_LABEL, TICKET_PRIORITIES, PRIORITY_LABEL } from "@/lib/platform-admin/support/model";
import { supportCreateTicketAction } from "@/lib/platform-admin/server/support-actions";

export function CreateTicketForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [category, setCategory] = useState("general");

  if (!open) {
    return <button onClick={() => setOpen(true)} className="bg-brand rounded-lg px-4 py-2 text-[13px] font-bold text-white">פנייה חדשה +</button>;
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        start(async () => {
          const r = await supportCreateTicketAction({ orgId, subject, description, priority, category, source: "manual_platform" });
          if (!r.ok) setErr(r.error ?? "נכשל");
          else { setSubject(""); setDescription(""); setOpen(false); if (r.id) router.push(`/platform/support/${r.id}`); else router.refresh(); }
        });
      }}
      className="border-line bg-card space-y-3 rounded-2xl border p-4"
    >
      <div className="text-ink text-[13px] font-black">פנייה חדשה</div>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="נושא" disabled={pending} className="border-line bg-surface text-ink w-full rounded-lg border px-3 py-2 text-[13px]" />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="תיאור" rows={3} disabled={pending} className="border-line bg-surface text-ink w-full rounded-lg border px-3 py-2 text-[13px]" />
      <div className="grid grid-cols-2 gap-3">
        <select value={priority} onChange={(e) => setPriority(e.target.value)} disabled={pending} className="border-line bg-surface text-ink rounded-lg border px-3 py-2 text-[13px]">
          {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={pending} className="border-line bg-surface text-ink rounded-lg border px-3 py-2 text-[13px]">
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
      </div>
      {err ? <p className="text-danger text-[12px] font-semibold">{err}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending || subject.trim().length < 3} className="bg-brand rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "יוצר…" : "צור פנייה"}</button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className="border-line text-muted rounded-lg border px-4 py-2 text-[13px] font-bold">ביטול</button>
      </div>
    </form>
  );
}
