// ZONO — Platform · Payments (P5.5). Read-only table of payments with SAFE
// fields only — NEVER signature, raw payload, provider secret, or card data.
// Filters: status / verified / date range / organization. Cap billing.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { listPlatformPayments } from "@/lib/platform-admin/server/billing";
import type { PaymentFilters } from "@/lib/platform-admin/server/billing";
import type { PaymentStatus } from "@/lib/commercial/types";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, PlanBadge, formatPlatformDateTime } from "@/components/platform-admin/ui";
import { formatIls, BillingShadowBanner } from "@/components/platform-admin/billing-ui";
import { Icon } from "@/components/dashboard/Icon";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_FILTERS: { key: PaymentStatus | "all"; label: string }[] = [
  { key: "all", label: "הכל" }, { key: "paid", label: "שולם" }, { key: "failed", label: "נכשל" },
  { key: "pending", label: "ממתין" }, { key: "processing", label: "בעיבוד" }, { key: "cancelled", label: "בוטל" },
];
const VERIFIED_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "הכל" }, { key: "true", label: "מאומת" }, { key: "false", label: "לא מאומת" },
];
const PAY_STATUS_LABEL: Record<string, string> = { paid: "שולם", failed: "נכשל", pending: "ממתין", processing: "בעיבוד", cancelled: "בוטל", expired: "פג" };
const PAY_STATUS_TONE: Record<string, string> = { paid: "bg-success-soft text-success", failed: "bg-danger-soft text-danger", pending: "bg-surface text-muted", processing: "bg-info-soft text-info", cancelled: "bg-surface text-muted", expired: "bg-surface text-muted" };

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; verified?: string; since?: string; until?: string }> }) {
  const operator = await authorizePlatform("platform.billing.read");
  if (!operator) return <PlatformDenied />;
  const sp = await searchParams;

  const filters: PaymentFilters = {
    status: (sp.status && sp.status !== "all") ? (sp.status as PaymentStatus) : null,
    verified: sp.verified === "true" ? true : sp.verified === "false" ? false : null,
    since: sp.since || null,
    until: sp.until || null,
    limit: 500,
  };
  const rows = await listPlatformPayments(filters);

  const qs = (patch: Record<string, string>) => {
    const merged: Record<string, string> = { status: sp.status ?? "all", verified: sp.verified ?? "all", ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v && v !== "all") p.set(k, v);
    if (sp.since) p.set("since", sp.since); if (sp.until) p.set("until", sp.until);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="הכנסות" title="תשלומים" description="תנועות תשלום — שדות בטוחים בלבד. חתימות ומטענים גולמיים לעולם אינם נחשפים." icon="Wallet" />
      <BillingShadowBanner />

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => {
            const active = (sp.status ?? "all") === f.key;
            return <Link key={f.key} href={qs({ status: f.key })} className={"rounded-lg px-3 py-1.5 text-[12px] font-bold " + (active ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink")}>{f.label}</Link>;
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {VERIFIED_FILTERS.map((f) => {
            const active = (sp.verified ?? "all") === f.key;
            return <Link key={f.key} href={qs({ verified: f.key })} className={"rounded-lg px-3 py-1 text-[11px] font-semibold " + (active ? "bg-brand-soft text-brand" : "bg-surface text-muted hover:text-ink")}>{f.label}</Link>;
          })}
        </div>
      </div>

      <PanelCard title={`תשלומים (${rows.length})`} icon="Wallet">
        {rows.length === 0 ? (
          <p className="text-muted px-1 py-6 text-center text-[13px]">אין תשלומים התואמים לסינון. טרם נרשמו תשלומים בפרודקשן (0 תנועות).</p>
        ) : (
          <div className="border-line overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[760px] border-collapse text-[13px]">
              <thead>
                <tr className="border-line bg-surface border-b text-[12px]">
                  {["ארגון", "סכום", "תוכנית", "מצב", "מאומת", "ספק", "תאריך"].map((h) => <th key={h} className="text-muted px-3 py-2.5 text-start font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-line border-b last:border-0">
                    <td className="text-ink px-3 py-2.5 font-semibold">{r.orgId ? <Link href={`/platform/customers/${r.orgId}/billing`} className="hover:text-brand">{r.orgName ?? r.orgId.slice(0, 8)}</Link> : "—"}</td>
                    <td className="text-ink px-3 py-2.5 font-black tabular-nums">{formatIls(r.amountIls, r.currency)}</td>
                    <td className="px-3 py-2.5"><PlanBadge plan={r.planTier} /></td>
                    <td className="px-3 py-2.5"><span className={"rounded-md px-2 py-0.5 text-[11px] font-bold " + (PAY_STATUS_TONE[r.status] ?? "bg-surface text-muted")}>{PAY_STATUS_LABEL[r.status] ?? r.status}</span></td>
                    <td className="px-3 py-2.5">{r.verified ? <span className="text-success inline-flex items-center gap-1 text-[12px] font-bold"><Icon name="BadgeCheck" size={13} />כן</span> : <span className="text-muted text-[12px]">לא</span>}</td>
                    <td className="text-muted px-3 py-2.5">{r.provider}</td>
                    <td className="text-muted px-3 py-2.5 text-[12px]">{formatPlatformDateTime(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-muted mt-3 px-1 text-[11px]">מוצגים עד 500 תשלומים אחרונים. שדות חשופים: ארגון, סכום, מטבע, מצב, אימות, ספק, תאריך, תוכנית בלבד.</p>
      </PanelCard>
    </div>
  );
}
