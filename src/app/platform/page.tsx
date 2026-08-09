// ZONO — Platform Admin Overview (P5.1). The owner's 10-second answer: how many
// customers, how much product usage, are there operational problems, where to
// look next. Every figure comes from the audited cross-org DAL (count-only
// aggregates); metrics the operator can't see render as "מוגבל", never as a
// fabricated 0. No MRR/ARR/churn/ARPU/AI-cost here — those are not yet
// trustworthy in the schema, so they are intentionally omitted.
import Link from "next/link";
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getPlatformOverviewMetrics, listRecentPlatformAudit } from "@/lib/platform-admin/server/dal";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import {
  PageHeader, StatCard, UsageTile, PanelCard, PlanBadge, IdChip, QuickLink,
  MetricValue, formatPlatformDate, formatPlatformDateTime,
} from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

export default async function PlatformOverviewPage() {
  const operator = await authorizePlatform("platform.customers.read");
  if (!operator) return <PlatformDenied />;

  const [metrics, audit] = await Promise.all([
    getPlatformOverviewMetrics(),
    listRecentPlatformAudit(8).catch(() => []),
  ]);

  const usersTotalLabel = metrics.usersTotal.state === "ok" && metrics.usersTotal.value !== null
    ? `מתוך ${new Intl.NumberFormat("en-US").format(metrics.usersTotal.value)}`
    : undefined;

  // Operational status — only meaningful when the operator can read ops health.
  const opsVisible = metrics.deadLetter.state === "ok" || metrics.failedPublishJobs.state === "ok";
  const opsIssues = (metrics.deadLetter.value ?? 0) + (metrics.failedPublishJobs.value ?? 0);
  const statusTone = !opsVisible ? "neutral" : opsIssues > 0 ? "warning" : "ok";
  const statusText = !opsVisible ? "סטטוס תפעולי מוגבל להרשאה" : opsIssues > 0 ? "יש התראות תפעוליות לבדיקה" : "המערכת תקינה";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageHeader eyebrow="ZONO · CONTROL PLANE" title="סקירת פלטפורמה" icon="LayoutGrid" description="תמונת מצב חוצת-ארגונים של ZONO — לקוחות, שימוש בליבת המוצר ובריאות תפעולית." />
        <div className="flex items-center gap-2 pb-1">
          <span className={
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold " +
            (statusTone === "warning" ? "bg-warning-soft text-warning" : statusTone === "ok" ? "bg-success-soft text-success" : "bg-surface text-muted")
          }>
            <span className={"h-2 w-2 rounded-full " + (statusTone === "warning" ? "bg-warning" : statusTone === "ok" ? "bg-success" : "bg-muted")} />
            {statusText}
          </span>
          <span className="text-muted text-[11px]">עודכן {formatPlatformDateTime(metrics.generatedAt)}</span>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="Building2" label="ארגונים" metric={metrics.organizations} tone="brand" />
        <StatCard icon="UserCheck" label="משתמשים פעילים" metric={metrics.usersActive} sub={usersTotalLabel} tone="success" />
        <StatCard icon="Home" label="נכסים" metric={metrics.properties} tone="neutral" />
        <StatCard icon="Target" label="לידים" metric={metrics.leads} tone="neutral" />
      </div>

      {/* Usage strip */}
      <div className="mt-5">
        <PanelCard title="שימוש בליבת המוצר" icon="Activity">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <UsageTile icon="Megaphone" label="קמפייני הפצה" metric={metrics.campaigns} />
            <UsageTile icon="Globe" label="פרסומי פייסבוק" metric={metrics.facebookPublishes} />
            <UsageTile icon="MessageCircle" label="הודעות וואטסאפ" metric={metrics.whatsappMessages} />
          </div>
        </PanelCard>
      </div>

      {/* Middle: recent orgs + operational health + audit */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <PanelCard
          title="פעילות ארגונים אחרונה"
          icon="Building2"
          className="lg:col-span-2"
          action={<Link href="/platform/customers" className="text-brand-strong text-[12px] font-bold">כל הארגונים</Link>}
        >
          {metrics.recentOrganizations.length === 0 ? (
            <p className="text-muted px-2 py-6 text-center text-sm">אין ארגונים להצגה</p>
          ) : (
            <ul className="divide-line divide-y">
              {metrics.recentOrganizations.map((o) => (
                <li key={o.id}>
                  <Link href={`/platform/customers/${o.id}`} className="hover:bg-surface flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors">
                    <span className="text-muted bg-surface grid h-8 w-8 shrink-0 place-items-center rounded-lg"><Icon name="Building2" size={15} /></span>
                    <span className="text-ink min-w-0 flex-1 truncate text-sm font-bold">{o.name}</span>
                    <PlanBadge plan={o.plan} />
                    <span className="text-muted hidden text-[12px] sm:inline">{formatPlatformDate(o.createdAt)}</span>
                    <IdChip id={o.id} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        <div className="flex flex-col gap-5">
          <PanelCard title="בריאות תפעולית" icon="Activity">
            <div className="grid grid-cols-2 gap-3">
              <div className="border-line bg-surface rounded-xl border p-3 text-center">
                <p className="text-ink text-2xl font-black tabular-nums"><MetricValue metric={metrics.deadLetter} /></p>
                <p className="text-muted mt-1 text-[12px] font-semibold">Dead-letter</p>
              </div>
              <div className="border-line bg-surface rounded-xl border p-3 text-center">
                <p className="text-ink text-2xl font-black tabular-nums"><MetricValue metric={metrics.failedPublishJobs} /></p>
                <p className="text-muted mt-1 text-[12px] font-semibold">עבודות שנכשלו</p>
              </div>
            </div>
          </PanelCard>

          <PanelCard title="יומן ביקורת אחרון" icon="ScrollText" action={<Link href="/platform/security/audit-log" className="text-brand-strong text-[12px] font-bold">הכול</Link>}>
            {audit.length === 0 ? (
              <p className="text-muted px-2 py-4 text-center text-[13px]">אין רשומות</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {audit.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-1 py-1.5">
                    <span className="text-brand-light"><Icon name="Fingerprint" size={13} /></span>
                    <span className="text-ink truncate text-[12.5px] font-semibold">{e.action}</span>
                    <span className="text-muted ms-auto shrink-0 text-[11px]">{formatPlatformDate(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </PanelCard>
        </div>
      </div>

      {/* Quick links */}
      <div className="mt-5">
        <p className="text-muted mb-2 text-[11px] font-bold uppercase tracking-wide">קפיצה מהירה</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink href="/platform/customers" icon="Building2" label="ארגונים" />
          <QuickLink href="/platform/security/audit-log" icon="ScrollText" label="יומן ביקורת" />
          <QuickLink href="/platform/operations/system-health" icon="Activity" label="בריאות מערכת" />
          <QuickLink href="/platform/settings" icon="Settings" label="הגדרות" />
        </div>
      </div>
    </div>
  );
}
