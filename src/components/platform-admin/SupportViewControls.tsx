"use client";
// ============================================================================
// ZONO — SUPPORT VIEW controls (P5.8, client). Start gate (mandatory reason) +
// exit button. These invoke the audited start/end actions (the ONLY P5.8
// mutations — they touch support_impersonation_log only, never customer data).
// No customer server actions, no customer mutations.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SUPPORT_VIEW_REASONS, REASON_LABEL } from "@/lib/platform-admin/impersonation/model";
import { supportViewStartAction, supportViewEndAction } from "@/lib/platform-admin/server/support-view-actions";

export function StartSupportViewGate({ orgId, userId, orgName, userName, ticketId }: { orgId: string; userId: string; orgName: string; userName: string; ticketId?: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("technical_issue");
  const [detail, setDetail] = useState("");

  return (
    <div className="mx-auto max-w-lg">
      <div className="border-line bg-card rounded-2xl border p-6">
        <h2 className="text-ink text-lg font-black">צפייה במערכת כמשתמש</h2>
        <p className="text-muted mt-1 text-[13px]">מצב תמיכה לקריאה בלבד — שחזור מאובטח של חשבון הלקוח בתוך גבולות הפלטפורמה. אין כניסה לחשבון הלקוח ואין שינוי נתונים.</p>
        <dl className="border-line mt-4 rounded-xl border p-3 text-[13px]">
          <div className="flex justify-between py-1"><dt className="text-muted">ארגון</dt><dd className="text-ink font-bold">{orgName}</dd></div>
          <div className="flex justify-between py-1"><dt className="text-muted">משתמש</dt><dd className="text-ink font-bold">{userName}</dd></div>
        </dl>
        <label className="text-muted mt-4 mb-1 block text-[12px] font-bold">סיבה (חובה)</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending} className="border-line bg-surface text-ink w-full rounded-lg border px-3 py-2 text-[13px]">
          {SUPPORT_VIEW_REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
        </select>
        {reason === "other" && (
          <textarea value={detail} onChange={(e) => setDetail(e.target.value)} disabled={pending} rows={2} placeholder="פרט/י את הסיבה" className="border-line bg-surface text-ink mt-2 w-full rounded-lg border px-3 py-2 text-[13px]" />
        )}
        {err ? <p className="text-danger mt-2 text-[12px] font-semibold">{err}</p> : null}
        <button
          disabled={pending}
          onClick={() => {
            setErr(null);
            start(async () => {
              const r = await supportViewStartAction({ orgId, targetUserId: userId, reason, reasonDetail: detail, ticketId: ticketId ?? null });
              if (!r.ok) setErr(r.error ?? "נכשל"); else router.refresh();
            });
          }}
          className="bg-brand mt-4 w-full rounded-lg px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
        >
          {pending ? "פותח…" : "כניסה לצפייה כמשתמש"}
        </button>
      </div>
    </div>
  );
}

export function ExitSupportViewButton({ orgId, userId, ticketId }: { orgId: string; userId: string; ticketId?: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => {
        await supportViewEndAction(orgId, userId);
        router.push(ticketId ? `/platform/support/${ticketId}` : `/platform/customers/${orgId}/users`);
      })}
      className="rounded-lg bg-white/20 px-4 py-1.5 text-[13px] font-bold text-white hover:bg-white/30 disabled:opacity-50"
    >
      {pending ? "יוצא…" : "יציאה ממצב תמיכה"}
    </button>
  );
}
