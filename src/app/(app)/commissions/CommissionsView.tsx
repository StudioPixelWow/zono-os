"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import {
  createCommissionAction, submitCommissionAction, approveCommissionAction, cancelCommissionAction,
  createCollectionAction, recordCollectionAction, reverseCollectionAction, markCollectionPaidAction,
  markCollectionOverdueAction, getCollectionEventsAction,
} from "@/lib/commissions/actions";
import type { CommissionsCommandCenter, CommissionSummary, CollectionSummary, CommissionStatus, PaymentStatus } from "@/lib/commissions/service";

const ils = (n: number | null | undefined) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const field = "bg-surface border-line text-ink focus:border-brand-light h-9 w-full rounded-xl border px-3 text-sm outline-none";
const lbl = "text-muted text-[11px] font-bold";
const C_STATUS: Record<CommissionStatus, [string, string]> = {
  draft: ["טיוטה", "bg-surface text-muted"], pending_approval: ["ממתין לאישור", "bg-warning-soft text-warning"],
  approved: ["מאושר", "bg-success-soft text-success"], cancelled: ["בוטל", "bg-danger-soft text-danger"],
};
const P_STATUS: Record<PaymentStatus, [string, string]> = {
  pending: ["ממתין", "bg-surface text-muted"], partial: ["חלקי", "bg-warning-soft text-warning"],
  paid: ["שולם", "bg-success-soft text-success"], overdue: ["פיגור", "bg-danger-soft text-danger"],
};

export function CommissionsView({ cc }: { cc: CommissionsCommandCenter }) {
  const r = useActionRunner();
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const refresh = () => router.refresh();

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="TrendingDown" size={18} /></span>
          <div>
            <h1 className="text-ink text-2xl font-black">עמלות וגבייה</h1>
            <p className="text-muted text-sm">חישוב עמלה, חלוקה בין הצדדים, אישור מנהל, וגבייה מלאה/חלקית — כולל היפוך לא-הרסני.</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowNew((s) => !s)}><Icon name="Plus" size={14} />עמלה חדשה</Button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="ממתין לאישור" value={cc.pendingApproval} tone="text-warning" />
        <Stat label="מאושרות" value={cc.approved} tone="text-success" />
        <Stat label="סה״כ לגבייה" money={cc.totalDue} tone="text-ink" />
        <Stat label="סה״כ נגבה" money={cc.totalCollected} tone="text-success" />
      </div>

      <ActionFeedback runner={r} />
      {showNew && <NewCommissionForm cc={cc} r={r} onDone={() => { setShowNew(false); refresh(); }} />}

      {cc.commissions.length === 0 ? (
        <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">אין עמלות עדיין — צור עמלה מעסקה</div>
      ) : (
        <div className="flex flex-col gap-2">{cc.commissions.map((c) => <CommissionCard key={c.id} c={c} isManager={cc.isManager} r={r} onChanged={refresh} />)}</div>
      )}
    </main>
  );
}

function Stat({ label, value, money, tone }: { label: string; value?: number; money?: number; tone: string }) {
  return (
    <div className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-4 shadow-sm">
      <span className={`text-[12px] font-bold ${tone}`}>{label}</span>
      <span className="text-ink text-xl font-black">{money != null ? ils(money) : value}</span>
    </div>
  );
}

type Runner = ReturnType<typeof useActionRunner>;

