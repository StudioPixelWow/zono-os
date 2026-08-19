// ============================================================================
// ZONO — "על הבוקר" Daily Command Center: PURE priority model + view types.
// Deterministic, side-effect-free, unit-testable. An LLM NEVER decides
// operational priority — this does. ZI may reword the FACTS produced here, but
// the ranking, counts and reasons are computed from real server data only.
// ============================================================================

export type DailyRole = "owner" | "manager" | "agent";
export type DailyPriority = "P0" | "P1" | "P2";
export type DailyActionKind =
  | "lead_callback" | "lead_unassigned" | "publish_failed" | "publish_today"
  | "property_unmarketed" | "property_attention" | "task_overdue" | "task_today"
  | "deal_stuck" | "customer_reply" | "price_drop" | "price_drop_response"
  | "seller_callback" | "seller_strategy" | "marketing_attention" | "onboarding";

export interface DailyAction {
  id: string;
  kind: DailyActionKind;
  priority: DailyPriority;
  title: string;   // Hebrew, customer-facing
  reason: string;  // Hebrew explanation ("מחכה לחזרה כבר 3 שעות")
  href: string;
  cta: string;
  icon: string;
  /** 0..100 within-priority tie-breaker (higher = more urgent). */
  urgency: number;
  entity?: { type: string; id: string };
}

export interface DailyHeroSummary {
  leadsWaiting: number;
  propertiesUnmarketed: number;
  campaignsReadyToday: number;
  publishFailures: number;
  meetingsToday: number;
  overdueTasks: number;
}

export interface DailyLeadRow {
  id: string;
  name: string;
  source: string | null;
  stage: string;
  temperature: "hot" | "warm" | "cold";
  waitingSince: string | null;
  unassigned: boolean;
  phone: string | null;
  href: string;
  reason: string;
}

export interface DailyPropertyRow {
  propertyId: string;
  title: string;
  city: string | null;
  thumbnailUrl: string | null;
  status: string;          // CoverageStatus
  statusLabel: string;
  lastPublishedAt: string | null;
  nextScheduledAt: string | null;
  nextOverdue: boolean;
  cta: string;
  href: string;
}

export interface DailyCalendarItem {
  id: string;
  title: string;
  at: string | null;
  kind: string;            // meeting / task / visit
  href: string;
}

export interface DailyMarketing {
  plannedToday: number;
  publishedToday: number;
  waiting: number;
  attention: number;
  nextPublishAt: string | null;
}

export interface DailyPipeline {
  advanced: number;
  newDeals: number;
  stuck: number;
  stuckExample: { label: string; days: number } | null;
}

export interface DailyTeamException {
  id: string;
  label: string;
  count: number;
  href: string | null;
}

export interface OvernightChange {
  id: string;
  label: string;
  icon: string;
  href: string | null;
}

export interface CompletedItem {
  id: string;
  label: string;
  icon: string;
}

export interface DailyOnboarding {
  active: boolean;
  complete: boolean;
  completionPercent: number;
  nextLabel: string | null;
  nextHref: string | null;
}

export interface DailyCommandCenter {
  generatedAt: string;
  userFirstName: string;
  role: DailyRole;
  isManager: boolean;
  heroLine: string;
  actionCount: number;          // P0 + P1 count
  quiet: boolean;               // no P0/P1 actions
  primaryAction: DailyAction | null;
  hero: DailyHeroSummary;
  priorityActions: DailyAction[];
  leads: DailyLeadRow[];
  properties: DailyPropertyRow[];
  marketing: DailyMarketing;
  calendar: DailyCalendarItem[];
  pipeline: DailyPipeline | null;   // manager/owner only
  team: DailyTeamException[];       // manager/owner only
  overnight: OvernightChange[];
  completedToday: CompletedItem[];
  onboarding: DailyOnboarding | null;
}

// ── Pure helpers ────────────────────────────────────────────────────────────
export const PRIORITY_RANK: Record<DailyPriority, number> = { P0: 0, P1: 1, P2: 2 };

/** Stable sort: priority asc, then urgency desc. Returns a new array. */
export function rankDailyActions(actions: DailyAction[]): DailyAction[] {
  return actions
    .map((a, i) => ({ a, i }))
    .sort((x, y) =>
      PRIORITY_RANK[x.a.priority] - PRIORITY_RANK[y.a.priority] ||
      y.a.urgency - x.a.urgency ||
      x.i - y.i,
    )
    .map((w) => w.a);
}

/** Hours between an ISO timestamp and now (>= 0). */
export function hoursSince(iso: string | null, nowMs: number): number {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return Math.max(0, (nowMs - t) / 3_600_000);
}

/** Natural Hebrew age ("כבר 3 שעות", "כבר יומיים", "אתמול"). */
export function humanizeAge(iso: string | null, nowMs: number): string {
  if (!iso) return "";
  const h = hoursSince(iso, nowMs);
  if (!Number.isFinite(h)) return "";
  if (h < 1) return "פחות משעה";
  if (h < 24) return `כבר ${Math.floor(h)} שעות`;
  const d = Math.floor(h / 24);
  if (d === 1) return "כבר יום";
  if (d === 2) return "כבר יומיים";
  if (d < 7) return `כבר ${d} ימים`;
  const w = Math.floor(d / 7);
  return w === 1 ? "כבר שבוע" : `כבר ${w} שבועות`;
}

export function leadTemperature(score: number | null): "hot" | "warm" | "cold" {
  if ((score ?? 0) >= 70) return "hot";
  if ((score ?? 0) >= 40) return "warm";
  return "cold";
}

export const TEMP_LABEL: Record<"hot" | "warm" | "cold", string> = { hot: "חם", warm: "פושר", cold: "קר" };

/** Deterministic morning hero line from the computed summary. */
export function buildHeroLine(firstName: string, actionCount: number): string {
  const who = firstName ? `בוקר טוב, ${firstName}.` : "בוקר טוב.";
  if (actionCount <= 0) return `${who} הכול בשליטה להיום ✓`;
  if (actionCount === 1) return `${who} יש דבר אחד שכדאי לטפל בו היום.`;
  return `${who} יש ${actionCount} דברים שכדאי לטפל בהם היום.`;
}
