"use client";
// ============================================================================
// 💳 Billing status view (client). 10.0 §15. Polls the VERIFIED payment state for
// an EXISTING logged-in org converting its trial → paid. Never activates —
// activation is the webhook's job; this only reflects the truth. On success it
// returns the owner to the workspace / account (not /login — they are already in).
// ============================================================================
import { useEffect, useState } from "react";
import Link from "next/link";
import { paymentStatusAction } from "@/lib/commercial/actions";

type State = { status: string; verified: boolean; activated: boolean };

export function BillingStatusView({ paymentId, cancelledHint }: { paymentId: string | null; cancelledHint: boolean }) {
  const [s, setS] = useState<State | null>(null);

  useEffect(() => {
    if (!paymentId) return;
    let alive = true;
    const poll = async () => {
      const r = await paymentStatusAction(paymentId).catch(() => null);
      if (alive && r) setS(r);
    };
    poll();
    const id = window.setInterval(poll, 4000);
    return () => { alive = false; window.clearInterval(id); };
  }, [paymentId]);

  const activated = s?.activated === true;
  const failed = s ? ["failed", "cancelled", "expired"].includes(s.status) : false;

  return (
    <div dir="rtl" className="bg-surface mx-auto flex min-h-screen w-full max-w-[520px] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="bg-card border-line flex w-full flex-col items-center gap-3 rounded-[20px] border p-8 shadow-[var(--shadow-card)]">
        {!paymentId ? (
          <>
            <p className="text-muted text-sm">לא נמצא מזהה תשלום.</p>
            <Link href="/account" className="bg-brand mt-2 rounded-full px-6 py-2.5 text-sm font-black text-white">לחשבון ולחיוב ←</Link>
          </>
        ) : activated ? (
          <>
            <div className="text-4xl">✅</div>
            <h1 className="text-ink text-xl font-black">התשלום אומת והמנוי הופעל</h1>
            <p className="text-muted text-sm">הכול מוכן — אפשר להמשיך לעבוד.</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <Link href="/" className="bg-brand rounded-full px-6 py-2.5 text-sm font-black text-white">לסביבת העבודה ←</Link>
              <Link href="/account" className="bg-surface text-ink border-line rounded-full border px-6 py-2.5 text-sm font-bold">לחשבון ולחיוב</Link>
            </div>
          </>
        ) : failed ? (
          <>
            <div className="text-4xl">⚠️</div>
            <h1 className="text-ink text-xl font-black">התשלום לא הושלם</h1>
            <p className="text-muted text-sm">{cancelledHint ? "התשלום בוטל." : "לא התקבל אישור תשלום."} החשבון והנתונים שמורים — אפשר לנסות שוב מהחשבון.</p>
            <Link href="/account" className="bg-brand mt-2 rounded-full px-6 py-2.5 text-sm font-black text-white">חזרה לחשבון ולחיוב ←</Link>
          </>
        ) : (
          <>
            <div className="text-4xl animate-pulse">⏳</div>
            <h1 className="text-ink text-xl font-black">ממתינים לאישור התשלום</h1>
            <p className="text-muted text-sm">המנוי יופעל אוטומטית ברגע שהתשלום יאומת בשרת. אין צורך לרענן — העמוד יתעדכן לבד.</p>
            <p className="text-muted/70 text-[11px]">חשוב: הפעלה נעשית רק לאחר אימות תשלום מאובטח — לעולם לא על סמך חזרה מהדפדפן.</p>
            <Link href="/account" className="text-muted mt-1 text-[12px] underline">חזרה לחשבון</Link>
          </>
        )}
      </div>
    </div>
  );
}