function NewCommissionForm({ cc, r, onDone }: { cc: CommissionsCommandCenter; r: Runner; onDone: () => void }) {
  const [dealId, setDealId] = useState(cc.deals[0]?.id ?? "");
  const [side, setSide] = useState<"buy" | "sell" | "both">("sell");
  const [gross, setGross] = useState("");
  const [vat, setVat] = useState("18");
  const [office, setOffice] = useState("");
  const [agent, setAgent] = useState("");
  const [manager, setManager] = useState("");
  const [broker, setBroker] = useState("");
  const [referral, setReferral] = useState("");
  const n = (s: string) => (s ? Number(s) : 0);

  const submit = () =>
    r.run(async () => {
      if (!dealId) throw new Error("יש לבחור עסקה");
      const res = await createCommissionAction({
        dealId, side, grossAmount: n(gross), vatPct: n(vat),
        officeShare: n(office), agentShare: n(agent), managerShare: n(manager), cooperatingBrokerShare: n(broker), referralShare: n(referral),
      });
      if (res.error) throw new Error(res.error);
      onDone();
      return res;
    }, { id: "comm-new", pendingMessage: "מחשב...", success: () => "העמלה נשמרה ✓" });

  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
      <h2 className="text-ink text-base font-extrabold">עמלה חדשה</h2>
      {cc.deals.length === 0 ? (
        <p className="text-warning text-sm">אין עסקאות פתוחות. צור עסקה תחילה (או מהצעה מאושרת).</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1"><span className={lbl}>עסקה</span>
              <select className={field} value={dealId} onChange={(e) => setDealId(e.target.value)}>
                {cc.deals.map((d) => <option key={d.id} value={d.id}>{d.title}{d.value ? ` · ${ils(d.value)}` : ""}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className={lbl}>צד</span>
              <select className={field} value={side} onChange={(e) => setSide(e.target.value as "buy" | "sell" | "both")}>
                <option value="sell">מכירה</option><option value="buy">קנייה</option><option value="both">שני הצדדים</option>
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className={lbl}>עמלה ברוטו (₪)</span><input className={field} inputMode="numeric" value={gross} onChange={(e) => setGross(e.target.value.replace(/[^\d]/g, ""))} placeholder="50000" /></label>
            <label className="flex flex-col gap-1"><span className={lbl}>מע״מ %</span><input className={field} inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value.replace(/[^\d.]/g, ""))} /></label>
          </div>
          <p className={lbl}>חלוקה (₪)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[["משרד", office, setOffice], ["סוכן", agent, setAgent], ["מנהל", manager, setManager], ["שת״פ", broker, setBroker], ["הפניה", referral, setReferral]].map(([label, val, set]) => (
              <label key={label as string} className="flex flex-col gap-1"><span className={lbl}>{label as string}</span>
                <input className={field} inputMode="numeric" value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value.replace(/[^\d]/g, ""))} /></label>
            ))}
          </div>
          <Button className="w-fit" loading={r.busyId === "comm-new"} onClick={submit}><Icon name="Plus" size={14} />חשב ושמור</Button>
        </>
      )}
    </div>
  );
}

function CommissionCard({ c, isManager, r, onChanged }: { c: CommissionSummary; isManager: boolean; r: Runner; onChanged: () => void }) {
  const [showCol, setShowCol] = useState(false);
  const wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) =>
    r.run(async () => { const res = await fn(); if (res.error) throw new Error(res.error); onChanged(); return res; }, { id, pendingMessage: pending, success: (x) => x.message ?? null });
  const [status, tone] = C_STATUS[c.status];

  return (
    <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-ink font-black">{c.deal_title ?? "עסקה"}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{status}</span>
            <span className="text-muted text-[11px]">{c.side === "buy" ? "קנייה" : c.side === "both" ? "שני צדדים" : "מכירה"}</span>
          </div>
          <p className="text-ink mt-1 text-[13px] font-bold">ברוטו {ils(c.gross_amount)} · מע״מ {ils(c.vat_amount)} · נטו {ils(c.net_amount)}</p>
          <p className="text-muted mt-0.5 text-[12px]">משרד {ils(c.office_share)} · סוכן {ils(c.agent_share)} · מנהל {ils(c.manager_share)} · שת״פ {ils(c.cooperating_broker_share)} · הפניה {ils(c.referral_share)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {c.status === "draft" && <Button size="sm" loading={r.busyId === `sub-${c.id}`} onClick={() => wrap(() => submitCommissionAction(c.id), `sub-${c.id}`, "שולח...")}>שלח לאישור</Button>}
        {(c.status === "draft" || c.status === "pending_approval") && isManager && <Button size="sm" loading={r.busyId === `app-${c.id}`} onClick={() => wrap(() => approveCommissionAction(c.id), `app-${c.id}`, "מאשר...")}><Icon name="Check" size={14} />אשר</Button>}
        {c.status !== "cancelled" && c.status !== "approved" && isManager && <Button size="sm" variant="ghost" loading={r.busyId === `can-${c.id}`} onClick={() => wrap(() => cancelCommissionAction(c.id), `can-${c.id}`)}>בטל</Button>}
        {c.status === "approved" && (
          <button onClick={() => setShowCol((s) => !s)} className="text-brand-strong text-[12px] font-bold">
            גבייה ({c.collections.length}) · נגבה {ils(c.totalCollected)}/{ils(c.totalDue)}
          </button>
        )}
      </div>

      {c.status === "approved" && showCol && (
        <div className="border-line mt-3 flex flex-col gap-3 border-t pt-3">
          <NewCollectionForm commissionId={c.id} r={r} onChanged={onChanged} />
          {c.collections.length === 0 ? <p className="text-muted text-[12px]">אין גבייה עדיין</p>
            : c.collections.map((col) => <CollectionRow key={col.id} col={col} r={r} onChanged={onChanged} />)}
        </div>
      )}
    </div>
  );
}

