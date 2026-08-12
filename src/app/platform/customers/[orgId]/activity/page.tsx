// ZONO — Customer 360 · Activity tab (P5.2). Human-readable org activity from
// audit_log (safe columns only — no metadata/raw payloads). Cap: platform.audit.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getOrgActivityForPlatform } from "@/lib/platform-admin/server/dal";
import { RestrictedPanel, EmptyPanel } from "@/components/platform-admin/customer360-ui";
import { PanelCard, formatPlatformDateTime } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

export default async function Customer360ActivityPage({ params }: { params: Promise<{ orgId: string }> }) {
  const operator = await authorizePlatform("platform.audit.read");
  if (!operator) return <RestrictedPanel />;
  const { orgId } = await params;
  const entries = await getOrgActivityForPlatform(orgId, 30);

  if (entries.length === 0) return <EmptyPanel icon="ScrollText" note="אין פעילות מתועדת עבור ארגון זה" />;

  return (
    <PanelCard title="ציר זמן פעילות" icon="ScrollText">
      <ul className="flex flex-col">
        {entries.map((e) => (
          <li key={e.id} className="flex gap-3 px-2 py-2.5">
            <span className="text-brand-light mt-0.5 shrink-0"><Icon name="Activity" size={15} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-ink text-[13px] font-bold">{e.summary || e.action}</p>
                <span className="text-muted shrink-0 text-[11px]">{formatPlatformDateTime(e.createdAt)}</span>
              </div>
              <p className="text-muted mt-0.5 text-[11.5px]">
                {e.category ? <span className="bg-surface border-line me-1.5 rounded border px-1.5 py-0.5 font-semibold">{e.category}</span> : null}
                {e.entityType ? <span className="me-1.5">{e.entityType}</span> : null}
                {e.actorName ? <span className="text-muted/80">· {e.actorName}</span> : null}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}
