// ZONO — Platform · Feature Flags (P5.4 · SHADOW MODE). Read-only inventory of
// the OVERRIDE inputs the access resolver consults: global flags + org-scoped
// flags (org-scoped wins over global). Precedence is explained inline. No
// enforcement, no mutation. Requires platform.flags.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { listPlatformFeatureFlags } from "@/lib/platform-admin/server/access";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

function FlagRows({ rows }: { rows: { flagKey: string; enabled: boolean; rolloutPct: number | null; orgId: string | null; minRole: string | null }[] }) {
  return (
    <ul className="divide-line divide-y">
      {rows.map((f, i) => (
        <li key={`${f.flagKey}-${f.orgId ?? "g"}-${i}`} className="flex items-center gap-2 px-1 py-2.5">
          <span className={"h-2 w-2 shrink-0 rounded-full " + (f.enabled ? "bg-success" : "bg-muted/40")} />
          <span className="text-ink font-mono text-[12px]" dir="ltr">{f.flagKey}</span>
          {f.orgId && <span className="text-muted font-mono text-[10px]" dir="ltr">org:{f.orgId.slice(0, 8)}</span>}
          {f.minRole && <span className="bg-surface text-muted rounded px-1.5 py-0.5 text-[10px] font-semibold">≥ {f.minRole}</span>}
          <span className="text-muted ms-auto text-[11px]">{f.enabled ? "פעיל" : "כבוי"}{f.rolloutPct !== null && f.rolloutPct < 100 ? ` · ${f.rolloutPct}%` : ""}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function Page() {
  const operator = await authorizePlatform("platform.flags.read");
  if (!operator) return <PlatformDenied />;

  const view = await listPlatformFeatureFlags();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="מוצר"
        title="דגלי יכולות"
        description="מלאי דגלי הפיצ'רים — קלט ה-override שה-resolver מתחשב בו. דגל ברמת ארגון גובר על דגל גלובלי."
        icon="Flag"
      />

      <div className="border-warning-soft bg-warning-soft/40 flex items-start gap-2 rounded-xl border px-4 py-3">
        <span className="text-warning mt-0.5"><Icon name="AlertCircle" size={15} /></span>
        <span className="text-ink text-[12px] font-semibold">סדר עדימות הגישה: בסיס ← זכאות תוכנית ← override ארגוני ← דגל גלובלי. מצב צל — הדגלים מחושבים אך אינם אוכפים.</span>
      </div>

      {!view.available ? (
        <PanelCard title="דגלים" icon="Flag">
          <p className="text-muted px-1 py-4 text-[13px]">טבלת הדגלים אינה זמינה כרגע.</p>
        </PanelCard>
      ) : (
        <>
          <PanelCard title={`דגלים גלובליים (${view.globals.length})`} icon="Flag">
            {view.globals.length === 0
              ? <p className="text-muted px-1 py-4 text-[13px]">אין דגלים גלובליים מוגדרים — הגישה נקבעת ע״י תוכנית בלבד.</p>
              : <FlagRows rows={view.globals} />}
          </PanelCard>
          <PanelCard title={`דגלים ברמת ארגון (${view.orgScoped.length})`} icon="Building2">
            {view.orgScoped.length === 0
              ? <p className="text-muted px-1 py-4 text-[13px]">אין דגלים ייעודיים לארגון — לא קיימים overrides ארגוניים.</p>
              : <FlagRows rows={view.orgScoped} />}
          </PanelCard>
        </>
      )}
    </div>
  );
}
