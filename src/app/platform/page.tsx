// ZONO — Platform Owner Overview (P5.10). The owner's 10-second answer: business
// state, product usage, customer risk, operational risk, and what to inspect
// next. Owner-intelligence layer (deterministic activity/health/risk, honest
// KPIs, attention queue, adoption) on top of the P5.1 audited aggregates. No
// fabricated MRR/ARR/churn/AI-cost — only real, explainable data.
import Link from "next/link";
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getPlatformOverviewMetrics, listRecentPlatformAudit } from "@/lib/platform-admin/server/dal";
import { getOwnerOverview, getCustomerIntel, getAttentionQueue, getFeatureAdoption } from "@/lib/platform-admin/server/intel";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import {
  PageHeader, UsageTile, PanelCard, PlanBadge, QuickLink,
  MetricValue, formatPlatformDate, formatPlatformDateTime,
} from "@/components/platform-admin/ui";
import { KpiBlock, AttentionList, AdoptionList, ActivityChip, HealthChip } from "@/components/platform-admin/intel-ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

export default async function PlatformOverviewPage() {
  const operator = await authorizePlatform("platform.customers.read");
  if (!operator) return <PlatformDenied />;

  const [owner, intel, attention, adoption, metrics, audit] = await Promise.all([
    getOwnerOverview(),
    getCustomerIntel(),
    getAttentionQueue(),
    getFeatureAdoption(),
    getPlatformOverviewMetrics(),
    listRecentPlatformAudit(8).catch(() => []),
  ]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageHeader eyebrow="ZONO · OWNER" title="מודיעין בעלים" icon="LayoutGrid" description="מצב העסק, אימוץ המוצר, סיכון לקוחות וסיכון תפעולי — נתונים אמיתיים בלבד." />
        <span className="text-muted pb-1 text-[11px]">עודכן {formatPlatformDateTime(owner.generatedAt)}</span>
      </div>

      {/* Owner KPI row — honest, capability-degrading */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiBlock icon="Building2" label="לקוחות" value={owner.customers} tone="brand" sub={`${owner.activeCustomers} פעילים · ${owner.newCustomers} חדשים`} />
        <KpiBlock icon="UserCheck" label="משתמשים פעילים" value={owner.activeUsers} available={owner.activeUsers !== null} tone="success" />
        <KpiBlock icon="Banknote" label="הכנסה מאומתת" value={owner.verifiedRevenueIls.value} available={owner.verifiedRevenueIls.available} money tone="brand" />
        <KpiBlock icon="AlertTriangle" label="דורש טיפול" value={(owner.openUrgentTickets.value ?? 0) + owner.criticalCustomers} tone="danger" sub={`${owner.atRiskCustomers} בסיכון · ${owner.criticalCustomers} קריטיים`} />
      </div>

      {/* Attention queue + customer risk */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <PanelCard title="דורש תשומת לב" icon="AlertTriangle" className="lg:col-span-2">
          <AttentionList items={attention} />
        </PanelCard>
        <PanelCard title="אימוץ מוצר" icon="Activity">
          <AdoptionList rows={adoption.rows} />
          <p className="text-muted mt-3 px-1 text-[11px]">{adoption.note}</p>
        </PanelCard>
      </div>

      {/* Customer intelligence table */}
      <div className="mt-5">
        <PanelCard title={`לקוחות — מצב פעילות ובריאות (${intel.customers.length})`} icon="Building2" action={<Link href="/platform/customers" className="text-brand-strong text-[12px] font-bold">כל הלקוחות</Link>}>
          <div className="border-line overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="border-line bg-surface border-b text-[12px]">
                  {["לקוח", "תוכנית", "פעילות", "בריאות", "סיבות", "פעילות אחרונה"].map((h) => <th key={h} className="text-muted px-3 py-2.5 text-start font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {intel.customers.map((c) => (
                  <tr key={c.orgId} className="border-line border-b last:border-0">
                    <td className="px-3 py-2.5"><Link href={`/platform/customers/${c.orgId}`} className="text-ink hover:text-brand font-semibold">{c.orgName ?? c.orgId.slice(0, 8)}</Link></td>
                    <td className="px-3 py-2.5"><PlanBadge plan={c.plan} /></td>
                    <td className="px-3 py-2.5"><ActivityChip state={c.activity} /></td>
                    <td className="px-3 py-2.5"><HealthChip state={c.health.state} /></td>
                    <td className="text-muted px-3 py-2.5 text-[12px]">{c.health.reasons.join(" · ")}</td>
                    <td className="text-muted px-3 py-2.5 text-[12px]">{c.freshness}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>
      </div>

      {/* Product usage strip (P5.1 authoritative aggregates) */}
      <div className="mt-5">
        <PanelCard title="שימוש בליבת המוצר" icon="Activity">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <UsageTile icon="Megaphone" label="קמפייני הפצה" metric={metrics.campaigns} />
            <UsageTile icon="Globe" label="פרסומי פייסבוק" metric={metrics.facebookPublishes} />
            <UsageTile icon="MessageCircle" label="הודעות וואטסאפ" metric={metrics.whatsappMessages} />
          </div>
        </PanelCard>
      </div>

      {/* Operational health + audit + AI-cost gap */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
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

        <PanelCard title="עלות AI" icon="Activity">
          <div className="border-line bg-warning-soft/40 flex items-start gap-2 rounded-xl border px-3 py-2.5">
            <span className="text-warning mt-0.5"><Icon name="AlertCircle" size={14} /></span>
            <span className="text-ink text-[12px] font-semibold">ייחוס עלות AI לא זמין — אין אינסטרומנטציה של tokens/עלות בסכימה. נדרשת מיגרציה אדיטיבית (מוצע, לא הוחל).</span>
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

      {/* Quick links */}
      <div className="mt-5">
        <p className="text-muted mb-2 text-[11px] font-bold uppercase tracking-wide">קפיצה מהירה</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink href="/platform/customers" icon="Building2" label="לקוחות" />
          <QuickLink href="/platform/revenue" icon="Banknote" label="הכנסות" />
          <QuickLink href="/platform/operations" icon="Activity" label="תפעול" />
          <QuickLink href="/platform/security" icon="Shield" label="אבטחה" />
        </div>
      </div>
    </div>
  );
}
