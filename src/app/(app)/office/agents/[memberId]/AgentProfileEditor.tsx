"use client";
// ZONO — Compact roster-profile editor (manager). Edits basic office_members
// identity (name / specialty / phone / email / status) via the manager-gated
// action. No Auth user is created or required. Photo is managed via avatar_url
// (seed/storage) — not uploaded here.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { updateOfficeMemberAction } from "@/lib/office/roster-actions";

type Member = { id: string; name: string; specialty: string | null; phone: string | null; email: string | null; status: string };
const STATUS: { v: string; label: string }[] = [{ v: "active", label: "פעיל" }, { v: "invited", label: "ממתין" }, { v: "inactive", label: "לא פעיל" }];

export function AgentProfileEditor({ member }: { member: Member }) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: member.name, specialty: member.specialty ?? "", phone: member.phone ?? "", email: member.email ?? "", status: member.status });
  const router = useRouter();

  const save = () => start(async () => {
    setError(null);
    const r = await updateOfficeMemberAction(member.id, form);
    if (r.ok) { setOpen(false); router.refresh(); }
    else setError(r.error ?? "העדכון נכשל.");
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="border-line hover:bg-surface text-ink inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-bold transition">
        <Icon name="Pencil" size={13} className="text-brand-strong" />ערוך פרופיל
      </button>
    );
  }

  const field = (key: keyof typeof form, label: string, type = "text") => (
    <label className="flex flex-col gap-1">
      <span className="text-muted text-[11px] font-bold">{label}</span>
      <input type={type} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="border-line bg-surface text-ink rounded-lg border px-2.5 py-1.5 text-[13px]" dir={key === "phone" || key === "email" ? "ltr" : "rtl"} />
    </label>
  );

  return (
    <div dir="rtl" className="border-line bg-surface/50 flex w-full flex-col gap-3 rounded-2xl border p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field("full_name", "שם")}
        {field("specialty", "התמחות")}
        {field("phone", "טלפון", "tel")}
        {field("email", "אימייל", "email")}
        <label className="flex flex-col gap-1">
          <span className="text-muted text-[11px] font-bold">סטטוס</span>
          <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="border-line bg-surface text-ink rounded-lg border px-2.5 py-1.5 text-[13px]">
            {STATUS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="text-danger text-[12px]">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy} onClick={save} className="bg-brand inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-[13px] font-bold text-white transition hover:brightness-95 disabled:opacity-60">
          <Icon name="Check" size={14} />{busy ? "שומר…" : "שמור"}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="text-muted hover:text-ink px-3 py-1.5 text-[13px] font-bold">ביטול</button>
      </div>
    </div>
  );
}
