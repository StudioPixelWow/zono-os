"use client";
// ============================================================================
// 💳 Account & billing view (client). Subscription + license + payment history +
// self-service (change plan / cancel renewal / reactivate) + first-login
// checklist with progress. Actions re-check owner role server-side.
// ============================================================================
import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { cancelRenewalAction, reactivateAction } from "@/lib/commercial/self-service";
import type { AccountOverview } from "@/lib/commercial/account";


export function AccountView({ overview, billing }: { overview: AccountOverview; billing?: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => { const r = await fn(); setMsg(r.ok ? ok : (r.error ?? "שגיאה")); });
  // Reactivate: undo a pending cancellation, OR redirect to a fresh GROW checkout
  // when the subscription was genuinely cancelled (a cancelled direct debit cannot
  // be un-cancelled). Activation still happens only via the verified webhook.
  const reactivate = () =>
    start(async () => {
      const r = await reactivateAction();
      if (r.url) { window.location.href = r.url; return; }
      setMsg(r.ok ? "המנוי הופעל מחדש." : (r.error ?? "שגיאה"));
    });

  const { subscription, checklist } = overview;

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-ink text-xl font-black">החשבון והחיוב</h1>
        <p className="text-muted text-[12px]">ניהול המנוי, הרישיון והתשלומים — וצ׳קליסט ההקמה.</p>
      </header>
      {msg ? <p className="text-brand text-[12px] font-bold">{msg}</p> : null}

      {billing}
      {subscription && !subscription.cancelAtPeriodEnd && ["active", "trialing", "trial"].includes(subscription.status) ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending} onClick={() => run(cancelRenewalAction, "החידוש בוטל.")} className="text-muted rounded-full border border-[var(--line)] px-3 py-1.5 text-[12px] font-bold">בטל חידוש</button>
        </div>
      ) : null}
      {subscription?.cancelAtPeriodEnd || (subscription && ["cancelled", "canceled", "expired", "suspended"].includes(subscription.status)) ? (
        <div className="flex flex-wrap items-center gap-2">
          {subscription?.cancelAtPeriodEnd ? <p className="text-warning text-[11px]">החידוש בוטל — הגישה תישאר עד סוף התקופה.</p> : null}
          <button type="button" disabled={pending} onClick={reactivate} className="bg-brand rounded-full px-3 py-1.5 text-[12px] font-black text-white">הפעלת מנוי מחדש</button>
        </div>
      ) : null}

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
