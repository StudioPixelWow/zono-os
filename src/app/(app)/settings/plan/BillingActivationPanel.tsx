"use client";
// ============================================================================
// ZONO — Billing activation panel. The customer-facing trial→paid surface: current
// plan, active seats, unit + monthly price, trial status/end, subscription status,
// and real payment + invoice history — with ONE primary CTA, "הפעלת המנוי". The
// price is NEVER supplied here; the server derives it and returns only a checkout
// URL. Paid orgs see an active-subscription state instead of the CTA.
// ============================================================================
import { useState, useTransition } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { activateSubscriptionAction } from "@/lib/commercial/self-service";
import type { BillingOverview } from "@/lib/commercial/overview";

const ils = (n: number | null | undefined) => (n == null ? "—" : `₪${Number(n).toLocaleString("he-IL")}`);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL") : "—");
const STATUS_HE: Record<string, string> = { active: "פעיל", trial: "תקופת ניסיון", trialing: "תקופת ניסיון", cancelled: "מבוטל", canceled: "מבוטל", past_due: "בפיגור", expired: "פג" };

export function BillingActivationPanel({ overview }: { overview: BillingOverview }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const o = overview;

  function activate() {
    setMsg(null);
    start(async () => {
      const r = await activateSubscriptionAction();
      if (r.ok && r.url && !r.simulated) { window.location.href = r.url; return; }
      if (r.ok && r.simulated) { setMsg({ tone: "info", text: "ספק התשלומים פועל בסביבת בדיקה (sandbox) — לא בוצע חיוב אמיתי. הגדר/י את Grow כדי לסלוק." }); return; }
      setMsg({ tone: "error", text: r.error ?? "לא ניתן להפעיל כרגע." });
    });
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      {/* Trial / status banner */}
      {o.paid ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <div className="flex items-center gap-2 font-black"><Icon name="CheckCircle" size={18} /> המנוי פעיל</div>
          <p className="mt-1 text-sm">חיוב חודשי {ils(o.monthlyIls)} · {o.billableAgents} משתמשים · החיוב הבא: {fmtDate(o.currentPeriodEnd)}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-brand-light bg-brand-soft p-4 text-ink">
          <div className="flex items-center gap-2 font-black">
            <Icon name="Sparkles" size={18} /> נדרשת הפעלת מנוי
          </div>
          <p className="mt-1 text-sm">
            כדי להשתמש ב-ZONO יש להפעיל את המנוי — {ils(o.monthlyIls)} לחודש ({o.billableAgents} משתמשים × {ils(o.pricePerAgentIls)}). כל המידע שכבר הוכן עבורך שמור וממתין.
          </p>
        </div>
      )}

      {/* Plan summary + primary CTA */}
      <div className="bg-card border-line rounded-2xl border p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="משתמשים פעילים" value={String(o.billableAgents)} />
          <Stat label="מחיר למשתמש" value={ils(o.pricePerAgentIls)} />
          <Stat label="סה״כ חודשי" value={o.customPricingRequired ? "התאמה אישית" : ils(o.monthlyIls)} />
          <Stat label="סטטוס" value={STATUS_HE[o.subscriptionStatus ?? ""] ?? (o.isTrial ? "תקופת ניסיון" : "—")} />
        </div>

        {!o.paid && (
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button" onClick={activate} disabled={pending || o.customPricingRequired}
              className="bg-brand-strong inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[15px] font-black text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
            >
              <Icon name="Sparkles" size={18} /> {pending ? "מכין תשלום…" : "הפעלת המנוי"}
            </button>
            {o.customPricingRequired && <p className="text-muted text-xs">מעל 10 משתמשים — תמחור מותאם. פנה/י לתמיכה להפעלה.</p>}
            {msg && <p className={`text-xs font-semibold ${msg.tone === "error" ? "text-red-600" : "text-muted"}`}>{msg.text}</p>}
          </div>
        )}
      </div>

      {/* Payment + invoice history */}
      {o.payments.length > 0 && (
        <div className="bg-card border-line rounded-2xl border p-5">
          <h3 className="text-ink mb-2 text-sm font-black">היסטוריית תשלומים וחשבוניות</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[13px]">
              <thead><tr className="text-muted text-[11px]">
                <th className="py-1.5 pl-3 font-semibold">תאריך</th><th className="py-1.5 pl-3 font-semibold">סכום</th>
                <th className="py-1.5 pl-3 font-semibold">סטטוס</th><th className="py-1.5 pl-3 font-semibold">סביבה</th><th className="py-1.5 font-semibold">חשבונית</th>
              </tr></thead>
              <tbody>
                {o.payments.map((p) => (
                  <tr key={p.id} className="border-line/60 border-t">
                    <td className="py-2 pl-3">{fmtDate(p.createdAt)}</td>
                    <td className="py-2 pl-3 tabular-nums">{ils(p.amountIls)}</td>
                    <td className="py-2 pl-3">{p.verified ? "שולם" : (STATUS_HE[p.status ?? ""] ?? p.status ?? "—")}</td>
                    <td className="py-2 pl-3">{p.environment === "production" ? "ייצור" : p.environment === "sandbox" ? "בדיקה" : "—"}</td>
                    <td className="py-2">{p.invoiceUrl ? <a href={p.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-brand-strong font-bold">{p.invoiceNumber ?? "צפייה"}</a> : (p.invoiceNumber ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted text-[11px] font-semibold">{label}</div>
      <div className="text-ink mt-0.5 text-lg font-black">{value}</div>
    </div>
  );
}
