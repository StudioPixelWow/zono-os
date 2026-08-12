// ZONO — Customer 360 · Marketing & Distribution tab (P5.2). Org-level counts
// (campaigns, queued/published/failed posts, FB-group posts, social leads,
// WhatsApp campaigns). READ-ONLY — no publishing, no impersonation. Cap: usage.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getOrgDistributionForPlatform } from "@/lib/platform-admin/server/dal";
import { RestrictedPanel, MetricStat } from "@/components/platform-admin/customer360-ui";
import { PanelCard, formatPlatformDateTime } from "@/components/platform-admin/ui";

export const dynamic = "force-dynamic";

export default async function Customer360DistributionPage({ params }: { params: Promise<{ orgId: string }> }) {
  const operator = await authorizePlatform("platform.usage.read");
  if (!operator) return <RestrictedPanel />;
  const { orgId } = await params;
  const d = await getOrgDistributionForPlatform(orgId);

  return (
    <div className="flex flex-col gap-5">
      <PanelCard title="הפצה" icon="Megaphone">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricStat label="קמפיינים" metric={d.campaigns} />
          <MetricStat label="פוסטים בתור" metric={d.queuedPosts} />
          <MetricStat label="פוסטים שפורסמו" metric={d.publishedPosts} />
          <MetricStat label="פוסטים שנכשלו" metric={d.failedPosts} />
        </div>
        <p className="text-muted mt-3 px-1 text-[12px]">פרסום אחרון: <span className="text-ink font-bold">{d.lastPublishedAt ? formatPlatformDateTime(d.lastPublishedAt) : "—"}</span></p>
      </PanelCard>

      <PanelCard title="קבוצות פייסבוק ותקשורת" icon="Globe">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricStat label="פוסטים בקבוצות" metric={d.groupPosts} />
          <MetricStat label="לידים חברתיים" metric={d.socialLeads} />
          <MetricStat label="קמפייני וואטסאפ" metric={d.whatsappCampaigns} />
        </div>
      </PanelCard>

      <div className="border-line bg-surface flex items-center gap-2 rounded-xl border px-4 py-3">
        <span className="text-muted text-[12px] font-semibold">תצוגה זו לקריאה בלבד — אין פעולות פרסום או שליחה מתוך מסך הניהול.</span>
      </div>
    </div>
  );
}
