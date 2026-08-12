"use client";
// ============================================================================
// ZONO — PLATFORM operator management (P5.9, client). Role change / suspend /
// reactivate / create — each requires a reason and an explicit confirmation,
// and invokes the audited server actions. Manages ONLY platform operators
// (ZONO staff) — never an organization role. super_admin only (server-enforced).
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { PLATFORM_ROLES } from "@/lib/platform-admin/capabilities";
import { ROLE_LABEL } from "@/lib/platform-admin/security/model";
import { operatorCreateAction, operatorRoleChangeAction, operatorStatusAction } from "@/lib/platform-admin/server/admin-users-actions";
import { formatPlatformDate } from "@/components/platform-admin/ui";

interface Op { userId: string; name: string | null; role: string; status: string; createdByName: string | null; createdAt: string; lastAction: string | null; lastActionAt: string | null }
type Pending = { kind: "role"; userId: string; name: string; role: string } | { kind: "suspend" | "activate"; userId: string; name: string } | null;

export function OperatorAdmin({ operators }: { operators: Op[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
    start(async () => {
      const r = await fn();
      if (r.ok) { setNotice({ tone: "ok", text: okText }); setPending(null); setReason(""); router.refresh(); }
      else setNotice({ tone: "err", text: r.error || "הפעולה נכשלה" });
    });
  };

  return (
    <div className="space-y-4">
      {notice ? <div className={"rounded-xl border px-4 py-2.5 text-[12px] font-semibold " + (notice.tone === "ok" ? "border-line bg-success-soft text-success" : "border-line bg-danger-soft text-danger")}>{notice.text}</div> : null}

      <div className="flex items-center justify-between">
        <span className="text-muted text-[12px] font-semibold">ניהול מפעילי פלטפורמה (super_admin בלבד) — נפרד לחלוטין מתפקידי הארגון</span>
        <button onClick={() => setCreateOpen((v) => !v)} className="bg-brand rounded-lg px-4 py-2 text-[13px] font-bold text-white">מפעיל חדש +</button>
      </div>

      {createOpen ? <CreateOperator busy={busy} onDone={(r) => { if (r.ok) { setNotice({ tone: "ok", text: "המפעיל נוצר" }); setCreateOpen(false); router.refresh(); } else setNotice({ tone: "err", text: r.error || "יצירה נכשלה" }); }} /> : null}

      <div className="border-line overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-line bg-surface border-b text-[12px]">
              {["מפעיל", "תפקיד", "סטטוס", "נוצר ע״י", "פעולה אחרונה", "פעולות"].map((h) => <th key={h} className="text-muted px-3 py-2.5 text-start font-bold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {operators.map((o) => {
              const suspended = o.status === "suspended";
              return (
                <tr key={o.userId} className="border-line border-b last:border-0">
                  <td className="text-ink px-3 py-2.5 font-semibold">{o.name ?? o.userId.slice(0, 8)}</td>
                  <td className="px-3 py-2.5">
                    <select disabled={busy} value={o.role} onChange={(e) => { const role = e.target.value; if (role !== o.role) setPending({ kind: "role", userId: o.userId, name: o.name || "—", role }); }} className="border-line bg-card text-ink rounded-lg border px-2 py-1 text-[12px] font-semibold">
                      {PLATFORM_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5"><span className={"rounded-md px-2 py-0.5 text-[11px] font-bold " + (suspended ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>{suspended ? "מושעה" : "פעיל"}</span></td>
                  <td className="text-muted px-3 py-2.5 text-[12px]">{o.createdByName ?? "—"}</td>
                  <td className="text-muted px-3 py-2.5 text-[12px]">{o.lastAction ? `${o.lastAction}${o.lastActionAt ? ` · ${formatPlatformDate(o.lastActionAt)}` : ""}` : "—"}</td>
                  <td className="px-3 py-2.5">
                    <button disabled={busy} onClick={() => setPending({ kind: suspended ? "activate" : "suspend", userId: o.userId, name: o.name || "—" })} className={"inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold " + (suspended ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
                      <Icon name={suspended ? "Check" : "Lock"} size={13} />{suspended ? "הפעלה" : "השעיה"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Confirm overlay (reason required) */}
      {pending ? (
        <div dir="rtl" className="fixed inset-0 z-[120] grid place-items-center bg-black/40 p-4">
          <div className="border-line bg-card w-full max-w-md rounded-2xl border p-5">
            <h3 className="text-ink text-[15px] font-black">
              {pending.kind === "role" ? `שינוי תפקיד — ${pending.name}` : pending.kind === "suspend" ? `השעיית מפעיל — ${pending.name}` : `הפעלת מפעיל — ${pending.name}`}
            </h3>
            <p className="text-muted mt-1 text-[12px]">פעולה זו על מפעיל פלטפורמה מתועדת ביומן הביקורת. נדרש נימוק.</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="נימוק (חובה)" className="border-line bg-surface text-ink mt-3 w-full rounded-lg border px-3 py-2 text-[13px]" />
            <div className="mt-3 flex justify-end gap-2">
              <button disabled={busy} onClick={() => { setPending(null); setReason(""); }} className="border-line text-muted rounded-lg border px-4 py-2 text-[13px] font-bold">ביטול</button>
              <button
                disabled={busy || reason.trim().length < 3}
                onClick={() => {
                  if (pending.kind === "role") run(() => operatorRoleChangeAction(pending.userId, pending.role, reason), "התפקיד עודכן");
                  else run(() => operatorStatusAction(pending.userId, pending.kind, reason), pending.kind === "suspend" ? "המפעיל הושעה" : "המפעיל הופעל");
                }}
                className="bg-brand rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              >{busy ? "מבצע…" : "אישור"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CreateOperator({ busy, onDone }: { busy: boolean; onDone: (r: { ok: boolean; error?: string }) => void }) {
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("support");
  const [reason, setReason] = useState("");
  return (
    <div className="border-line bg-card space-y-3 rounded-2xl border p-4">
      <div className="text-ink text-[13px] font-black">מפעיל פלטפורמה חדש</div>
      <p className="text-muted text-[11px]">משתמש היעד חייב להתקיים כבר במערכת. אין יצירת סיסמה ואין קידום אוטומטי של בעלי ארגון.</p>
      <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="מזהה משתמש (user id)" disabled={busy || pending} className="border-line bg-surface text-ink w-full rounded-lg border px-3 py-2 text-[13px] font-mono" dir="ltr" />
      <div className="grid grid-cols-2 gap-3">
        <select value={role} onChange={(e) => setRole(e.target.value)} disabled={busy || pending} className="border-line bg-surface text-ink rounded-lg border px-3 py-2 text-[13px]">
          {PLATFORM_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="נימוק (חובה)" disabled={busy || pending} className="border-line bg-surface text-ink rounded-lg border px-3 py-2 text-[13px]" />
      </div>
      <button disabled={busy || pending || userId.trim().length < 10 || reason.trim().length < 3} onClick={() => start(async () => onDone(await operatorCreateAction(userId.trim(), role, reason)))} className="bg-brand rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "יוצר…" : "צור מפעיל"}</button>
    </div>
  );
}
