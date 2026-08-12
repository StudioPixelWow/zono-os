// ZONO — Platform · Revenue overview (P5.5). Honest commercial dashboard.
// Verified revenue + counts are REAL sums; MRR/ARR/ARPU/churn/trial-conversion
// are shown as "לא זמין עדיין" with the reason (no authoritative recurring
// amount source — see audit). No fake numbers. Read-only. Cap billing.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getPlatformRevenueOverview } from "@/lib/platform-admin/server/billing";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard } from "@/components/platform-admin/ui";
import { BillingKpiCard, ProviderStatusCard, BillingShadowBanner, formatIls } from "@/components/platform-admin/billing-ui";
import { Icon } from "@/components/dashboard/Icon";
import { formatPlatformDateTime } from "@/components/platform-admin/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.billing.read");
  if (!operator) return <PlatformDenied />;

  const o = await getPlatformRevenueOverview();
  const t = o.subscriptions;
  const subCells: { label: string; n: number; tone: string }[] = [
    { label: "פעילים", n: t.healthy, tone: "text-success" },
    { label: "ניסיון", n: t.trial, tone: "text-info" },
    { label: "ממתין לתשלום", n: t.pendingPayment, tone: "text-muted" },
    { label: "כשל תשלום", n: t.paymentFailed, tone: "text-danger" },
    { label: "תקופת חסד", n: t.grace, tone: "text-warning" },
    { label: "ביטול בהמתנה", n: t.cancelPending, tone: "text-warning" },
    { label: "מבוטלים", n: t.cancelled, tone: "text-muted" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="הכנסות" title="סקירת הכנסות" description="תמונת מצב מסחרית אמינה — רק מדדים מגובים בנתונים אמיתיים." icon="Banknote" />
      <BillingShadowBanner />

      {/* Honest KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <BillingKpiCard icon="Banknote" label="הכנסה מאומתת (סה״כ)" value={o.verifiedRevenueIls} money tone="success" />
        <BillingKpiCard icon="TrendingUp" label="הכנסה החודש" value={o.thisMonthRevenueIls} money tone="brand" />
        <BillingKpiCard icon="Building2" label="ארגונים משלמים" value={o.payingOrgs} tone="brand" />
        <BillingKpiCard icon="BadgeCheck" label="תשלומים מאומתים" value={o.paymentsVerifiedPaid} tone="neutral" />
      </div>

      {/* Subscription state breakdown */}
      <PanelCard title="מנויים לפי מצב חיוב" icon="BadgeCheck" action={<Link href="/platform/revenue/subscriptions" className="text-brand text-[12px] font-bold">לכל המנויים ←</Link>}>
        {!t.available ? (
          <p className="text-muted px-1 py-4 text-[13px]">נתוני מנויים אינם זמינים כרגע.</p>
        ) : t.total === 0 ? (
          <p className="text-muted px-1 py-4 text-[13px]">אין מנויים במערכת עדיין — המשפך המסחרי טרם הופעל בפרודקשן.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {subCells.map((c) => (
              <div key={c.label} className="border-line bg-surface rounded-xl border p-3 text-center">
                <div className={"text-2xl font-black tabular-nums " + c.tone}>{c.n}</div>
                <div className="text-muted mt-1 text-[11px] font-semibold">{c.label}</div>
              </div>
            ))}
          </div>
        )}
      </PanelCard>

      {/* Unavailable metrics — explained honestly, never faked */}
      <PanelCard title="מדדי הכנסה חוזרת" icon="TrendingUp">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { k: "MRR", v: o.mrr }, { k: "ARR", v: o.arr }, { k: "ARPU", v: o.arpu },
            { k: "נטישה (Churn)", v: o.churn }, { k: "המרת ניסיון", v: o.trialConversion },
          ].map(({ k, v }) => (
            <div key={k} className="border-line bg-surface rounded-xl border p-3">
              <div className="text-ink text-[13px] font-black">{k}</div>
              <div className="text-warning mt-1 inline-flex items-center gap-1 text-[12px] font-bold"><Icon name="AlertCircle" size={12} />לא זמין עדיין</div>
              <div className="text-muted mt-1 text-[11px] leading-snug">{v.available ? formatIls(v.value) : v.reason}</div>
            </div>
          ))}
        </div>
        <p className="text-muted mt-3 px-1 text-[11px]">מדדי הכנסה חוזרת יופעלו כאשר יתקיים מקור סמכותי לסכום חוזר לכל מנוי (לא priceHintIls שהוא להצגה בלבד).</p>
      </PanelCard>

      {/* Provider truth */}
      <ProviderStatusCard provider={o.provider} />

      <p className="text-muted px-1 text-[11px]">עודכן: {formatPlatformDateTime(o.generatedAt)}</p>
    </div>
  );
}
