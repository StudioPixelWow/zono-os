"use client";

import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { cn } from "@/lib/utils";
import {
  createInvitationAction, cancelInvitationAction, setUserStatusAction, setUserRoleAction,
} from "@/lib/team-admin/actions";
import type { TeamAdmin } from "@/lib/team-admin/service";

const field = "bg-surface border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none";
const lbl = "text-muted text-[11px] font-bold";

const STATUS_TONE: Record<string, string> = {
  active: "bg-success-soft text-success", invited: "bg-warning-soft text-warning",
  suspended: "bg-warning-soft text-warning", disabled: "bg-surface text-muted",
  pending: "bg-warning-soft text-warning", accepted: "bg-success-soft text-success",
  expired: "bg-surface text-muted", cancelled: "bg-surface text-muted",
};
const STATUS_LABEL: Record<string, string> = {
  active: "פעיל", invited: "הוזמן", suspended: "מושהה", disabled: "מושבת",
  pending: "ממתין", accepted: "הצטרף", expired: "פג תוקף", cancelled: "בוטל",
};

export function AgentsView({ data }: { data: TeamAdmin }) {
  const r = useActionRunner();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleKey, setRoleKey] = useState("agent");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const invite = () =>
    r.run(async () => {
      const res = await createInvitationAction({ email, fullName, roleKey });
      if (res.error) throw new Error(res.error);
      if (res.token) setInviteLink(`${origin}/join/${res.token}`);
      setEmail(""); setFullName("");
      return res;
    }, { id: "invite", pendingMessage: "יוצר הזמנה...", success: (x) => x.message ?? null });

  const copyLink = async (link: string) => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  };

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Users" size={18} /></span>
          <h1 className="text-ink text-2xl font-black">ניהול צוות וסוכנים</h1>
        </div>
        <p className="text-muted text-sm">הזמן סוכנים, נהל תפקידים והפעל/השבת גישה. ההזמנה נוצרת עם קישור להעתקה — שלח אותו לסוכן (גם ללא שירות אימייל מוגדר).</p>
      </header>

      <ActionFeedback runner={r} />

      {/* Invite form */}
      <section className="bg-card border-line flex flex-col gap-4 rounded-2xl border p-5 shadow-sm">
        <h2 className="text-ink text-base font-extrabold">הזמן סוכן חדש</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1"><span className={lbl}>אימייל *</span><input className={field} value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" /></label>
          <label className="flex flex-col gap-1"><span className={lbl}>שם מלא</span><input className={field} value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className={lbl}>תפקיד</span>
            <select className={field} value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
              {data.roles.map((ro) => <option key={ro.key} value={ro.key}>{ro.name}</option>)}
            </select>
          </label>
        </div>
        <Button className="w-fit" loading={r.busyId === "invite"} onClick={invite}><Icon name="UserPlus" size={15} />צור הזמנה</Button>
        {inviteLink && (
          <div className="bg-brand-soft flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5">
            <span className="text-brand-strong text-xs font-bold">קישור הזמנה:</span>
            <code className="text-ink min-w-0 flex-1 truncate text-[12px]" dir="ltr">{inviteLink}</code>
            <button type="button" onClick={() => copyLink(inviteLink)} className="text-brand-strong inline-flex items-center gap-1 text-[12px] font-bold">
              <Icon name={copied ? "Check" : "Copy"} size={13} />{copied ? "הועתק" : "העתק"}
            </button>
          </div>
        )}
      </section>

      {/* Invitations */}
      {data.invitations.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-ink text-base font-extrabold">הזמנות</h2>
          {data.invitations.map((inv) => (
            <div key={inv.id} className="bg-card border-line flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 shadow-sm">
              <div className="min-w-0">
                <p className="text-ink text-sm font-bold" dir="ltr">{inv.email}</p>
                <p className="text-muted text-[12px]">{inv.fullName ? `${inv.fullName} · ` : ""}{inv.roleKey}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", STATUS_TONE[inv.status] ?? "bg-surface text-muted")}>{STATUS_LABEL[inv.status] ?? inv.status}</span>
                {inv.status === "pending" && (
                  <>
                    <button type="button" onClick={() => copyLink(`${origin}/join/${inv.token}`)} className="text-brand-strong inline-flex items-center gap-1 text-[12px] font-bold"><Icon name="Copy" size={13} />קישור</button>
                    <button type="button" className="text-muted hover:text-danger text-[12px] font-bold"
                      onClick={() => r.run(async () => { const x = await cancelInvitationAction(inv.id); if (x.error) throw new Error(x.error); return x; }, { id: `cancel-${inv.id}`, success: (x) => x.message ?? null })}>בטל</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Agents */}
      <section className="flex flex-col gap-2">
        <h2 className="text-ink text-base font-extrabold">סוכני המשרד ({data.agents.length})</h2>
        {data.agents.map((a) => {
          const active = a.status === "active";
          return (
            <div key={a.id} className="bg-card border-line flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 shadow-sm">
              <div className="min-w-0">
                <p className="text-ink text-sm font-bold">{a.fullName}</p>
                <p className="text-muted text-[12px]" dir="ltr">{a.email}{a.phone ? ` · ${a.phone}` : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", STATUS_TONE[a.status] ?? "bg-surface text-muted")}>{STATUS_LABEL[a.status] ?? a.status}</span>
                <select className="bg-surface border-line text-ink h-8 rounded-lg border px-2 text-[12px]" value={a.roleKey ?? ""}
                  onChange={(e) => r.run(async () => { const x = await setUserRoleAction(a.id, e.target.value); if (x.error) throw new Error(x.error); return x; }, { id: `role-${a.id}`, success: (x) => x.message ?? null })}>
                  {!a.roleKey && <option value="">—</option>}
                  {data.roles.map((ro) => <option key={ro.key} value={ro.key}>{ro.name}</option>)}
                </select>
                <Button size="sm" variant={active ? "ghost" : "secondary"}
                  loading={r.busyId === `status-${a.id}`}
                  onClick={() => r.run(async () => { const x = await setUserStatusAction(a.id, !active); if (x.error) throw new Error(x.error); return x; }, { id: `status-${a.id}`, success: (x) => x.message ?? null })}>
                  {active ? "השבת" : "הפעל"}
                </Button>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
