"use client";
// ZONO — Customer 360 Users administration (P5.3). Capability-gated (rendered
// only when the operator holds platform.users.manage). Contextual, confirmed
// actions only — no silent dropdown execution, no password ops, no delete. All
// writes go through audited platform server actions.
import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { StatusBadge, formatPlatformDate } from "./ui";
import type { OrgUserRow } from "@/lib/platform-admin/server/dal";
import type { OrgRoleOption, OrgInvitationRow } from "@/lib/platform-admin/server/user-admin";
import {
  platformInviteUserAction, platformResendInviteAction,
  platformSetUserStatusAction, platformSetUserRoleAction,
} from "@/lib/platform-admin/server/user-admin-actions";

type Pending =
  | { kind: "suspend" | "activate"; userId: string; name: string }
  | { kind: "role"; userId: string; name: string; roleKey: string; roleLabel: string };

export function OrgUserAdmin({ orgId, users, roles, invitations, canImpersonate = false }: { orgId: string; users: OrgUserRow[]; roles: OrgRoleOption[]; invitations: OrgInvitationRow[]; canImpersonate?: boolean }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [busy, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string; link?: string }>, okText: string) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) { setNotice({ tone: "ok", text: okText }); if (r.link) setInviteLink(r.link); }
      else setNotice({ tone: "err", text: r.error || "הפעולה נכשלה" });
      setPending(null); setReason("");
    });
  }

  function confirmPending() {
    if (!pending) return;
    if (pending.kind === "role") run(() => platformSetUserRoleAction(orgId, pending.userId, pending.roleKey, reason), "התפקיד עודכן");
    else run(() => platformSetUserStatusAction(orgId, pending.userId, pending.kind, reason), pending.kind === "suspend" ? "המשתמש הושעה" : "המשתמש הופעל");
  }

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-semibold", notice.tone === "ok" ? "border-success/30 bg-success-soft text-success" : "border-danger/30 bg-danger-soft text-danger")}>
          <Icon name={notice.tone === "ok" ? "CheckCircle" : "AlertTriangle"} size={15} />{notice.text}
          <button type="button" className="ms-auto" onClick={() => setNotice(null)}><Icon name="X" size={14} /></button>
        </div>
      ) : null}

      {/* Invite */}
      <div className="border-line bg-card rounded-2xl border">
        <button type="button" onClick={() => setInviteOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-start">
          <span className="text-brand"><Icon name="UserPlus" size={16} /></span>
          <span className="text-ink text-sm font-bold">הזמנת משתמש לארגון</span>
          <Icon name={inviteOpen ? "ChevronUp" : "ChevronDown"} size={16} className="text-muted ms-auto" />
        </button>
        {inviteOpen ? <InvitePanel orgId={orgId} roles={roles} busy={busy} onResult={(r) => { if (r.ok) { setNotice({ tone: "ok", text: "ההזמנה נוצרה — העתק את הקישור ושלח למשתמש" }); setInviteLink(r.link ?? null); } else setNotice({ tone: "err", text: r.error || "יצירת ההזמנה נכשלה" }); }} /> : null}
      </div>

      {inviteLink ? (
        <div className="border-line bg-surface flex items-center gap-2 rounded-xl border px-3 py-2">
          <span className="text-muted text-[12px] font-bold">קישור הצטרפות:</span>
          <code className="text-ink truncate text-[12px]" dir="ltr">{inviteLink}</code>
          <button type="button" className="text-brand-strong ms-auto shrink-0 text-[12px] font-bold" onClick={() => { navigator.clipboard?.writeText(inviteLink).catch(() => {}); }}>העתק</button>
        </div>
      ) : null}

      {/* Pending / recent invitations */}
      {invitations.length ? (
        <div className="border-line bg-card overflow-hidden rounded-2xl border">
          <p className="border-line text-ink border-b px-4 py-2.5 text-sm font-bold">הזמנות ({invitations.length})</p>
          <ul className="divide-line divide-y">
            {invitations.map((inv) => {
              const resendable = inv.status === "pending" || inv.status === "expired";
              return (
                <li key={inv.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="text-ink text-[13px] font-bold" dir="ltr">{inv.email}</span>
                  <span className="text-muted text-[12px]">{roles.find((r) => r.key === inv.roleKey)?.name ?? inv.roleKey}</span>
                  <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold", inv.status === "pending" ? "bg-warning-soft text-warning" : inv.status === "accepted" ? "bg-success-soft text-success" : "bg-surface text-muted")}>{inv.status}</span>
                  {resendable ? (
                    <button type="button" disabled={busy} onClick={() => run(() => platformResendInviteAction(orgId, inv.id), "ההזמנה נשלחה מחדש")} className="text-brand-strong ms-auto text-[12px] font-bold">שלח מחדש</button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* User table */}
      <div className="border-line bg-card overflow-hidden rounded-2xl border">
        <div className="border-line text-muted hidden grid-cols-[1.6fr_1.1fr_0.8fr_0.9fr_0.8fr] gap-3 border-b px-4 py-2.5 text-[11px] font-bold sm:grid">
          <span>שם</span><span>תפקיד</span><span>סטטוס</span><span>נראה</span><span>פעולה</span>
        </div>
        <ul className="divide-line divide-y">
          {users.map((u) => {
            const suspended = u.status === "suspended" || u.status === "disabled";
            return (
              <li key={u.id} className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1.6fr_1.1fr_0.8fr_0.9fr_0.8fr] sm:items-center sm:gap-3">
                <span className="text-ink inline-flex items-center gap-2 text-[13.5px] font-bold">
                  <span className="text-muted bg-surface grid h-7 w-7 shrink-0 place-items-center rounded-full"><Icon name="UserCircle" size={15} /></span>
                  {u.name || "—"}
                </span>
                <select
                  disabled={busy}
                  value={u.roleKey ?? ""}
                  onChange={(e) => {
                    const roleKey = e.target.value;
                    const label = roles.find((r) => r.key === roleKey)?.name ?? roleKey;
                    if (roleKey && roleKey !== u.roleKey) setPending({ kind: "role", userId: u.id, name: u.name || "—", roleKey, roleLabel: label });
                  }}
                  className="border-line text-ink h-8 rounded-lg border bg-surface px-2 text-[12.5px] font-semibold outline-none"
                >
                  {u.roleKey && !roles.some((r) => r.key === u.roleKey) ? <option value={u.roleKey}>{u.roleName || u.roleKey}</option> : null}
                  {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                </select>
                <span><StatusBadge status={u.status} /></span>
                <span className="text-muted text-[12px]">{u.lastSeenAt ? formatPlatformDate(u.lastSeenAt) : "—"}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPending({ kind: suspended ? "activate" : "suspend", userId: u.id, name: u.name || "—" })}
                    className={cn("inline-flex h-8 items-center justify-center gap-1 rounded-lg px-2.5 text-[12px] font-bold", suspended ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}
                  >
                    <Icon name={suspended ? "Check" : "Lock"} size={13} />{suspended ? "הפעלה" : "השעיה"}
                  </button>
                  {canImpersonate && !suspended ? (
                    <Link href={`/platform/support-view/${orgId}/${u.id}`} title="צפייה במערכת כמשתמש" className="border-line text-brand inline-flex h-8 items-center justify-center rounded-lg border px-2 text-[12px] font-bold"><Icon name="ShieldCheck" size={13} /></Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Confirm overlay */}
      {pending ? (
        <div dir="rtl" className="fixed inset-0 z-[120] grid place-items-center p-4">
          <button type="button" aria-label="ביטול" className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => { setPending(null); setReason(""); }} />
          <div className="border-line bg-card relative z-10 w-full max-w-sm rounded-2xl border p-5">
            <p className="text-ink text-base font-black">
              {pending.kind === "suspend" ? "השעיית משתמש" : pending.kind === "activate" ? "הפעלת משתמש" : "שינוי תפקיד"}
            </p>
            <p className="text-muted mt-1 text-[13px]">
              {pending.kind === "role"
                ? <>שינוי התפקיד של <b className="text-ink">{pending.name}</b> ל־<b className="text-ink">{pending.roleLabel}</b>.</>
                : <><b className="text-ink">{pending.name}</b> — {pending.kind === "suspend" ? "המשתמש לא יוכל לגשת למערכת." : "הגישה תוחזר."}</>}
            </p>
            {pending.kind !== "activate" ? (
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="סיבה (לא חובה)" className="border-line text-ink mt-3 h-9 w-full rounded-lg border bg-surface px-3 text-[13px] outline-none" />
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => { setPending(null); setReason(""); }} className="border-line text-muted h-9 rounded-lg border px-3 text-[13px] font-bold">ביטול</button>
              <button type="button" disabled={busy} onClick={confirmPending} className={cn("h-9 rounded-lg px-4 text-[13px] font-black text-white", pending.kind === "suspend" ? "bg-danger" : "bg-brand-strong")}>
                {busy ? "…" : "אישור"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InvitePanel({ orgId, roles, busy, onResult }: { orgId: string; roles: OrgRoleOption[]; busy: boolean; onResult: (r: { ok: boolean; error?: string; link?: string }) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleKey, setRoleKey] = useState(roles.find((r) => r.key === "agent")?.key ?? roles[roles.length - 1]?.key ?? "");
  const [submitting, startTransition] = useTransition();

  function submit() {
    startTransition(async () => { onResult(await platformInviteUserAction(orgId, email, name, roleKey)); setEmail(""); setName(""); });
  }
  return (
    <div className="border-line grid grid-cols-1 gap-2 border-t p-4 sm:grid-cols-[1.4fr_1fr_0.9fr_auto]">
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="אימייל" dir="ltr" className="border-line text-ink h-9 rounded-lg border bg-surface px-3 text-[13px] outline-none" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם (לא חובה)" className="border-line text-ink h-9 rounded-lg border bg-surface px-3 text-[13px] outline-none" />
      <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} className="border-line text-ink h-9 rounded-lg border bg-surface px-2 text-[13px] font-semibold outline-none">
        {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
      </select>
      <button type="button" disabled={busy || submitting || !email || !roleKey} onClick={submit} className="bg-brand-strong inline-flex h-9 items-center justify-center gap-1 rounded-lg px-4 text-[13px] font-black text-white disabled:opacity-50">
        <Icon name="Send" size={14} />{submitting ? "…" : "הזמן"}
      </button>
    </div>
  );
}
