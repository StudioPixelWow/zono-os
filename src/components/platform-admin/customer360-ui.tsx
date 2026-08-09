// ============================================================================
// ZONO — Customer 360 shared UI primitives (P5.2). PURE / server-renderable.
// Deterministic, explainable status — NO scoring model, NO fabricated numbers.
// Health/status tones are computed by the pure helpers here from real metrics.
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import type { PlatformMetric, IntegrationState, ModuleUsageState } from "@/lib/platform-admin/server/dal";
import { MetricValue } from "./ui";

export type HealthTone = "ok" | "warn" | "critical" | "neutral";
export interface HealthStatus { tone: HealthTone; label: string }

const TONE_CLS: Record<HealthTone, string> = {
  ok: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning",
  critical: "bg-danger-soft text-danger",
  neutral: "bg-surface text-muted",
};
const TONE_DOT: Record<HealthTone, string> = { ok: "bg-success", warn: "bg-warning", critical: "bg-danger", neutral: "bg-muted" };

// ── Deterministic health derivations (documented rules) ─────────────────────
/** Distribution: >0 failed posts → warn ("N פרסומים שנכשלו"); 0 → ok; restricted/unavailable → neutral. */
export function distributionHealth(failedPosts: PlatformMetric): HealthStatus {
  if (failedPosts.state !== "ok" || failedPosts.value === null) return { tone: "neutral", label: "—" };
  if (failedPosts.value > 0) return { tone: "warn", label: `${failedPosts.value} פרסומים שנכשלו` };
  return { tone: "ok", label: "תקין" };
}
/** Queues: dead-letters>0 → critical; else failed jobs>0 → warn; else ok; unknown → neutral. */
export function queueHealth(failedJobs: PlatformMetric, deadLetters: PlatformMetric): HealthStatus {
  if (deadLetters.state === "ok" && (deadLetters.value ?? 0) > 0) return { tone: "critical", label: `${deadLetters.value} dead-letter` };
  if (failedJobs.state === "ok" && (failedJobs.value ?? 0) > 0) return { tone: "warn", label: `${failedJobs.value} עבודות נכשלו` };
  if (failedJobs.state !== "ok" && deadLetters.state !== "ok") return { tone: "neutral", label: "—" };
  return { tone: "ok", label: "תקין" };
}
/** Usage: recent (7d) activity>0 → ok; 0 → warn ("אין פעילות ב-7 ימים"); unknown → neutral. */
export function usageHealth(recentActivity: PlatformMetric): HealthStatus {
  if (recentActivity.state !== "ok" || recentActivity.value === null) return { tone: "neutral", label: "—" };
  if (recentActivity.value > 0) return { tone: "ok", label: "פעילות ב-7 הימים האחרונים" };
  return { tone: "warn", label: "אין פעילות ב-7 ימים" };
}
/** Integrations: any warning/disconnected → warn; any connected & none bad → ok; all unconfigured/unknown → neutral. */
export function integrationsHealth(items: { state: IntegrationState }[]): HealthStatus {
  if (items.some((i) => i.state === "disconnected")) return { tone: "warn", label: "אינטגרציה מנותקת" };
  if (items.some((i) => i.state === "warning")) return { tone: "warn", label: "דורש תשומת לב" };
  if (items.some((i) => i.state === "connected")) return { tone: "ok", label: "תקין" };
  return { tone: "neutral", label: "לא מוגדר" };
}

export function HealthChip({ label, status, tone }: { label: string; status: string; tone: HealthTone }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2", TONE_CLS[tone])}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone])} />
      <div className="min-w-0 leading-tight">
        <p className="text-[10.5px] font-bold opacity-80">{label}</p>
        <p className="truncate text-[12.5px] font-black">{status}</p>
      </div>
    </div>
  );
}

/** Compact labelled metric used inside metric groups. */
export function MetricStat({ label, metric }: { label: string; metric: PlatformMetric }) {
  return (
    <div className="border-line bg-surface rounded-xl border p-3">
      <p className="text-ink text-xl font-black tabular-nums leading-none"><MetricValue metric={metric} /></p>
      <p className="text-muted mt-1 text-[12px] font-semibold">{label}</p>
    </div>
  );
}

export function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-muted text-[13px] font-semibold">{label}</dt>
      <dd className="text-ink text-[13px] font-bold">{children}</dd>
    </div>
  );
}

export function IntegrationBadge({ state }: { state: IntegrationState }) {
  const map: Record<IntegrationState, { tone: HealthTone; label: string }> = {
    connected: { tone: "ok", label: "מחובר" },
    warning: { tone: "warn", label: "דורש תשומת לב" },
    disconnected: { tone: "critical", label: "מנותק" },
    not_configured: { tone: "neutral", label: "לא מוגדר" },
    unavailable: { tone: "neutral", label: "לא זמין" },
  };
  const { tone, label } = map[state];
  return <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold", TONE_CLS[tone])}><span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} />{label}</span>;
}

export function ModuleUsageBadge({ state }: { state: ModuleUsageState }) {
  const map: Record<ModuleUsageState, { tone: HealthTone; label: string }> = {
    active_recent: { tone: "ok", label: "פעיל לאחרונה" },
    used: { tone: "neutral", label: "בשימוש" },
    none: { tone: "neutral", label: "ללא פעילות" },
    unavailable: { tone: "neutral", label: "לא זמין" },
  };
  const { tone, label } = map[state];
  return <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold", TONE_CLS[tone])}>{label}</span>;
}

/** Restricted panel — operator lacks the capability for this section. */
export function RestrictedPanel({ note = "אין לך הרשאה לצפות במידע זה." }: { note?: string }) {
  return (
    <div className="border-line bg-card rounded-2xl border p-8 text-center">
      <span className="text-muted bg-surface mx-auto grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Lock" size={22} /></span>
      <p className="text-ink mt-3 font-black">מוגבל להרשאה</p>
      <p className="text-muted mt-1 text-sm">{note}</p>
    </div>
  );
}

export function EmptyPanel({ icon = "FolderOpen", note }: { icon?: string; note: string }) {
  return (
    <div className="border-line bg-card rounded-2xl border p-8 text-center">
      <span className="text-muted bg-surface mx-auto grid h-12 w-12 place-items-center rounded-2xl"><Icon name={icon} size={22} /></span>
      <p className="text-muted mt-3 text-sm font-semibold">{note}</p>
    </div>
  );
}
