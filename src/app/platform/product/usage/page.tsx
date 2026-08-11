// ZONO — Platform · Product Usage (P5.11). Cross-org adoption + core usage from
// AUTHORITATIVE product tables (P5.10). Telemetry table usage_events is empty, so
// adoption is derived from data presence and that is stated honestly. No
// fabricated usage. Cap: platform.usage.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getFeatureAdoption } from "@/lib/platform-admin/server/intel";
import { getPlatformOverviewMetrics } from "@/lib/platform-admin/server/dal";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, UsageTile } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.usage.read");
  if (!operator) return <PlatformDenied />;
  const [adoption, metrics] = await Promise.all([getFeatureAdoption(), getPlatformOverviewMetrics()]);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="מוצר" title="שימוש במוצר" description="אימוץ מודולים וליבת שימוש חוצה-ארגונים — נגזר מנתוני מוצר אמיתיים. ללא נתוני שימוש מפוברקים." icon="Activity" />

      <PanelCard title="אימוץ מודולים" icon="Activity">
        <div className="border-line overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="border-line bg-surface border-b text-[12px]">
                {["מודול", "ארגונים משתמשים", "לא משתמשים", "אימוץ", "מקור"].map((h) => <th key={h} className="text-muted px-3 py-2.5 text-start font-bold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {adoption.rows.map((r) => {
                const notUsing = Math.max(0, r.totalOrgs - r.orgsUsing);
                const pct = r.totalOrgs > 0 ? Math.round((r.orgsUsing / r.totalOrgs) * 100) : 0;
                return (
                  <tr key={r.key} className="border-line border-b last:border-0">
                    <td className="text-ink px-3 py-2.5 font-semibold">{r.label}</td>
                    <td className="text-ink px-3 py-2.5 tabular-nums">{r.orgsUsing}/{r.totalOrgs}</td>
                    <td className="text-muted px-3 py-2.5 tabular-nums">{notUsing}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="bg-surface h-2 w-24 overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full" style={{ width: `${pct}%` }} /></div>
                        <span className="text-muted text-[12px] tabular-nums">{pct}%</span>
                      </div>
                    </td>
                    <td className="text-muted px-3 py-2.5 text-[11px]" dir="ltr">{r.source}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PanelCard>

      <PanelCard title="ליבת שימוש (חוצה-ארגונים)" icon="Megaphone">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <UsageTile icon="Megaphone" label="קמפייני הפצה" metric={metrics.campaigns} />
          <UsageTile icon="Globe" label="פרסומי פייסבוק" metric={metrics.facebookPublishes} />
          <UsageTile icon="MessageCircle" label="הודעות וואטסאפ" metric={metrics.whatsappMessages} />
        </div>
      </PanelCard>

      <div className="border-line bg-surface flex items-center gap-2 rounded-xl border px-4 py-3">
        <span className="text-muted"><Icon name="AlertCircle" size={14} /></span>
        <span className="text-muted text-[12px] font-semibold">טלמטריית שימוש (usage_events) אינה מאוכלסת — אימוץ נגזר מנוכחות נתוני מוצר אמיתיים. שימוש עדכני מפורט יידרש הפעלת טלמטריה.</span>
      </div>
    </div>
  );
}
