// ZONO — Platform · Subscriptions (P5.5). Read-only table of subscriptions with
// resolved billing state, plan-compat, period/trial/grace/cancel + links to
// Effective Access (P5.4) and Customer 360. Filters via query params. No N+1
// (server batches org names + latest payment). Cap billing.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { listPlatformSubscriptions } from "@/lib/platform-admin/server/billing";
import type { SubscriptionFilters } from "@/lib/platform-admin/server/billing";
import type { BillingState } from "@/lib/platform-admin/billing/model";
import type { PlanTier } from "@/lib/launch/types";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, PlanBadge, formatPlatformDate } from "@/components/platform-admin/ui";
import { BillingStateChip, PlanCompatNote, BillingShadowBanner } from "@/components/platform-admin/billing-ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATE_FILTERS: { key: BillingState | "all"; label: string }[] = [
  { key: "all", label: "הכל" }, { key: "HEALTHY", label: "פעילים" }, { key: "TRIAL", label: "ניסיון" },
  { key: "PAYMENT_FAILED", label: "כשל תשלום" }, { key: "GRACE", label: "תקופת חסד" },
  { key: "CANCEL_PENDING", label: "ביטול בהמתנה" }, { key: "CANCELLED", label: "מבוטלים" },
];
const PLAN_FILTERS: (PlanTier | "all")[] = ["all", "starter", "professional", "office", "enterprise"];

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; plan?: string }> }) {
  const operator = await authorizePlatform("platform.billing.read");
  if (!operator) return <PlatformDenied />;
  const sp = await searchParams;

  const statusF = (sp.status && sp.status !== "all") ? (sp.status as BillingState) : null;
  const planF = (sp.plan && sp.plan !== "all") ? (sp.plan as PlanTier) : null;
  const filters: SubscriptionFilters = { status: statusF, plan: planF };
  const rows = await listPlatformSubscriptions(filters);

  const qs = (patch: Record<string, string>) => {
    const merged = { status: sp.status ?? "all", plan: sp.plan ?? "all", ...patch };
    const p = new URLSearchParams();
    if (merged.status && merged.status !== "all") p.set("status", merged.status);
    if (merged.plan && merged.plan !== "all") p.set("plan", merged.plan);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="הכנסות" title="מנויים" description="כל המנויים עם מצב החיוב המחושב וקישורים לגישה אפקטיבית וללקוח." icon="BadgeCheck" />
      <BillingShadowBanner />

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {STATE_FILTERS.map((f) => {
            const active = (sp.status ?? "all") === f.key;
            return <Link key={f.key} href={qs({ status: f.key })} className={"rounded-lg px-3 py-1.5 text-[12px] font-bold " + (active ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink")}>{f.label}</Link>;
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PLAN_FILTERS.map((p) => {
            const active = (sp.plan ?? "all") === p;
            return <Link key={p} href={qs({ plan: p })} className={"rounded-lg px-3 py-1 text-[11px] font-semibold " + (active ? "bg-brand-soft text-brand" : "bg-surface text-muted hover:text-ink")}>{p === "all" ? "כל התוכניות" : p}</Link>;
          })}
        </div>
      </div>

      <PanelCard title={`מנויים (${rows.length})`} icon="BadgeCheck">
        {rows.length === 0 ? (
          <p className="text-muted px-1 py-6 text-center text-[13px]">אין מנויים התואמים לסינון. המשפך המסחרי טרם הופעל בפרודקשן (0 מנויים).</p>
        ) : (
          <div className="border-line overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[820px] border-collapse text-[13px]">
              <thead>
                <tr className="border-line bg-surface border-b text-[12px]">
                  {["ארגון", "תוכנית", "מצב", "ספק", "תקופה", "ניסיון/חסד", "תשלום אחרון", "קישורים"].map((h) => <th key={h} className="text-muted px-3 py-2.5 text-start font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.orgId} className="border-line border-b last:border-0">
                    <td className="text-ink px-3 py-2.5 font-semibold">{r.orgName ?? r.orgId.slice(0, 8)}</td>
                    <td className="px-3 py-2.5"><div className="flex items-center gap-1.5"><PlanBadge plan={r.plan} /><PlanCompatNote compat={r.planCompat} /></div></td>
                    <td className="px-3 py-2.5"><BillingStateChip state={r.billingState} /></td>
                    <td className="text-muted px-3 py-2.5">{r.provider ?? "—"}</td>
                    <td className="text-muted px-3 py-2.5 text-[12px]">{r.periodStart ? formatPlatformDate(r.periodStart) : "—"}{r.periodEnd ? ` → ${formatPlatformDate(r.periodEnd)}` : ""}</td>
                    <td className="text-muted px-3 py-2.5 text-[12px]">{r.trialEndsAt ? `ניסיון עד ${formatPlatformDate(r.trialEndsAt)}` : r.graceUntil ? `חסד עד ${formatPlatformDate(r.graceUntil)}` : "—"}</td>
                    <td className="text-muted px-3 py-2.5 text-[12px]">{r.lastPaymentAt ? `${formatPlatformDate(r.lastPaymentAt)}${r.lastPaymentVerified ? " ✓" : ""}` : "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-2 text-[11px] font-bold">
                        <Link href={`/platform/customers/${r.orgId}/billing`} className="text-brand">חיוב</Link>
                        <Link href={`/platform/customers/${r.orgId}/access`} className="text-brand">גישה</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>
    </div>
  );
}
