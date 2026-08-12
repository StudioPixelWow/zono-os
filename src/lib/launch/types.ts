// ============================================================================
// ZONO — Commercial Launch Platform™ types (pure, client-safe). Launch /
// operations DTOs only — no business-domain types. Phase 21.
// ============================================================================

// ── Plans & licensing ────────────────────────────────────────────────────────
// FLAT MODEL (2026): ZONO has ONE product plan — "standard" (197 ₪ / active
// agent / month, ALL features open, 14-day trial). "enterprise" (10+ agents) is
// NOT a bigger feature bundle — it is the same full product with custom pricing,
// onboarding and org terms. Legacy tiers (starter/professional/office/pro/team)
// are decoded to "standard" by normalizePlanTier for backward compatibility.
export type PlanTier = "standard" | "enterprise";
export type PlanStatus = "trialing" | "active" | "past_due" | "canceled" | "expired" | "enterprise";

/** Canonical per-agent monthly price for the standard plan (₪). Single source. */
export const STANDARD_SEAT_PRICE_ILS = 197;
/** Free trial length (days). */
export const TRIAL_DAYS = 14;
/** Above this agent count, self-serve standard is replaced by the enterprise contact flow. */
export const ENTERPRISE_SEAT_THRESHOLD = 10;

export interface PlanLimits {
  seats: number;            // -1 = unlimited
  operatingAreas: number;   // monitored localities
  monitoredListings: number;
  aiCallsPerMonth: number;
  syncsPerDay: number;
}
export interface PlanDefinition {
  tier: PlanTier;
  label: string;
  priceHintIls: number | null;   // display only; billing wired later
  limits: PlanLimits;
  features: string[];            // entitlement keys gated via feature flags
  highlight?: boolean;
}
export interface OrgPlan {
  plan: PlanTier;
  status: PlanStatus;
  trialEndsAt: string | null;
  limits: PlanLimits;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
}

// ── Beta mode ─────────────────────────────────────────────────────────────────
export interface BetaEnrollment {
  orgId: string;
  userId: string | null;   // null = org-wide
  enabled: boolean;
  channel: string;
  note?: string | null;
}
export interface BetaContext {
  orgEnrolled: boolean;
  userEnrolled: boolean | null;  // null = no per-user override
}

// ── Feedback ──────────────────────────────────────────────────────────────────
export type FeedbackType = "bug" | "suggestion" | "missing_feature" | "performance";
export type FeedbackStatus = "open" | "triaged" | "resolved" | "wont_fix";
export interface FeedbackContext {
  browser: string;
  appVersion: string;
  roleKey: string;
  page: string;
  correlationId: string;
  viewport?: string;
  locale?: string;
}
export interface FeedbackInput {
  type: FeedbackType;
  title: string;
  body: string;
  severity?: "low" | "medium" | "high";
}

// ── Onboarding ────────────────────────────────────────────────────────────────
export type OnboardingStepKey =
  | "org_created" | "operating_areas" | "first_radar_scan" | "ai_configured"
  | "first_buyers" | "first_seller_opportunity" | "first_workflow" | "first_dashboard";
export interface OnboardingStep {
  key: OnboardingStepKey;
  label: string;
  description: string;
  href: string;
}
export interface OnboardingProgress {
  steps: Partial<Record<OnboardingStepKey, string>>;  // key → ISO completed-at
  dismissed: boolean;
  completedAt: string | null;
}
export interface OnboardingState {
  steps: { step: OnboardingStep; done: boolean; at: string | null }[];
  completedCount: number;
  total: number;
  percent: number;
  complete: boolean;
  nextStep: OnboardingStep | null;
}

// ── Production score ──────────────────────────────────────────────────────────
export type ScoreCategoryKey = "infrastructure" | "security" | "performance" | "monitoring" | "reliability";
export interface ScoreInput {
  // 0..1 sub-signals; everything is deterministic, no AI.
  infrastructure: number;
  security: number;
  performance: number;
  monitoring: number;
  reliability: number;
}
export interface ScoreCategory { key: ScoreCategoryKey; label: string; percent: number }
export interface ProductionScore {
  categories: ScoreCategory[];
  launchReadinessPercent: number;
  band: "not_ready" | "caution" | "ready";
}

// ── Diagnostics ───────────────────────────────────────────────────────────────
export type DiagStatus = "pass" | "warning" | "fail" | "unknown";
export interface DiagnosticCheck { key: string; label: string; status: DiagStatus; detail?: string; latencyMs?: number | null }
export interface DiagnosticsReport { overall: DiagStatus; checks: DiagnosticCheck[]; generatedAt: string }

// ── Deployment validation ─────────────────────────────────────────────────────
export type GateLevel = "PASS" | "WARNING" | "FAIL";
export interface GateResult { name: string; level: GateLevel; detail: string }

// ── Release notes ─────────────────────────────────────────────────────────────
export interface VersionMeta { version: string; date: string; title: string; highlights: string[]; area?: string }
export interface ReleaseNote { version: string; date: string; title: string; highlights: string[]; area: string }

// ── Usage analytics ───────────────────────────────────────────────────────────
export type UsageCategory = "feature" | "screen" | "workflow" | "automation" | "ai" | "performance" | "error";
export interface UsageEventInput {
  category: UsageCategory;
  name: string;
  props?: Record<string, string | number | boolean>;
}
