// ZONO — Customer 360 · Product Usage tab (P5.2). Per-module signals: object
// count + an explainable state (פעיל לאחרונה / בשימוש / ללא פעילות / לא זמין).
// NO proprietary adoption score. Cap: platform.usage.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getOrgProductUsageForPlatform } from "@/lib/platform-admin/server/dal";
import { RestrictedPanel, ModuleUsageBadge } from "@/components/platform-admin/customer360-ui";
import { PanelCard } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

const MODULE_ICON: Record<string, string> = {
  properties: "Home", leads: "Target", matching: "Handshake", journeys: "Route",
  automations: "Settings", recommendations: "Sparkles", distribution: "Megaphone", whatsapp: "MessageCircle",
};

export default async function Customer360UsagePage({ params }: { params: Promise<{ orgId: string }> }) {
  const operator = await authorizePlatform("platform.usage.read");
  if (!operator) return <RestrictedPanel />;
  const { orgId } = await params;
  const modules = await getOrgProductUsageForPlatform(orgId);

  return (
    <PanelCard title="שימוש במודולים" icon="Layers">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {modules.map((m) => (
          <li key={m.key} className="border-line bg-surface flex items-center gap-3 rounded-xl border p-3">
            <span className="text-brand bg-card border-line grid h-9 w-9 shrink-0 place-items-center rounded-lg border"><Icon name={MODULE_ICON[m.key] ?? "Layers"} size={16} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-ink text-[13.5px] font-bold">{m.label}</p>
              <p className="text-muted text-[12px] font-semibold tabular-nums">{m.total === null ? "לא זמין" : `${new Intl.NumberFormat("en-US").format(m.total)} פריטים`}</p>
            </div>
            <ModuleUsageBadge state={m.state} />
          </li>
        ))}
      </ul>
      <p className="text-muted mt-3 px-1 text-[11px]">מצב מבוסס על ספירת פריטים ופעילות ב-7 הימים האחרונים — ללא ציון אימוץ מלאכותי.</p>
    </PanelCard>
  );
}
