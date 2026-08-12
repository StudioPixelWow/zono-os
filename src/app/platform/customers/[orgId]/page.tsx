// ZONO — Customer 360 · Overview tab (P5.2). The 10-second account summary:
// account / CRM / marketing / communication / operations — count-only, honest,
// capability-gated. Audited once as customer360.open (in the DAL).
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getOrgOverviewForPlatform } from "@/lib/platform-admin/server/dal";
import { getOrgIntel } from "@/lib/platform-admin/server/intel";
import { RestrictedPanel, HealthChip, MetricStat, distributionHealth, usageHealth, queueHealth } from "@/components/platform-admin/customer360-ui";
import { ActivityChip, HealthChip as IntelHealthChip } from "@/components/platform-admin/intel-ui";
import { PanelCard } from "@/components/platform-admin/ui";

export const dynamic = "force-dynamic";

export default async function Customer360OverviewPage({ params }: { params: Promise<{ orgId: string }> }) {
  const operator = await authorizePlatform("platform.customers.read");
  if (!operator) return <RestrictedPanel />;
  const { orgId } = await params;
  const [o, intel] = await Promise.all([getOrgOverviewForPlatform(orgId), getOrgIntel(orgId)]);

  const dist = distributionHealth(o.failedPosts);
  const usage = usageHealth(o.recentActivityCount);
  const queues = queueHealth(o.failedJobs, o.deadLetters);

  return (
    <div className="flex flex-col gap-5">
      {/* Management summary (P5.10) — same deterministic models as the owner dashboard */}
      {intel ? (
        <div className="border-line bg-card flex flex-wrap items-center gap-3 rounded-2xl border p-4">
          <span className="text-muted text-[12px] font-bold">סיכום ניהולי:</span>
          <ActivityChip state={intel.activity} />
          <IntelHealthChip state={intel.health.state} />
          {intel.health.reasons.length ? <span className="text-muted text-[12px]">{intel.health.reasons.join(" · ")}</span> : null}
          {intel.risks.length ? <span className="text-warning ms-auto text-[12px] font-semibold">סימני סיכון: {intel.risks.map((r) => r.label).join(" · ")}</span> : null}
        </div>
      ) : null}

      {/* Explainable health chips */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HealthChip label="חשבון" status="תקין" tone="ok" />
        <HealthChip label="הפצה" status={dist.label} tone={dist.tone} />
        <HealthChip label="שימוש" status={usage.label} tone={usage.tone} />
        <HealthChip label="תורים" status={queues.label} tone={queues.tone} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PanelCard title="חשבון" icon="Building2">
          <div className="grid grid-cols-2 gap-3">
            <MetricStat label="משתמשים פעילים" metric={o.usersActive} />
            <MetricStat label="סה״כ משתמשים" metric={o.usersTotal} />
          </div>
        </PanelCard>

        <PanelCard title="CRM" icon="Target">
          <div className="grid grid-cols-3 gap-3">
            <MetricStat label="נכסים" metric={o.properties} />
            <MetricStat label="לידים" metric={o.leads} />
            <MetricStat label="לידים חברתיים" metric={o.socialLeads} />
          </div>
        </PanelCard>

        <PanelCard title="שיווק" icon="Megaphone">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricStat label="קמפיינים" metric={o.campaigns} />
            <MetricStat label="בתור" metric={o.queuedPosts} />
            <MetricStat label="פורסמו" metric={o.publishedPosts} />
            <MetricStat label="נכשלו" metric={o.failedPosts} />
          </div>
        </PanelCard>

        <PanelCard title="תקשורת" icon="MessageCircle">
          <div className="grid grid-cols-2 gap-3">
            <MetricStat label="הודעות וואטסאפ" metric={o.whatsappMessages} />
            <MetricStat label="פרסומי פייסבוק" metric={o.facebookPublishes} />
          </div>
        </PanelCard>
      </div>

      <PanelCard title="תפעול" icon="Activity">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricStat label="עבודות שנכשלו" metric={o.failedJobs} />
          <MetricStat label="Dead-letter" metric={o.deadLetters} />
          <MetricStat label="פעילות CRM (7 ימים)" metric={o.recentActivityCount} />
        </div>
      </PanelCard>
    </div>
  );
}
