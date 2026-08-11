// ZONO — Customer 360 · Operations tab (P5.6). Customer-scoped failure signals:
// failed publish jobs, failed Meta jobs, dead-letters (count + latest + SAFE enum
// reason) + this org's Facebook extension heartbeat + links to platform-wide ops.
// No stack traces, no credentials, no raw payloads. Read-only. Cap: ops.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getOrgOperationsForPlatform } from "@/lib/platform-admin/server/dal";
import { getOrgExtensionInstances } from "@/lib/platform-admin/server/ops";
import { RestrictedPanel, MetricStat } from "@/components/platform-admin/customer360-ui";
import { PanelCard, formatPlatformDateTime } from "@/components/platform-admin/ui";
import { HeartbeatChip } from "@/components/platform-admin/ops-ui";
import { Icon } from "@/components/dashboard/Icon";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Customer360OperationsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const operator = await authorizePlatform("platform.ops.read");
  if (!operator) return <RestrictedPanel />;
  const { orgId } = await params;
  const [ops, ext] = await Promise.all([getOrgOperationsForPlatform(orgId), getOrgExtensionInstances(orgId)]);

  return (
    <div className="space-y-5">
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

      <PanelCard title="תוסף Facebook Assistant" icon="Activity">
        {ext.extension.length === 0 ? (
          <p className="text-muted px-1 py-3 text-[13px]">אין מופעי תוסף מזווגים לארגון זה.</p>
        ) : (
          <ul className="divide-line divide-y">
            {ext.extension.map((r) => (
              <li key={r.instanceId} className="flex items-center gap-3 px-1 py-2.5">
                <span className="text-muted font-mono text-[11px]" dir="ltr">{r.instanceId.slice(0, 10)}</span>
                <span className="text-muted text-[12px]">{r.status ?? "—"}{r.version ? ` · v${r.version}` : ""}</span>
                <span className="text-muted ms-auto text-[11px]">{r.lastSeenAt ? formatPlatformDateTime(r.lastSeenAt) : "—"}</span>
                <HeartbeatChip hb={r.heartbeat} />
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <div className="border-line bg-surface flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
        <span className="text-muted text-[12px] font-semibold">תפעול פלטפורמה:</span>
        <Link href="/platform/operations" className="text-brand text-[12px] font-bold">סקירה</Link>
        <Link href="/platform/operations/jobs" className="text-brand text-[12px] font-bold">תורים</Link>
        <Link href="/platform/operations/integrations" className="text-brand text-[12px] font-bold">אינטגרציות</Link>
      </div>
    </div>
  );
}
