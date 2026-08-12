// ZONO — Platform · Operations overview (P5.6). Read-only operational status:
// worst-of severity banner, active alerts (deterministic), queue summary,
// dead-letter, extension heartbeat, integration warnings. No fabricated uptime
// or SLA. Cap: platform.ops.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getPlatformOpsOverview } from "@/lib/platform-admin/server/ops";
import { queueSeverity } from "@/lib/platform-admin/ops/model";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, formatPlatformDateTime } from "@/components/platform-admin/ui";
import { StatusBanner, AlertList, QueueTable, IntegrationRollupCard } from "@/components/platform-admin/ops-ui";
import { Icon } from "@/components/dashboard/Icon";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.ops.read");
  if (!operator) return <PlatformDenied />;
  const o = await getPlatformOpsOverview();

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="תפעול" title="סקירת תפעול" description="מצב תפעולי חי — התראות דטרמיניסטיות, תורים, מכתבים מתים, ותוסף. ללא זמינות/SLA מפוברקים." icon="Activity" />
      <StatusBanner severity={o.severity} title="מצב ZONO כרגע" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="border-line bg-card rounded-2xl border p-4">
          <span className="text-danger bg-danger-soft grid h-9 w-9 place-items-center rounded-xl"><Icon name="AlertTriangle" size={17} /></span>
          <p className="text-ink mt-3 text-3xl font-black tabular-nums">{o.alerts.length}</p>
          <p className="text-muted mt-1.5 text-[13px] font-semibold">התראות פעילות</p>
        </div>
        <div className="border-line bg-card rounded-2xl border p-4">
          <span className="text-warning bg-warning-soft grid h-9 w-9 place-items-center rounded-xl"><Icon name="AlertCircle" size={17} /></span>
          <p className="text-ink mt-3 text-3xl font-black tabular-nums">{o.deadLetterTotal ?? "—"}</p>
          <p className="text-muted mt-1.5 text-[13px] font-semibold">מכתבים מתים</p>
        </div>
        <div className="border-line bg-card rounded-2xl border p-4">
          <span className="text-brand bg-brand-soft grid h-9 w-9 place-items-center rounded-xl"><Icon name="ListChecks" size={17} /></span>
          <p className="text-ink mt-3 text-3xl font-black tabular-nums">{o.queues.reduce((s, q) => s + (q.failed ?? 0), 0)}</p>
          <p className="text-muted mt-1.5 text-[13px] font-semibold">משימות שנכשלו</p>
        </div>
        <div className="border-line bg-card rounded-2xl border p-4">
          <span className="text-success bg-success-soft grid h-9 w-9 place-items-center rounded-xl"><Icon name="Activity" size={17} /></span>
          <p className="text-ink mt-3 text-3xl font-black tabular-nums">{o.extension.total ?? 0}</p>
          <p className="text-muted mt-1.5 text-[13px] font-semibold">מופעי תוסף · {o.extension.healthy} פעילים</p>
        </div>
      </div>

      <PanelCard title="התראות פעילות" icon="AlertTriangle"><AlertList alerts={o.alerts} /></PanelCard>

      <PanelCard title="תורים ומשימות" icon="ListChecks" action={<Link href="/platform/operations/jobs" className="text-brand text-[12px] font-bold">פירוט מלא ←</Link>}>
        <QueueTable queues={o.queues} severityOf={queueSeverity} />
      </PanelCard>

      {o.integrations && (
        <PanelCard title="אינטגרציות" icon="Globe" action={<Link href="/platform/operations/integrations" className="text-brand text-[12px] font-bold">מרכז אינטגרציות ←</Link>}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {o.integrations.map((p) => <IntegrationRollupCard key={p.provider} label={p.label} total={p.total} byState={p.byState} />)}
          </div>
        </PanelCard>
      )}

      <p className="text-muted px-1 text-[11px]">עודכן: {formatPlatformDateTime(o.generatedAt)}</p>
    </div>
  );
}
