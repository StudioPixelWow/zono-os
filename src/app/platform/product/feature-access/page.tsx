// ZONO — Platform · Feature Access (P5.4 · SHADOW MODE). The canonical
// features×plans access matrix + platform-wide drift report. READ-ONLY: shows
// what each plan entitles and where the new resolver would differ from today's
// always-on behavior. No enforcement, no mutation.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getPlatformAccessDrift } from "@/lib/platform-admin/server/access";
import { buildAccessMatrix, PLAN_TIERS } from "@/lib/platform-admin/access/model";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, PlanBadge } from "@/components/platform-admin/ui";
import { AccessMatrixTable, DriftSummaryStrip } from "@/components/platform-admin/access-ui";
import { Icon } from "@/components/dashboard/Icon";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.flags.read");
  if (!operator) return <PlatformDenied />;

  const matrix = buildAccessMatrix();
  const report = await getPlatformAccessDrift();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="מוצר"
        title="גישת יכולות"
        description="מטריצת גישה קנונית (יכולות × תוכניות) ודוח סטייה חוצה-ארגונים — מצב צל, לקריאה בלבד."
        icon="ShieldCheck"
      />

      <div className="border-warning-soft bg-warning-soft/40 flex items-center gap-2 rounded-xl border px-4 py-3">
        <span className="text-warning"><Icon name="AlertCircle" size={15} /></span>
        <span className="text-ink text-[12px] font-semibold">מצב צל (SHADOW): המערכת מחשבת ומדווחת גישה אך אינה אוכפת — התנהגות המוצר נשארת כפי שהיא.</span>
      </div>

      <PanelCard title="מטריצת גישה — יכולות × תוכניות" icon="ShieldCheck">
        <AccessMatrixTable rows={matrix} tiers={PLAN_TIERS} />
        <p className="text-muted mt-3 px-1 text-[11px]">✓ = כלול בתוכנית · − = דורש שדרוג. Overrides ברמת ארגון מוצגים בכרטיס הלקוח.</p>
      </PanelCard>

      <PanelCard title={`דוח סטייה — ${report.generatedForOrgs} ארגונים`} icon="Activity">
        <div className="mb-4 px-1"><DriftSummaryStrip summary={report.totals} /></div>
        {report.totals.critical > 0 && (
          <div className="border-danger-soft bg-danger-soft/40 mb-4 flex items-start gap-2 rounded-xl border px-4 py-3">
            <span className="text-danger mt-0.5"><Icon name="AlertTriangle" size={15} /></span>
            <span className="text-ink text-[12px] font-semibold">נמצאו {report.totals.critical} סטיות קריטיות — אכיפה תסיר גישה שבשימוש כיום. יש לפתור (שדרוג תוכנית / override) לפני מעבר לאכיפה.</span>
          </div>
        )}
        <ul className="divide-line divide-y">
          {report.orgs.map((o) => (
            <li key={o.orgId} className="px-1 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/platform/customers/${o.orgId}/access`} className="text-ink hover:text-brand text-[13px] font-bold">{o.orgName ?? o.orgId}</Link>
                  <div className="mt-0.5"><PlanBadge plan={o.planTier} /></div>
                </div>
                <DriftSummaryStrip summary={o.summary} />
              </div>
              {o.criticalFeatures.length > 0 && (
                <div className="text-danger mt-2 flex flex-wrap gap-1.5 ps-1">
                  {o.criticalFeatures.map((f) => (
                    <span key={f.feature} className="bg-danger-soft rounded-md px-2 py-0.5 text-[11px] font-bold">{f.label}</span>
                  ))}
                </div>
              )}
            </li>
          ))}
          {report.orgs.length === 0 && <li className="text-muted px-1 py-4 text-[13px]">אין ארגונים לניתוח</li>}
        </ul>
      </PanelCard>
    </div>
  );
}
