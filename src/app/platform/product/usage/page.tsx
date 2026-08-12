// ZONO — Platform · Product Usage (P6.0). Now backed by the CANONICAL telemetry
// source (domain_events) via the shared telemetry read layer — the same source
// that powers Customer 360 usage and Owner Intelligence activity. DAU/WAU/MAU,
// active organizations, and module event volume come from real product events;
// module ADOPTION (has-ever-used) is still derived from authoritative product
// tables and is labelled as such. Every metric states its source. No fabricated
// usage, no backfilled history. Cap: platform.usage.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getFeatureAdoption } from "@/lib/platform-admin/server/intel";
import { getPlatformOverviewMetrics } from "@/lib/platform-admin/server/dal";
import { getUsageTelemetry } from "@/lib/telemetry/server/telemetry";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, UsageTile } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

// Telemetry counts are authoritative (real product events) → state "ok".
const okMetric = (n: number) => ({ value: n, state: "ok" as const });

export default async function Page() {
  const operator = await authorizePlatform("platform.usage.read");
  if (!operator) return <PlatformDenied />;
  const [telemetry, adoption, metrics] = await Promise.all([
    getUsageTelemetry(), getFeatureAdoption(), getPlatformOverviewMetrics(),
  ]);
  const c = telemetry.counts;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="מוצר" title="שימוש במוצר" description="פעילות מוצר אמיתית מטלמטריה קנונית (domain_events) — משתמשים פעילים, אימוץ מודולים ונפח אירועים. ללא נתונים מפוברקים." icon="Activity" />

      {/* ── Canonical telemetry: DAU/WAU/MAU + active orgs ── */}
      <PanelCard title="משתמשים וארגונים פעילים" icon="Activity">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <UsageTile icon="Users" label="DAU (יומי)" metric={okMetric(c.dau)} />
          <UsageTile icon="Users" label="WAU (שבועי)" metric={okMetric(c.wau)} />
          <UsageTile icon="Users" label="MAU (חודשי)" metric={okMetric(c.mau)} />
          <UsageTile icon="Building2" label="ארגונים פעילים (7ד')" metric={okMetric(c.activeOrgsWeek)} />
          <UsageTile icon="Activity" label="אירועים 24ש'" metric={okMetric(c.events24h)} />
          <UsageTile icon="Activity" label="אירועים 7ד'" metric={okMetric(c.events7d)} />
        </div>
        <p className="text-muted mt-3 px-1 text-[11px]" dir="ltr">מקור: {telemetry.source}</p>
        {!telemetry.hasData ? (
          <div className="border-warning-soft bg-warning-soft/40 mt-3 flex items-center gap-2 rounded-lg border px-3 py-2">
            <span className="text-warning"><Icon name="AlertCircle" size={13} /></span>
            <span className="text-ink text-[12px] font-semibold">אין עדיין אירועי טלמטריה בחלון — הטלמטריה מתמלאת מרגע הפריסה; אין השלמת היסטוריה מלאכותית.</span>
          </div>
        ) : (
          <p className="text-muted mt-1 px-1 text-[11px]">חלון קריאה: {telemetry.windowRows} אירועים · DAU/WAU/MAU נספרים לפי משתמש מייחס ייחודי; פעילות פלטפורמה אינה נכללת (טבלה נפרדת).</p>
        )}
      </PanelCard>

      {/* ── Module event volume (from telemetry) ── */}
      <PanelCard title="נפח אירועים לפי מודול" icon="Layers">
        {telemetry.modules.length === 0 ? (
          <p className="text-muted px-1 py-3 text-[13px]">אין אירועי מודול בחלון 30 הימים.</p>
        ) : (
          <div className="border-line overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[420px] border-collapse text-[13px]">
              <thead>
                <tr className="border-line bg-surface border-b text-[12px]">
                  {["מודול", "אירועים 7ד'", "אירועים 30ד'"].map((h) => <th key={h} className="text-muted px-3 py-2.5 text-start font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {telemetry.modules.map((m) => (
                  <tr key={m.key} className="border-line border-b last:border-0">
                    <td className="text-ink px-3 py-2.5 font-semibold">{m.label}</td>
                    <td className="text-ink px-3 py-2.5 tabular-nums">{m.events7d}</td>
                    <td className="text-muted px-3 py-2.5 tabular-nums">{m.events30d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>

      {/* ── Module adoption (presence-based, clearly labelled) ── */}
      <PanelCard title="אימוץ מודולים (נוכחות נתונים)" icon="Layers">
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

      {/* ── Core cross-org usage tiles ── */}
      <PanelCard title="ליבת שימוש (חוצה-ארגונים)" icon="Megaphone">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <UsageTile icon="Megaphone" label="קמפייני הפצה" metric={metrics.campaigns} />
          <UsageTile icon="Globe" label="פרסומי פייסבוק" metric={metrics.facebookPublishes} />
          <UsageTile icon="MessageCircle" label="הודעות וואטסאפ" metric={metrics.whatsappMessages} />
        </div>
      </PanelCard>

      <div className="border-line bg-surface flex items-center gap-2 rounded-xl border px-4 py-3">
        <span className="text-muted"><Icon name="AlertCircle" size={14} /></span>
        <span className="text-muted text-[12px] font-semibold">טלמטריה קנונית מ-domain_events מזינה גם את לקוח 360 ומודיעין בעלים — הגדרה אחת, ללא שלוש הגדרות מתחרות. אימוץ מבוסס-נוכחות מסומן בנפרד. שימוש עדכני מתמלא מרגע האינסטרומנטציה.</span>
      </div>
    </div>
  );
}
