// ZONO — Platform · Feature Access (P5.4 · SHADOW MODE). The canonical
// features×plans access matrix + platform-wide drift report. READ-ONLY: shows
// what each plan entitles and where the new resolver would differ from today's
// always-on behavior. No enforcement, no mutation.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getPlatformAccessDrift } from "@/lib/platform-admin/server/access";
import { getPlatformLimitDrift } from "@/lib/limits/server/limits";
import { getEnforcementReadiness } from "@/lib/enforcement/server/enforcement";
import { buildAccessMatrix, PLAN_TIERS } from "@/lib/platform-admin/access/model";
import { operatorCan } from "@/lib/platform-admin/capabilities";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, PlanBadge } from "@/components/platform-admin/ui";
import { AccessMatrixTable, DriftSummaryStrip } from "@/components/platform-admin/access-ui";
import { Icon } from "@/components/dashboard/Icon";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  exceeded: "bg-danger-soft text-danger", near_limit: "bg-warning-soft text-warning", normal: "bg-success-soft text-success",
};

export default async function Page() {
  const operator = await authorizePlatform("platform.flags.read");
  if (!operator) return <PlatformDenied />;

  const matrix = buildAccessMatrix();
  const report = await getPlatformAccessDrift();
  const canEntitle = operatorCan(operator, "platform.entitlements.read");
  const limitDrift = canEntitle ? await getPlatformLimitDrift() : null;
  const readiness = canEntitle ? await getEnforcementReadiness() : null;
  const READINESS_TONE: Record<string, string> = {
    SAFE_TO_ENFORCE: "bg-success-soft text-success", NEEDS_ATOMIC_GUARD: "bg-warning-soft text-warning",
    NEEDS_DATA_FIX: "bg-warning-soft text-warning", NEEDS_PRODUCT_DECISION: "bg-info-soft text-info", UNAVAILABLE: "bg-surface text-muted",
  };

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

      {limitDrift && (
        <PanelCard title="דוח סטיית מגבלות (מצב צל)" icon="Activity">
          {limitDrift.rows.some((r) => r.severity === "critical") && (
            <div className="border-danger-soft bg-danger-soft/40 mb-4 flex items-start gap-2 rounded-xl border px-4 py-3">
              <span className="text-danger mt-0.5"><Icon name="AlertTriangle" size={15} /></span>
              <span className="text-ink text-[12px] font-semibold">קיימות חריגות מהתקרה המוצעת — במצב צל אינן חוסמות. יש לפתור (שדרוג / override) לפני אכיפה עתידית (P7).</span>
            </div>
          )}
          <div className="border-line overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[620px] border-collapse text-[13px]">
              <thead>
                <tr className="border-line bg-surface border-b text-[12px]">
                  {["ארגון", "מגבלה", "שימוש / תקרה", "נותר", "סטטוס", "מצב", "יחסום?"].map((h) => <th key={h} className="text-muted px-3 py-2.5 text-start font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {limitDrift.rows.map((r, i) => (
                  <tr key={`${r.orgId}-${r.limitKey}-${i}`} className="border-line border-b last:border-0">
                    <td className="px-3 py-2.5"><Link href={`/platform/customers/${r.orgId}/access`} className="text-ink hover:text-brand font-semibold">{r.orgName ?? r.orgId}</Link></td>
                    <td className="text-ink px-3 py-2.5">{r.label}</td>
                    <td className="text-ink px-3 py-2.5 tabular-nums">{r.usage ?? "—"} / {r.configuredLimit ?? "∞"}</td>
                    <td className="text-muted px-3 py-2.5 tabular-nums">{r.remaining ?? "—"}</td>
                    <td className="px-3 py-2.5"><span className={"rounded-md px-2 py-0.5 text-[11px] font-bold " + (STATUS_TONE[r.status] ?? "")}>{r.status}</span></td>
                    <td className="text-muted px-3 py-2.5 text-[11px]" dir="ltr">{r.mode}</td>
                    <td className="px-3 py-2.5 text-[11px] font-bold">{r.wouldBlock ? <span className="text-danger">כן (צל)</span> : <span className="text-muted">לא</span>}</td>
                  </tr>
                ))}
                {limitDrift.rows.length === 0 && <tr><td colSpan={7} className="text-muted px-3 py-4 text-[13px]">אין מגבלות ברות-השוואה לניתוח</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-muted mt-3 px-1 text-[11px]">{limitDrift.note}</p>
        </PanelCard>
      )}

      {readiness && (
        <PanelCard title="מוכנות לאכיפה (P7.0)" icon="ShieldCheck">
          <div className="border-line overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <thead>
                <tr className="border-line bg-surface border-b text-[12px]">
                  {["מגבלה", "מצב נוכחי", "מוכנות", "אטומי בטוח?", "הערה"].map((h) => <th key={h} className="text-muted px-3 py-2.5 text-start font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {readiness.limits.map((l) => (
                  <tr key={l.limitKey} className="border-line border-b last:border-0">
                    <td className="text-ink px-3 py-2.5 font-semibold" dir="ltr">{l.limitKey}</td>
                    <td className="text-muted px-3 py-2.5 text-[11px] font-bold" dir="ltr">{l.globalMode}</td>
                    <td className="px-3 py-2.5"><span className={"rounded-md px-2 py-0.5 text-[11px] font-bold " + (READINESS_TONE[l.readiness] ?? "")} dir="ltr">{l.readiness}</span></td>
                    <td className="px-3 py-2.5 text-[11px] font-bold">{l.atomicSafe ? <span className="text-success">כן</span> : <span className="text-warning">לא</span>}</td>
                    <td className="text-muted px-3 py-2.5 text-[12px]">{l.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted mt-3 px-1 text-[11px]">{readiness.note} · שומר אטומי ב-DB: {readiness.atomicGuardAvailable ? "זמין" : "לא הוחל (מיגרציה מוצעת)"}</p>
        </PanelCard>
      )}
    </div>
  );
}
