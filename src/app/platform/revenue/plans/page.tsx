// ZONO — Platform · Plans (P5.4 · SHADOW MODE). Read-only catalog of the four
// plan tiers with their entitlements, soft limits and the canonical access
// matrix. Source of truth = src/lib/launch/plans (pure). No billing (P5.5), no
// mutation. Requires platform.billing.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { PLANS, PLAN_ORDER, ENTITLEMENTS } from "@/lib/launch/plans";
import { buildAccessMatrix, PLAN_TIERS, FEATURE_CATALOG } from "@/lib/platform-admin/access/model";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, PlanBadge, PLAN_LABEL } from "@/components/platform-admin/ui";
import { AccessMatrixTable } from "@/components/platform-admin/access-ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

const LIMIT_LABEL: Record<string, string> = {
  seats: "מושבים", operatingAreas: "אזורי פעילות", monitoredListings: "נכסים במעקב",
  aiCallsPerMonth: "קריאות AI/חודש", syncsPerDay: "סנכרונים/יום",
};
const ENTITLEMENT_LABEL: Record<string, string> = Object.fromEntries(
  FEATURE_CATALOG.filter((f) => f.entitlement).map((f) => [f.entitlement as string, f.label]),
);

function fmtLimit(v: number): string { return v < 0 ? "∞" : v.toLocaleString("he-IL"); }

export default async function Page() {
  const operator = await authorizePlatform("platform.billing.read");
  if (!operator) return <PlatformDenied />;

  const matrix = buildAccessMatrix();
  const allEntitlements = Object.values(ENTITLEMENTS);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="הכנסות"
        title="תוכניות"
        description="קטלוג תוכניות המחיר, מכסות וזכאויות. מקור אמת יחיד לחישוב הגישה — לקריאה בלבד (חיוב יגיע ב-P5.5)."
        icon="Tag"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLAN_ORDER.map((tier) => {
          const p = PLANS[tier];
          return (
            <div key={tier} className={"border-line bg-card relative rounded-2xl border p-5 " + (p.highlight ? "ring-brand/40 ring-2" : "")}>
              {p.highlight && <span className="bg-brand absolute -top-2.5 start-4 rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white">מומלץ</span>}
              <div className="mb-1"><PlanBadge plan={tier} /></div>
              <div className="text-ink mt-3 text-2xl font-black">
                {p.priceHintIls === null ? "בהתאמה" : p.priceHintIls === 0 ? "חינם" : `₪${p.priceHintIls}`}
                {p.priceHintIls ? <span className="text-muted text-[12px] font-semibold"> /חודש</span> : null}
              </div>
              <dl className="mt-4 space-y-1.5">
                {Object.entries(p.limits).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-[12px]">
                    <dt className="text-muted">{LIMIT_LABEL[k] ?? k}</dt>
                    <dd className="text-ink font-bold tabular-nums">{fmtLimit(v as number)}</dd>
                  </div>
                ))}
              </dl>
              <div className="border-line mt-4 border-t pt-3">
                <div className="text-muted mb-2 text-[11px] font-bold">זכאויות ({p.features.length})</div>
                <ul className="space-y-1">
                  {allEntitlements.map((ent) => {
                    const has = p.features.includes(ent);
                    return (
                      <li key={ent} className={"flex items-center gap-1.5 text-[12px] " + (has ? "text-ink" : "text-muted/50")}>
                        <span className={has ? "text-success" : "text-muted/40"}><Icon name={has ? "Check" : "Minus"} size={13} /></span>
                        {ENTITLEMENT_LABEL[ent] ?? ent}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      <PanelCard title="מטריצת גישה — יכולות × תוכניות" icon="ShieldCheck">
        <AccessMatrixTable rows={matrix} tiers={PLAN_TIERS} />
        <p className="text-muted mt-3 px-1 text-[11px]">מחושב דטרמיניסטית מקטלוג התוכניות. {PLAN_LABEL[PLAN_TIERS[0]!]} → {PLAN_LABEL[PLAN_TIERS[PLAN_TIERS.length - 1]!]}.</p>
      </PanelCard>
    </div>
  );
}
