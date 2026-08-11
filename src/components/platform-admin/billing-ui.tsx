// ============================================================================
// ZONO — PLATFORM BILLING presentational UI (P5.5). Pure/client-safe. Renders
// the honest billing DTOs: money values carry availability (never a fake 0),
// billing states are colored chips, provider status is shown truthfully. NO
// server imports, NO event handlers, NO mutation controls (P5.5 is read-only).
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";
import type { AvailableValue, BillingState, ProviderStatus, ProviderClass, PlanCompat } from "@/lib/platform-admin/billing/model";
import { BILLING_STATE_LABEL } from "@/lib/platform-admin/billing/model";

/** ₪ formatter (ILS, no fractional agorot for whole sums). */
export function formatIls(n: number | null, currency: string | null = "ILS"): string {
  if (n === null || Number.isNaN(n)) return "—";
  const sym = (currency ?? "ILS") === "ILS" ? "₪" : `${currency} `;
  return `${sym}${new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 }).format(n)}`;
}

/** Money value honoring availability — an UNAVAILABLE metric shows a labeled
 *  "לא זמין" with its reason, NEVER a fabricated 0. */
export function MoneyValue({ v, className }: { v: AvailableValue<number>; className?: string }) {
  if (v.available) return <span className={className}>{formatIls(v.value)}</span>;
  return <span className={"text-muted inline-flex items-center gap-1 " + (className ?? "")} title={v.reason}><Icon name="Minus" size={13} />לא זמין</span>;
}

/** Count value honoring availability. */
export function CountValue({ v, className }: { v: AvailableValue<number>; className?: string }) {
  if (v.available) return <span className={className}>{new Intl.NumberFormat("he-IL").format(v.value)}</span>;
  return <span className={"text-muted " + (className ?? "")} title={v.reason}>—</span>;
}

const STATE_TONE: Record<BillingState, string> = {
  HEALTHY: "bg-success-soft text-success",
  TRIAL: "bg-info-soft text-info",
  PENDING_PAYMENT: "bg-surface text-muted",
  PAYMENT_FAILED: "bg-danger-soft text-danger",
  GRACE: "bg-warning-soft text-warning",
  CANCEL_PENDING: "bg-warning-soft text-warning",
  CANCELLED: "bg-surface text-muted",
  UNKNOWN: "bg-surface text-muted",
};

export function BillingStateChip({ state, className }: { state: BillingState; className?: string }) {
  return <span className={"inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold " + STATE_TONE[state] + " " + (className ?? "")}>{BILLING_STATE_LABEL[state]}</span>;
}

/** KPI card that respects availability + shows the metric's source line. */
export function BillingKpiCard({ icon, label, value, money = false, tone = "brand" }: {
  icon: string; label: string; value: AvailableValue<number>; money?: boolean;
  tone?: "brand" | "success" | "warning" | "neutral";
}) {
  const toneCls: Record<string, string> = {
    brand: "text-brand bg-brand-soft", success: "text-success bg-success-soft",
    warning: "text-warning bg-warning-soft", neutral: "text-muted bg-surface",
  };
  return (
    <div className="border-line bg-card rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <span className={"grid h-9 w-9 place-items-center rounded-xl " + toneCls[tone]}><Icon name={icon} size={17} /></span>
      </div>
      <p className="text-ink mt-3 text-3xl font-black leading-none tabular-nums">
        {money ? <MoneyValue v={value} /> : <CountValue v={value} />}
      </p>
      <p className="text-muted mt-1.5 text-[13px] font-semibold">{label}</p>
      <p className="text-muted/70 mt-0.5 truncate text-[11px]" title={value.available ? value.source : value.reason}>
        {value.available ? `מקור: ${value.source}` : value.reason}
      </p>
    </div>
  );
}

const PROVIDER_TONE: Record<ProviderClass, string> = {
  LIVE: "bg-success-soft text-success", PARTIAL: "bg-warning-soft text-warning",
  SIMULATED: "bg-info-soft text-info", MISSING: "bg-danger-soft text-danger",
};
const PROVIDER_LABEL: Record<ProviderClass, string> = { LIVE: "חי", PARTIAL: "חלקי", SIMULATED: "סימולציה", MISSING: "חסר" };

export function ProviderStatusCard({ provider }: { provider: ProviderStatus }) {
  return (
    <div className="border-line bg-card rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <span className="text-ink inline-flex items-center gap-2 text-sm font-extrabold"><span className="text-brand"><Icon name="Wallet" size={16} /></span>ספק תשלומים · Grow</span>
        <span className={"rounded-md px-2 py-0.5 text-[11px] font-bold " + PROVIDER_TONE[provider.classification]}>{PROVIDER_LABEL[provider.classification]}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className={"rounded-md px-2 py-0.5 text-[11px] font-semibold " + (provider.checkoutConfigured ? "bg-success-soft text-success" : "bg-surface text-muted")}>CHECKOUT_URL {provider.checkoutConfigured ? "מוגדר" : "חסר"}</span>
        <span className={"rounded-md px-2 py-0.5 text-[11px] font-semibold " + (provider.webhookSecretConfigured ? "bg-success-soft text-success" : "bg-surface text-muted")}>WEBHOOK_SECRET {provider.webhookSecretConfigured ? "מוגדר" : "חסר"}</span>
      </div>
      <ul className="mt-3 space-y-1">
        {provider.notes.map((n, i) => (
          <li key={i} className="text-muted flex items-start gap-1.5 text-[12px]"><span className="text-muted/50 mt-0.5">•</span>{n}</li>
        ))}
      </ul>
    </div>
  );
}

/** Compatibility warning chip when plan vocabularies conflict across sources. */
export function PlanCompatNote({ compat }: { compat: PlanCompat }) {
  if (!compat.conflict) return null;
  return (
    <span className="bg-warning-soft text-warning inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold" title={`מנוי: ${compat.raw.subscription ?? "—"} · רישיון: ${compat.raw.orgPlan ?? "—"} · ארגון: ${compat.raw.organization ?? "—"}`}>
      <Icon name="AlertTriangle" size={12} />אי-התאמת תוכנית
    </span>
  );
}

/** Read-only / shadow-mode banner reused across billing screens. */
export function BillingShadowBanner() {
  return (
    <div className="border-line bg-surface flex items-center gap-2 rounded-xl border px-4 py-3">
      <span className="text-muted"><Icon name="Lock" size={14} /></span>
      <span className="text-muted text-[12px] font-semibold">תצוגה לקריאה בלבד. סטטוס חיוב מופרד מגישת מוצר — מצב הצל של P5.4 נשאר סמכותי; חיוב אינו חוסם גישה ב-P5.5.</span>
    </div>
  );
}
