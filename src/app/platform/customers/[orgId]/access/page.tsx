// ZONO — Customer 360 · Access tab (P5.2). READ-ONLY plan / entitlement /
// feature-flag snapshot. PLAN, ENTITLEMENT and FEATURE FLAG are kept
// conceptually distinct. Plan tier: customers.read. Entitlements: entitlements.read.
// Flags: flags.read (each gated independently). NO mutation of any kind.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getOrgAccessForPlatform } from "@/lib/platform-admin/server/dal";
import { getOrgEffectiveAccess } from "@/lib/platform-admin/server/access";
import { RestrictedPanel } from "@/components/platform-admin/customer360-ui";
import { PanelCard, PlanBadge, formatPlatformDate } from "@/components/platform-admin/ui";
import { KV } from "@/components/platform-admin/customer360-ui";
import { EffectiveAccessList, DriftSummaryStrip, DriftList } from "@/components/platform-admin/access-ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

export default async function Customer360AccessPage({ params }: { params: Promise<{ orgId: string }> }) {
  const operator = await authorizePlatform("platform.customers.read");
  if (!operator) return <RestrictedPanel />;
  const { orgId } = await params;
  const [a, eff] = await Promise.all([getOrgAccessForPlatform(orgId), getOrgEffectiveAccess(orgId)]);
  const limitEntries = a.entitlements.limits ? Object.entries(a.entitlements.limits).slice(0, 12) : [];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* PLAN */}
      <PanelCard title="תוכנית (PLAN)" icon="Tag">
        <div className="px-1 py-1">
          <p className="text-muted mb-2 text-[12px] font-semibold">רמת התוכנית של הארגון</p>
          <PlanBadge plan={a.planTier} />
        </div>
      </PanelCard>

      {/* ENTITLEMENTS */}
      <PanelCard title="זכאויות (ENTITLEMENT)" icon="ShieldCheck">
        {a.entitlements.state === "restricted" ? (
          <p className="text-muted flex items-center gap-1.5 px-1 py-4 text-[13px] font-semibold"><Icon name="Lock" size={14} />מוגבל להרשאה</p>
        ) : a.entitlements.state === "unavailable" ? (
          <p className="text-muted px-1 py-4 text-[13px]">לא זמין</p>
        ) : !a.entitlements.plan && !a.entitlements.status && limitEntries.length === 0 ? (
          <p className="text-muted px-1 py-4 text-[13px]">אין נתוני זכאות</p>
        ) : (
          <dl className="px-1">
            <KV label="תוכנית מסחרית">{a.entitlements.plan || "—"}</KV>
            <KV label="סטטוס">{a.entitlements.status || "—"}</KV>
            <KV label="סיום ניסיון">{a.entitlements.trialEndsAt ? formatPlatformDate(a.entitlements.trialEndsAt) : "—"}</KV>
            {limitEntries.map(([k, v]) => (<KV key={k} label={k}>{String(v)}</KV>))}
          </dl>
        )}
      </PanelCard>

      {/* FEATURE FLAGS */}
      <PanelCard title="דגלי יכולות (FEATURE FLAG)" icon="Flag">
        {a.flags.state === "restricted" ? (
          <p className="text-muted flex items-center gap-1.5 px-1 py-4 text-[13px] font-semibold"><Icon name="Lock" size={14} />מוגבל להרשאה</p>
        ) : a.flags.state === "unavailable" ? (
          <p className="text-muted px-1 py-4 text-[13px]">לא זמין</p>
        ) : a.flags.items.length === 0 ? (
          <p className="text-muted px-1 py-4 text-[13px]">אין דגלים ייעודיים לארגון (חלים ברירות מחדל גלובליות)</p>
        ) : (
          <ul className="divide-line divide-y">
            {a.flags.items.map((f) => (
              <li key={f.flagKey} className="flex items-center gap-2 px-1 py-2">
                <span className={"h-2 w-2 rounded-full " + (f.enabled ? "bg-success" : "bg-muted")} />
                <span className="text-ink font-mono text-[12px]" dir="ltr">{f.flagKey}</span>
                <span className="text-muted ms-auto text-[11px]">{f.enabled ? "פעיל" : "כבוי"}{f.rolloutPct !== null && f.rolloutPct < 100 ? ` · ${f.rolloutPct}%` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      {/* EFFECTIVE ACCESS (P5.4 · resolver output) */}
      <div className="col-span-full">
        <PanelCard title="גישה אפקטיבית (מחושב · מצב צל)" icon="ShieldCheck">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
            <span className="text-muted text-[12px] font-semibold">מוכרע ע״י ה-resolver הקנוני: תוכנית {eff.planTier}{eff.overridesApplied ? " · כולל overrides" : " · ללא overrides (חסרה הרשאת דגלים)"}</span>
            <DriftSummaryStrip summary={eff.driftSummary} />
          </div>
          <EffectiveAccessList access={eff.access} />
        </PanelCard>
      </div>

      {/* DRIFT (P5.4 · shadow) */}
      {eff.driftSummary.critical + eff.driftSummary.warning + eff.driftSummary.info > 0 && (
        <div className="col-span-full">
          <PanelCard title="סטייה מהתנהגות נוכחית" icon="Activity">
            {eff.driftSummary.critical > 0 && (
              <div className="border-danger-soft bg-danger-soft/40 mb-3 flex items-start gap-2 rounded-xl border px-4 py-3">
                <span className="text-danger mt-0.5"><Icon name="AlertTriangle" size={15} /></span>
                <span className="text-ink text-[12px] font-semibold">אכיפה תסיר {eff.driftSummary.critical} יכולות שבשימוש כיום — יש לשדרג תוכנית או להוסיף override לפני מעבר לאכיפה.</span>
              </div>
            )}
            <DriftList drift={eff.drift} />
          </PanelCard>
        </div>
      )}

      <div className="border-line bg-surface col-span-full flex items-center gap-2 rounded-xl border px-4 py-3">
        <span className="text-muted"><Icon name="Lock" size={14} /></span>
        <span className="text-muted text-[12px] font-semibold">תצוגה לקריאה בלבד · מצב צל (SHADOW) — המערכת מחשבת ומדווחת גישה אך אינה אוכפת. שינוי תוכנית/זכאויות/דגלים אינו זמין.</span>
      </div>
    </div>
  );
}
