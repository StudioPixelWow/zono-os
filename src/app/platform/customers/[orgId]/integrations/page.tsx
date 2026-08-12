// ZONO — Customer 360 · Integrations tab (P5.2). Provider health from SAFE
// status/timestamp columns only — never tokens/secrets. Undetermined → "לא זמין".
// Cap: platform.integrations.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getOrgIntegrationsForPlatform } from "@/lib/platform-admin/server/dal";
import { RestrictedPanel, IntegrationBadge } from "@/components/platform-admin/customer360-ui";
import { PanelCard, formatPlatformDateTime } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

const INT_ICON: Record<string, string> = { meta: "Globe", whatsapp: "MessageCircle", google: "Calendar", extension: "Layers" };

export default async function Customer360IntegrationsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const operator = await authorizePlatform("platform.integrations.read");
  if (!operator) return <RestrictedPanel />;
  const { orgId } = await params;
  const items = await getOrgIntegrationsForPlatform(orgId);

  return (
    <PanelCard title="בריאות אינטגרציות" icon="Globe">
      <ul className="divide-line divide-y">
        {items.map((it) => (
          <li key={it.key} className="flex items-center gap-3 px-2 py-3">
            <span className="text-brand bg-surface border-line grid h-9 w-9 shrink-0 place-items-center rounded-lg border"><Icon name={INT_ICON[it.key] ?? "Globe"} size={16} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-ink text-[13.5px] font-bold">{it.label}</p>
              <p className="text-muted text-[12px]">
                {it.detail ? <span className="font-mono" dir="ltr">{it.detail}</span> : "—"}
                {it.lastActivityAt ? <> · פעיל: {formatPlatformDateTime(it.lastActivityAt)}</> : null}
              </p>
            </div>
            <IntegrationBadge state={it.state} />
          </li>
        ))}
      </ul>
      <p className="text-muted mt-3 px-1 text-[11px]">מוצג סטטוס בלבד — אסימונים, סודות וקרדנציאלים לעולם אינם נחשפים.</p>
    </PanelCard>
  );
}
