// ZONO — Platform · System Health (P5.6). Aggregates trustworthy signals: DB
// reachability, queue health, dead-letter, extension, integrations (if cap), and
// critical-env PRESENCE (configured/missing only — never values). Cron section
// shows CONFIGURED schedules from vercel.json — run history is NOT tracked, so
// no fabricated "last success". Cap: platform.ops.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getPlatformSystemHealth } from "@/lib/platform-admin/server/ops";
import { CRON_SCHEDULES } from "@/lib/platform-admin/ops/model";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, formatPlatformDateTime } from "@/components/platform-admin/ui";
import { StatusBanner, SeverityChip, SeverityDot } from "@/components/platform-admin/ops-ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.ops.read");
  if (!operator) return <PlatformDenied />;
  const h = await getPlatformSystemHealth();

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="תפעול" title="בריאות מערכת" description="איגוד אותות אמינים. בדיקות סביבה מציגות מוגדר/חסר בלבד — לעולם לא ערכי סוד." icon="Activity" />
      <StatusBanner severity={h.severity} title="בריאות פלטפורמה" />

      <PanelCard title="רכיבים" icon="Activity">
        <ul className="divide-line divide-y">
          {h.components.map((c) => (
            <li key={c.key} className="flex items-center gap-3 px-1 py-2.5">
              <SeverityDot severity={c.severity} />
              <div className="min-w-0 flex-1">
                <div className="text-ink text-[13px] font-semibold">{c.label}</div>
                <div className="text-muted text-[12px]">{c.detail}</div>
              </div>
              <SeverityChip severity={c.severity} />
            </li>
          ))}
        </ul>
      </PanelCard>

      <PanelCard title="הגדרות סביבה קריטיות" icon="ShieldCheck">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {h.env.map((e) => (
            <div key={e.key} className="border-line bg-surface flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-muted font-mono text-[11px]" dir="ltr">{e.key}</span>
              <span className={"rounded-md px-2 py-0.5 text-[11px] font-bold " + (e.configured ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{e.configured ? "מוגדר" : "חסר"}</span>
            </div>
          ))}
        </div>
        <p className="text-muted mt-3 px-1 text-[11px]">נבדקת נוכחות בלבד — ערכי הסוד עצמם לעולם אינם נקראים או מוצגים.</p>
      </PanelCard>

      <PanelCard title={`תזמוני Cron (${CRON_SCHEDULES.length})`} icon="Clock">
        <div className="border-danger-soft/50 bg-warning-soft/30 mb-3 flex items-start gap-2 rounded-xl border border-line px-4 py-3">
          <span className="text-warning mt-0.5"><Icon name="AlertCircle" size={14} /></span>
          <span className="text-ink text-[12px] font-semibold">אין טבלת היסטוריית ריצות cron — מוצגים התזמונים המוגדרים בלבד (vercel.json), ללא ״הצלחה אחרונה״ מפוברקת. מודל cron_runs אדיטיבי מוצע בדוח (טרם יושם).</span>
        </div>
        <div className="border-line overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[520px] border-collapse text-[13px]">
            <thead>
              <tr className="border-line bg-surface border-b text-[12px]">
                {["תת-מערכת", "נתיב", "תדירות"].map((th) => <th key={th} className="text-muted px-3 py-2 text-start font-bold">{th}</th>)}
              </tr>
            </thead>
            <tbody>
              {CRON_SCHEDULES.map((c) => (
                <tr key={c.path} className="border-line border-b last:border-0">
                  <td className="text-ink px-3 py-2 font-semibold">{c.subsystem}</td>
                  <td className="text-muted px-3 py-2 font-mono text-[11px]" dir="ltr">{c.path}</td>
                  <td className="text-muted px-3 py-2 text-[12px]">{c.cadence} <span className="text-muted/60 font-mono text-[10px]" dir="ltr">{c.schedule}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>

      <p className="text-muted px-1 text-[11px]">עודכן: {formatPlatformDateTime(h.generatedAt)}</p>
    </div>
  );
}
