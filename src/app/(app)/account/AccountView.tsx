"use client";
// ============================================================================
// 💳 Account & billing view (client). Subscription + license + payment history +
// self-service (change plan / cancel renewal / reactivate) + first-login
// checklist with progress. Actions re-check owner role server-side.
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import { changePlanAction, cancelRenewalAction, reactivateAction } from "@/lib/commercial/self-service";
import { planCards } from "@/lib/commercial/plans";
import type { AccountOverview } from "@/lib/commercial/account";
import type { PlanTier } from "@/lib/commercial/types";

const STATUS_HE: Record<string, string> = {
  trial: "תקופת ניסיון", pending_payment: "ממתין לתשלום", active: "פעיל", suspended: "מושהה",
  cancelled: "מבוטל", expired: "פג תוקף", grace_period: "תקופת חסד", trialing: "ניסיון", past_due: "בפיגור", canceled: "מבוטל",
};
const CARDS = planCards();

export function AccountView({ overview }: { overview: AccountOverview }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => { const r = await fn(); setMsg(r.ok ? ok : (r.error ?? "שגיאה")); });

  const { subscription, license, planTier, subscriptionStatus, payments, checklist } = overview;

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-ink text-xl font-black">החשבון והחיוב</h1>
        <p className="text-muted text-[12px]">ניהול המנוי, הרישיון והתשלומים — וצ׳קליסט ההקמה.</p>
      </header>
      {msg ? <p className="text-brand text-[12px] font-bold">{msg}</p> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Subscription */}
        <section className="bg-card border-line flex flex-col gap-3 rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
          <h3 className="text-ink text-sm font-black">המנוי</h3>
          <div className="flex items-center justify-between rounded-[12px] border border-[var(--line)] p-3">
            <span className="text-ink text-[13px] font-bold">{CARDS.find((c) => c.tier === planTier)?.label ?? planTier}</span>
            <span className="text-brand text-[12px] font-black">{STATUS_HE[subscriptionStatus] ?? subscriptionStatus}</span>
          </div>
          {subscription?.cancelAtPeriodEnd ? <p className="text-warning text-[11px]">החידוש בוטל — הגישה תישאר עד סוף התקופה.</p> : null}
          <div className="flex flex-wrap gap-2">
            <select disabled={pending} defaultValue={planTier} onChange={(e) => run(() => changePlanAction(e.target.value as PlanTier), "התוכנית עודכנה.")} className="border-line rounded-full border px-3 py-1.5 text-[12px] font-bold">
              {CARDS.map((c) => <option key={c.tier} value={c.tier}>{c.label}</option>)}
            </select>
            {subscription && !subscription.cancelAtPeriodEnd ? <button type="button" disabled={pending} onClick={() => run(cancelRenewalAction, "החידוש בוטל.")} className="text-muted rounded-full border border-[var(--line)] px-3 py-1.5 text-[12px] font-bold">בטל חידוש</button> : null}
            {subscription && ["cancelled", "expired", "suspended"].includes(subscription.status) ? <button type="button" disabled={pending} onClick={() => run(reactivateAction, "המנוי הופעל מחדש.")} className="bg-brand rounded-full px-3 py-1.5 text-[12px] font-black text-white">הפעל מחדש</button> : null}
          </div>
        </section>

        {/* License */}
        <section className="bg-card border-line flex flex-col gap-3 rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
          <h3 className="text-ink text-sm font-black">הרישיון</h3>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <Stat label="משתמשים" value={license.maxUsers < 0 ? "ללא הגבלה" : String(license.maxUsers)} />
            <Stat label="קרדיטים AI / חודש" value={license.aiCredits < 0 ? "ללא הגבלה" : String(license.aiCredits)} />
            <Stat label="אחסון" value={license.storageMb < 0 ? "ללא הגבלה" : `${Math.round(license.storageMb / 1024)}GB`} />
            <Stat label="מודולים" value={String(license.enabledModules.length)} />
          </div>
        </section>
      </div>

      {/* Payment history */}
      <section className="bg-card border-line flex flex-col gap-3 rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
        <h3 className="text-ink text-sm font-black">היסטוריית תשלומים וחשבוניות</h3>
        {payments.length === 0 ? <p className="text-muted text-[12px]">אין תשלומים עדיין.</p> : (
          <ul className="flex flex-col gap-1.5">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-[10px] border border-[var(--line)] px-3 py-2 text-[12px]">
                <span className="text-ink font-bold">₪{p.amountIls} · {p.planTier}</span>
                <span className="text-muted">{STATUS_HE[p.status] ?? p.status}{p.verified ? " ✓" : ""} · {new Date(p.createdAt).toLocaleDateString("he-IL")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* First-login checklist */}
      <section className="bg-card border-line flex flex-col gap-3 rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <h3 className="text-ink text-sm font-black">צ׳קליסט ההקמה</h3>
          <span className="text-brand text-[12px] font-black">{checklist.percentage}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2,#eee)]"><div className="bg-brand h-full" style={{ width: `${checklist.percentage}%` }} /></div>
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {checklist.steps.map((s) => (
            <li key={s.key}>
              <Link href={s.href} className="flex items-center justify-between rounded-[10px] border border-[var(--line)] px-3 py-2 text-[12px] hover:bg-[var(--surface-2,#f7f7fa)]">
                <span className={s.done ? "text-muted line-through" : "text-ink font-bold"}>{s.label}</span>
                <span>{s.done ? "✓" : "→"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-[10px] border border-[var(--line)] px-3 py-2">
      <span className="text-ink text-[13px] font-black">{value}</span>
      <span className="text-muted text-[10px] font-bold">{label}</span>
    </div>
  );
}
