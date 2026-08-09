// ZONO — Customer 360 · Billing tab (P5.2). Commercial lifecycle snapshot from
// subscriptions + org_plans + a payments SUMMARY. NO payment signatures / raw
// payloads / provider txn ids. If no commercial rows exist → "אין נתוני חיוב"
// (never fabricated revenue). READ-ONLY. Cap: platform.billing.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getOrgBillingForPlatform } from "@/lib/platform-admin/server/dal";
import { RestrictedPanel, EmptyPanel, MetricStat, KV } from "@/components/platform-admin/customer360-ui";
import { PanelCard, PlanBadge, formatPlatformDate, formatPlatformDateTime } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

export default async function Customer360BillingPage({ params }: { params: Promise<{ orgId: string }> }) {
  const operator = await authorizePlatform("platform.billing.read");
  if (!operator) return <RestrictedPanel />;
  const { orgId } = await params;
  const b = await getOrgBillingForPlatform(orgId);

  if (!b.available) return <EmptyPanel icon="Banknote" note="אין נתוני חיוב עבור ארגון זה" />;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <PanelCard title="מנוי" icon="BadgeCheck">
        {b.subscription ? (
          <dl className="px-1">
            <KV label="תוכנית">{b.subscription.plan || "—"}</KV>
            <KV label="סטטוס">{b.subscription.status || "—"}</KV>
            <KV label="סיום תקופה">{b.subscription.periodEnd ? formatPlatformDate(b.subscription.periodEnd) : "—"}</KV>
            <KV label="סיום ניסיון">{b.subscription.trialEndsAt ? formatPlatformDate(b.subscription.trialEndsAt) : "—"}</KV>
            <KV label="ביטול בסוף תקופה">{b.subscription.cancelAtPeriodEnd ? "כן" : "לא"}</KV>
          </dl>
        ) : <p className="text-muted px-1 py-4 text-[13px]">אין מנוי פעיל</p>}
      </PanelCard>

      <PanelCard title="רישיון (org_plans)" icon="Tag">
        {b.plan ? (
          <dl className="px-1">
            <KV label="תוכנית"><PlanBadge plan={b.plan.plan} /></KV>
            <KV label="סטטוס">{b.plan.status || "—"}</KV>
          </dl>
        ) : <p className="text-muted px-1 py-4 text-[13px]">אין רישום רישוי</p>}
      </PanelCard>

      <PanelCard title="תשלומים" icon="Wallet" className="lg:col-span-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricStat label="תשלומים ששולמו" metric={b.payments.paid} />
          <MetricStat label="תשלומים שנכשלו" metric={b.payments.failed} />
          <div className="border-line bg-surface rounded-xl border p-3">
            <p className="text-muted text-[12px] font-semibold">תשלום אחרון</p>
            {b.payments.latest ? (
              <p className="text-ink mt-1 text-[13px] font-bold">
                {b.payments.latest.amountIls !== null ? `₪${new Intl.NumberFormat("en-US").format(b.payments.latest.amountIls)}` : "—"}
                <span className="text-muted ms-1 text-[11px] font-semibold">{b.payments.latest.status}</span>
              </p>
            ) : <p className="text-muted mt-1 text-[13px]">—</p>}
            {b.payments.latest?.createdAt ? <p className="text-muted mt-0.5 text-[11px]">{formatPlatformDateTime(b.payments.latest.createdAt)}</p> : null}
          </div>
        </div>
      </PanelCard>

      <div className="border-line bg-surface col-span-full flex items-center gap-2 rounded-xl border px-4 py-3">
        <span className="text-muted"><Icon name="Lock" size={14} /></span>
        <span className="text-muted text-[12px] font-semibold">תצוגה לקריאה בלבד — ללא חיובים, זיכויים או שינויי מנוי.</span>
      </div>
    </div>
  );
}
