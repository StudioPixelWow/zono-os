// ZONO — Customer 360 · Billing tab (P5.5). Full commercial detail: resolved
// billing state, plan-compat, subscription, license (org_plans), safe payment
// history, failed-payment warnings, provider status, and the relationship to
// PRODUCT ACCESS (kept explicitly separate — P5.4 shadow mode stays
// authoritative; billing does NOT revoke access in P5.5). READ-ONLY. NO
// signatures / raw payloads / secrets. Cap: platform.billing.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getOrgBillingDetail } from "@/lib/platform-admin/server/billing";
import { RestrictedPanel, KV } from "@/components/platform-admin/customer360-ui";
import { PanelCard, PlanBadge, formatPlatformDate, formatPlatformDateTime } from "@/components/platform-admin/ui";
import { BillingStateChip, PlanCompatNote, MoneyValue, formatIls, ProviderStatusCard } from "@/components/platform-admin/billing-ui";
import { Icon } from "@/components/dashboard/Icon";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PAY_STATUS_LABEL: Record<string, string> = { paid: "שולם", failed: "נכשל", pending: "ממתין", processing: "בעיבוד", cancelled: "בוטל", expired: "פג" };

export default async function Customer360BillingPage({ params }: { params: Promise<{ orgId: string }> }) {
  const operator = await authorizePlatform("platform.billing.read");
  if (!operator) return <RestrictedPanel />;
  const { orgId } = await params;
  const b = await getOrgBillingDetail(orgId);
  const sub = b.subscription;

  return (
    <div className="space-y-5">
      {/* Billing status header — SEPARATED from product access */}
      <div className="border-line bg-card rounded-2xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-muted text-[12px] font-bold">מצב חיוב</span>
            <BillingStateChip state={b.billingState} />
            <span className="text-muted text-[12px]">{b.billingReason}</span>
          </div>
          <div className="flex items-center gap-2">
            <PlanBadge plan={b.planCompat.canonical} />
            <PlanCompatNote compat={b.planCompat} />
          </div>
        </div>
        {b.failedPaymentCount > 0 && (
          <div className="border-danger-soft bg-danger-soft/40 mt-3 flex items-center gap-2 rounded-xl border px-3 py-2">
            <span className="text-danger"><Icon name="AlertTriangle" size={14} /></span>
            <span className="text-ink text-[12px] font-semibold">{b.failedPaymentCount} תשלומים שנכשלו עבור ארגון זה.</span>
          </div>
        )}
      </div>

      {/* Billing vs Access separation note */}
      <div className="border-line bg-surface flex items-start gap-2 rounded-xl border px-4 py-3">
        <span className="text-muted mt-0.5"><Icon name="ShieldCheck" size={14} /></span>
        <span className="text-muted text-[12px] font-semibold">
          חיוב וגישת מוצר מופרדים. מצב החיוב כאן אינו חוסם גישה — גישת המוצר נקבעת ע״י ה-resolver של מצב הצל (P5.4).{" "}
          <Link href={`/platform/customers/${orgId}/access`} className="text-brand font-bold">צפו בגישה האפקטיבית ←</Link>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PanelCard title="מנוי" icon="BadgeCheck">
          {sub ? (
            <dl className="px-1">
              <KV label="תוכנית (קנוני)"><PlanBadge plan={sub.plan} /></KV>
              <KV label="סטטוס מנוי">{sub.subscriptionStatus}</KV>
              <KV label="ספק">{sub.provider ?? "—"}</KV>
              <KV label="תחילת תקופה">{sub.periodStart ? formatPlatformDate(sub.periodStart) : "—"}</KV>
              <KV label="סיום תקופה">{sub.periodEnd ? formatPlatformDate(sub.periodEnd) : "—"}</KV>
              <KV label="סיום ניסיון">{sub.trialEndsAt ? formatPlatformDate(sub.trialEndsAt) : "—"}</KV>
              <KV label="תקופת חסד עד">{sub.graceUntil ? formatPlatformDate(sub.graceUntil) : "—"}</KV>
              <KV label="ביטול בסוף תקופה">{sub.cancelAtPeriodEnd ? "כן" : "לא"}</KV>
            </dl>
          ) : <p className="text-muted px-1 py-4 text-[13px]">אין מנוי לארגון זה</p>}
        </PanelCard>

        <PanelCard title="רישיון + סכום חוזר" icon="Tag">
          <dl className="px-1">
            <KV label="רישיון (org_plans)">{b.license?.plan ? <PlanBadge plan={b.license.plan} /> : "—"}</KV>
            <KV label="סטטוס רישיון">{b.license?.status ?? "—"}</KV>
            <KV label="סיום תקופת רישיון">{b.license?.currentPeriodEnd ? formatPlatformDate(b.license.currentPeriodEnd) : "—"}</KV>
            <KV label="סכום חוזר"><MoneyValue v={b.recurringAmount} /></KV>
            <KV label="מחיר מוצג (הערכה)">{b.priceHintIls !== null ? <span className="text-muted">{formatIls(b.priceHintIls)} <span className="text-[10px]">/ חודש · להצגה בלבד</span></span> : "—"}</KV>
          </dl>
        </PanelCard>

        <PanelCard title={`היסטוריית תשלומים (${b.payments.length})`} icon="Wallet" className="lg:col-span-2">
          {b.payments.length === 0 ? (
            <p className="text-muted px-1 py-4 text-[13px]">אין תשלומים רשומים לארגון זה</p>
          ) : (
            <div className="border-line overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-line bg-surface border-b text-[12px]">
                    {["סכום", "תוכנית", "מצב", "מאומת", "תאריך"].map((h) => <th key={h} className="text-muted px-3 py-2 text-start font-bold">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {b.payments.map((p) => (
                    <tr key={p.id} className="border-line border-b last:border-0">
                      <td className="text-ink px-3 py-2 font-black tabular-nums">{formatIls(p.amountIls, p.currency)}</td>
                      <td className="px-3 py-2"><PlanBadge plan={p.planTier} /></td>
                      <td className="text-muted px-3 py-2">{PAY_STATUS_LABEL[p.status] ?? p.status}</td>
                      <td className="px-3 py-2">{p.verified ? <span className="text-success text-[12px] font-bold">✓</span> : <span className="text-muted text-[12px]">—</span>}</td>
                      <td className="text-muted px-3 py-2 text-[12px]">{formatPlatformDateTime(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelCard>

        <div className="lg:col-span-2"><ProviderStatusCard provider={b.provider} /></div>
      </div>

      <div className="border-line bg-surface flex items-center gap-2 rounded-xl border px-4 py-3">
        <span className="text-muted"><Icon name="Lock" size={14} /></span>
        <span className="text-muted text-[12px] font-semibold">תצוגה לקריאה בלבד — ללא חיובים, זיכויים או שינויי מנוי. שינויי חיוב אינם נתמכים בבטחה ע״י הספק הנוכחי (Grow בסימולציה).</span>
      </div>
    </div>
  );
}
