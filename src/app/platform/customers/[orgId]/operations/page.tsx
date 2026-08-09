// ZONO — Customer 360 · Operations tab (P5.2). Customer-scoped failure signals:
// failed publish jobs, failed Meta jobs, dead-letters — count + latest + a SAFE
// reason (enum). No stack traces, no credentials, no raw payloads. Cap: ops.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getOrgOperationsForPlatform } from "@/lib/platform-admin/server/dal";
import { RestrictedPanel, MetricStat } from "@/components/platform-admin/customer360-ui";
import { PanelCard, formatPlatformDateTime } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

export default async function Customer360OperationsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const operator = await authorizePlatform("platform.ops.read");
  if (!operator) return <RestrictedPanel />;
  const { orgId } = await params;
  const ops = await getOrgOperationsForPlatform(orgId);

  return (
    <PanelCard title="בריאות תפעולית" icon="Activity">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ops.signals.map((s) => {
          const v = s.count.value ?? 0;
          const critical = s.key === "dead_letter" && s.count.state === "ok" && v > 0;
          const warn = s.count.state === "ok" && v > 0 && !critical;
          return (
            <div key={s.key} className={"rounded-xl border p-3 " + (critical ? "border-danger/30 bg-danger-soft" : warn ? "border-warning/30 bg-warning-soft" : "border-line bg-surface")}>
              <div className="flex items-start justify-between">
                <MetricStat label={s.label} metric={s.count} />
                {critical ? <Icon name="AlertTriangle" size={16} className="text-danger" /> : warn ? <Icon name="AlertCircle" size={16} className="text-warning" /> : <Icon name="CheckCircle" size={16} className="text-success" />}
              </div>
              <p className="text-muted mt-2 text-[11px]">
                {s.latestAt ? <>אחרון: {formatPlatformDateTime(s.latestAt)}</> : "אין אירועים"}
                {s.note ? <span className="text-ink font-semibold"> · {s.note}</span> : null}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-muted mt-3 px-1 text-[11px]">מוצגות ספירות וסיבת תקלה בטוחה בלבד (enum) — ללא stack traces או נתונים רגישים.</p>
    </PanelCard>
  );
}
