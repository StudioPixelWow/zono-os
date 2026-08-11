// ZONO — Platform · Integration Control Center (P5.6). Cross-org roll-up of
// provider connection states (safe state only — NEVER tokens/secrets/payloads)
// + Facebook extension heartbeat health. Cap: platform.integrations.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getPlatformIntegrationsRollup } from "@/lib/platform-admin/server/ops";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, formatPlatformDateTime } from "@/components/platform-admin/ui";
import { IntegrationRollupCard, HeartbeatChip } from "@/components/platform-admin/ops-ui";
import { Icon } from "@/components/dashboard/Icon";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.integrations.read");
  if (!operator) return <PlatformDenied />;
  const v = await getPlatformIntegrationsRollup();
  const ext = v.extension;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="תפעול" title="מרכז אינטגרציות" description="מצב חיבור חוצה-ארגונים לכל ספק — מצב בטוח בלבד. טוקנים, סודות ומטענים גולמיים לעולם אינם נחשפים." icon="Globe" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {v.providers.map((p) => <IntegrationRollupCard key={p.provider} label={p.label} total={p.total} byState={p.byState} />)}
      </div>

      <PanelCard title="תוסף Facebook Assistant — בריאות heartbeat" icon="Activity">
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "פעילים", n: ext.healthy, tone: "text-success" },
            { label: "לא עדכניים", n: ext.stale, tone: "text-warning" },
            { label: "לא מקוונים", n: ext.offline, tone: "text-danger" },
            { label: "לא ידוע", n: ext.unknown, tone: "text-muted" },
          ].map((c) => (
            <div key={c.label} className="border-line bg-surface rounded-xl border p-3 text-center">
              <div className={"text-2xl font-black tabular-nums " + c.tone}>{c.n}</div>
              <div className="text-muted mt-1 text-[11px] font-semibold">{c.label}</div>
            </div>
          ))}
        </div>
        <p className="text-muted mb-3 px-1 text-[11px]">ספים (בחירת מוצר — אין קצב heartbeat מוגדר בקוד): פעיל ≤ 15 דק׳ · לא עדכני ≤ 24 ש׳ · לא מקוון &gt; 24 ש׳.</p>
        {ext.total === 0 ? (
          <p className="text-muted px-1 py-3 text-[13px]">אין מופעי תוסף מזווגים.</p>
        ) : (
          <div className="border-line overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <thead>
                <tr className="border-line bg-surface border-b text-[12px]">
                  {["מזהה מופע", "ארגון", "מצב", "גרסה", "נראה לאחרונה", "heartbeat"].map((h) => <th key={h} className="text-muted px-3 py-2.5 text-start font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {ext.recent.map((r) => (
                  <tr key={r.instanceId} className="border-line border-b last:border-0">
                    <td className="text-muted px-3 py-2.5 font-mono text-[11px]" dir="ltr">{r.instanceId.slice(0, 10)}</td>
                    <td className="text-ink px-3 py-2.5 font-semibold">{r.orgId ? <Link href={`/platform/customers/${r.orgId}/operations`} className="hover:text-brand">{r.orgName ?? r.orgId.slice(0, 8)}</Link> : "—"}</td>
                    <td className="text-muted px-3 py-2.5 text-[12px]">{r.status ?? "—"}</td>
                    <td className="text-muted px-3 py-2.5 text-[12px]" dir="ltr">{r.version ?? "—"}</td>
                    <td className="text-muted px-3 py-2.5 text-[12px]">{r.lastSeenAt ? formatPlatformDateTime(r.lastSeenAt) : "—"}</td>
                    <td className="px-3 py-2.5"><HeartbeatChip hb={r.heartbeat} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>

      <div className="border-line bg-surface flex items-center gap-2 rounded-xl border px-4 py-3">
        <span className="text-muted"><Icon name="Lock" size={14} /></span>
        <span className="text-muted text-[12px] font-semibold">תצוגה לקריאה בלבד — מצב חיבור בלבד. ללא access/refresh tokens, סודות OAuth, מפתחות API או סוד התוסף.</span>
      </div>

      <p className="text-muted px-1 text-[11px]">עודכן: {formatPlatformDateTime(v.generatedAt)}</p>
    </div>
  );
}