function NewCollectionForm({ commissionId, r, onChanged }: { commissionId: string; r: Runner; onChanged: () => void }) {
  const [due, setDue] = useState("");
  const [date, setDate] = useState("");
  const [invoice, setInvoice] = useState("");
  const submit = () =>
    r.run(async () => {
      const res = await createCollectionAction(commissionId, due ? Number(due) : 0, date || null, invoice || null);
      if (res.error) throw new Error(res.error);
      setDue(""); setDate(""); setInvoice(""); onChanged();
      return res;
    }, { id: `newcol-${commissionId}`, pendingMessage: "יוצר גבייה...", success: () => "גבייה נוצרה ✓" });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1"><span className={lbl}>סכום לגבייה</span><input className={`${field} max-w-[130px]`} inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value.replace(/[^\d]/g, ""))} placeholder="₪" /></label>
      <label className="flex flex-col gap-1"><span className={lbl}>תאריך יעד</span><input type="date" className={`${field} max-w-[150px]`} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="flex flex-col gap-1"><span className={lbl}>חשבונית</span><input className={`${field} max-w-[120px]`} value={invoice} onChange={(e) => setInvoice(e.target.value)} /></label>
      <Button size="sm" loading={r.busyId === `newcol-${commissionId}`} onClick={submit}><Icon name="Plus" size={14} />צור גבייה</Button>
    </div>
  );
}

function CollectionRow({ col, r, onChanged }: { col: CollectionSummary; r: Runner; onChanged: () => void }) {
  const [amount, setAmount] = useState("");
  const [events, setEvents] = useState<{ event_type: string; amount: number; note: string | null; created_at: string }[] | null>(null);
  const wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) =>
    r.run(async () => { const res = await fn(); if (res.error) throw new Error(res.error); setAmount(""); onChanged(); return res; }, { id, pendingMessage: pending, success: (x) => x.message ?? null });
  const [pl, pt] = P_STATUS[col.payment_status];
  const amt = () => (amount ? Number(amount) : 0);

  return (
    <div className="bg-surface rounded-xl p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink text-[13px] font-bold">{ils(col.amount_collected)} / {ils(col.amount_due)}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pt}`}>{pl}</span>
        {col.due_date && <span className="text-muted text-[11px]">יעד {new Date(col.due_date).toLocaleDateString("he-IL")}</span>}
        {col.invoice_ref && <span className="text-muted text-[11px]">חשבונית {col.invoice_ref}</span>}
        <button onClick={async () => setEvents(await getCollectionEventsAction(col.id))} className="text-brand-strong text-[11px] font-bold">היסטוריה</button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input className={`${field} max-w-[120px]`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} placeholder="סכום" />
        <Button size="sm" variant="secondary" loading={r.busyId === `rec-${col.id}`} onClick={() => wrap(() => recordCollectionAction(col.id, amt()), `rec-${col.id}`, "רושם...")}>רשום תקבול</Button>
        <Button size="sm" variant="ghost" loading={r.busyId === `rev-${col.id}`} onClick={() => wrap(() => reverseCollectionAction(col.id, amt()), `rev-${col.id}`, "מהפך...")}>היפוך</Button>
        {col.payment_status !== "paid" && <Button size="sm" variant="ghost" loading={r.busyId === `paid-${col.id}`} onClick={() => wrap(() => markCollectionPaidAction(col.id), `paid-${col.id}`)}>סמן שולם</Button>}
        {col.payment_status !== "overdue" && col.payment_status !== "paid" && <Button size="sm" variant="ghost" loading={r.busyId === `od-${col.id}`} onClick={() => wrap(() => markCollectionOverdueAction(col.id), `od-${col.id}`)}>פיגור</Button>}
      </div>
      {events && (
        <ol className="mt-2 flex flex-col gap-0.5">
          {events.length === 0 ? <li className="text-muted text-[11px]">אין תנועות</li>
            : events.map((e, i) => <li key={i} className="text-muted text-[11px]">• {new Date(e.created_at).toLocaleString("he-IL")} — {colEventLabel(e.event_type)} {e.amount ? ils(e.amount) : ""}{e.note ? ` · ${e.note}` : ""}</li>)}
        </ol>
      )}
    </div>
  );
}

function colEventLabel(t: string): string {
  return ({ created: "נוצרה", recorded: "תקבול", partial: "תקבול חלקי", reversed: "היפוך", marked_paid: "סומן שולם", marked_overdue: "פיגור" } as Record<string, string>)[t] ?? t;
}
