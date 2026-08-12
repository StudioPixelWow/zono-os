// ============================================================================
// ZONO — P6.3 Limits, Budgets & Cost Controls · canonical model (PURE).
// ONE deterministic limit resolver shared by every surface. SHADOW-FIRST: this
// phase computes limits and "would-block" but ENFORCES NOTHING — no production
// customer is ever blocked by P6.3. Reuses the existing plan limit structure
// (launch/plans.ts PlanLimits, -1 = unlimited) and the existing per-org override
// store (org_plans.limits jsonb) — NO new limits engine, NO migration.
//
// Never fabricates AI monetary cost: money budgets are UNAVAILABLE until an
// authoritative cost source exists (P6.1 keeps cost NULL).
// ============================================================================
import { checkLimit } from "@/lib/launch/plans";
import type { PlanTier } from "@/lib/launch/types";
import { israelDayKey } from "@/lib/trends/model";

/** -1 sentinel = unlimited (mirrors launch/plans internal constant). */
export const UNLIMITED = -1;

// ── Limit taxonomy — ONLY limits the product genuinely represents ───────────
// The five numeric plan limits (from PlanLimits) + AI token observation. We do
// NOT invent limits with no product meaning (e.g. campaigns/websites are not in
// PlanLimits, so they are not modeled here as caps).
export const LIMIT_KEYS = ["seats", "operatingAreas", "monitoredListings", "aiCallsPerMonth", "syncsPerDay", "aiTokensMonthly", "aiMonetaryBudget"] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

export type LimitMode = "ENFORCED" | "SHADOW" | "OBSERVED" | "UNAVAILABLE" | "UNLIMITED";

export interface LimitDef {
  key: LimitKey; label: string;
  /** which PlanLimits field carries the configured value, if any */
  planField: "seats" | "operatingAreas" | "monitoredListings" | "aiCallsPerMonth" | "syncsPerDay" | null;
  usageSource: string;        // authoritative usage source (doc)
  resetPeriod: "current_state" | "calendar_month" | "per_day" | "none";
  /** the mode this limit resolves to in P6.3 (nothing is ENFORCED yet) */
  baseMode: Exclude<LimitMode, "UNLIMITED">;
}

export const LIMIT_DEFS: Record<LimitKey, LimitDef> = {
  seats:             { key: "seats", label: "מושבים (משתמשים פעילים)", planField: "seats", usageSource: "users(status=active)", resetPeriod: "current_state", baseMode: "SHADOW" },
  operatingAreas:    { key: "operatingAreas", label: "אזורי פעילות", planField: "operatingAreas", usageSource: "user_operating_localities", resetPeriod: "current_state", baseMode: "SHADOW" },
  monitoredListings: { key: "monitoredListings", label: "נכסים במעקב", planField: "monitoredListings", usageSource: "properties", resetPeriod: "current_state", baseMode: "SHADOW" },
  aiCallsPerMonth:   { key: "aiCallsPerMonth", label: "בקשות AI לחודש", planField: "aiCallsPerMonth", usageSource: "ai_usage_costs (חודש קלנדרי)", resetPeriod: "calendar_month", baseMode: "SHADOW" },
  syncsPerDay:       { key: "syncsPerDay", label: "סנכרונים ליום", planField: "syncsPerDay", usageSource: "(אין מקור שימוש אמין)", resetPeriod: "per_day", baseMode: "UNAVAILABLE" },
  aiTokensMonthly:   { key: "aiTokensMonthly", label: "טוקני AI לחודש", planField: null, usageSource: "ai_usage_costs.total_tokens (חודש)", resetPeriod: "calendar_month", baseMode: "OBSERVED" },
  aiMonetaryBudget:  { key: "aiMonetaryBudget", label: "תקציב עלות AI (₪/$)", planField: null, usageSource: "(אין מקור עלות סמכותי)", resetPeriod: "calendar_month", baseMode: "UNAVAILABLE" },
};

// ── Warning thresholds (deterministic, documented) ──────────────────────────
export type LimitStatus = "normal" | "near_limit" | "exceeded";
export const NEAR_LIMIT_PCT = 80;
/** <80% normal · 80–99% near_limit · ≥100% exceeded. Unlimited/unknown → normal. */
export function limitStatus(usage: number, configuredLimit: number | null): LimitStatus {
  if (configuredLimit === null || configuredLimit < 0) return "normal"; // unlimited/unknown
  if (configuredLimit === 0) return usage > 0 ? "exceeded" : "normal";
  const pct = (usage / configuredLimit) * 100;
  if (pct >= 100) return "exceeded";
  if (pct >= NEAR_LIMIT_PCT) return "near_limit";
  return "normal";
}

// ── Canonical resolution result ─────────────────────────────────────────────
export interface LimitResolution {
  limitKey: LimitKey;
  label: string;
  configuredLimit: number | null;   // null = no configured cap; -1 handled → UNLIMITED
  usage: number | null;             // null = usage source unavailable
  remaining: number | null;         // null when unlimited/unavailable
  exceeded: boolean;                // would-block? (shadow — never actually blocks in P6.3)
  status: LimitStatus;
  source: string;                   // config source (plan default vs org override)
  mode: LimitMode;
  reason: string;
}

/**
 * Pure canonical resolver. Given the configured limit (already resolved from
 * org_plans.limits ?? plan default) and current usage, produce the full result.
 * `usage=null` means the usage source is unavailable → mode collapses to
 * UNAVAILABLE. `configuredLimit=-1` → UNLIMITED. Nothing is ENFORCED in P6.3.
 */
export function resolveLimit(def: LimitDef, configuredLimit: number | null, usage: number | null, source: string): LimitResolution {
  const base: Omit<LimitResolution, "mode" | "reason" | "remaining" | "exceeded" | "status"> = {
    limitKey: def.key, label: def.label, configuredLimit, usage, source,
  };
  // Money budget / no authoritative source → UNAVAILABLE, never fabricated.
  if (def.baseMode === "UNAVAILABLE" || usage === null) {
    return { ...base, remaining: null, exceeded: false, status: "normal", mode: "UNAVAILABLE",
      reason: def.key === "aiMonetaryBudget" ? "אין מקור עלות סמכותי — תקציב כספי אינו זמין" : "מקור נתונים חסר או לא אמין" };
  }
  // Unlimited plan value.
  if (configuredLimit !== null && configuredLimit < 0) {
    return { ...base, remaining: null, exceeded: false, status: "normal", mode: "UNLIMITED", reason: "ללא הגבלה (−1)" };
  }
  // No configured cap but usage tracked → OBSERVED (e.g. AI tokens).
  if (configuredLimit === null) {
    return { ...base, remaining: null, exceeded: false, status: "normal", mode: "OBSERVED", reason: "שימוש נמדד ללא תקרה מוגדרת" };
  }
  const chk = checkLimit(configuredLimit, usage);
  const status = limitStatus(usage, configuredLimit);
  return {
    ...base,
    remaining: chk.unlimited ? null : Math.max(0, configuredLimit - usage),
    exceeded: !chk.withinLimit,       // would-block in a future enforced world
    status,
    mode: def.baseMode,               // SHADOW (computed, not enforced)
    reason: status === "exceeded" ? "השימוש חורג מהתקרה המוצעת (מצב צל — לא חוסם)"
      : status === "near_limit" ? "מתקרב לתקרה" : "בתוך התקרה",
  };
}

// ── Effective configured limit: org override → plan default ─────────────────
export interface PlanLimitsLike { seats: number; operatingAreas: number; monitoredListings: number; aiCallsPerMonth: number; syncsPerDay: number }
/** Effective numeric limit for a plan field: org override (org_plans.limits) wins over the plan default. */
export function effectiveConfigured(def: LimitDef, planDefault: PlanLimitsLike, override: Partial<PlanLimitsLike> | null): { value: number | null; source: string } {
  if (!def.planField) return { value: null, source: "no plan field" };
  const ov = override?.[def.planField];
  if (typeof ov === "number") return { value: ov, source: "org override (org_plans.limits)" };
  return { value: planDefault[def.planField], source: "plan default" };
}

// ── Concurrency classification (which limits need atomic enforcement later) ─
// Check-then-insert limits (seats, listings, areas) can over-admit under
// concurrency (limit=10, usage=9, two concurrent creates → 11). Documented so
// P7 enforcement uses atomic DB guards (unique/exclusion constraint or
// SELECT … FOR UPDATE), never a naive app-level count.
export const CONCURRENCY_SENSITIVE: LimitKey[] = ["seats", "operatingAreas", "monitoredListings"];
export function needsAtomicEnforcement(key: LimitKey): boolean { return CONCURRENCY_SENSITIVE.includes(key); }

export type { PlanTier };

/** Current Israel calendar-month key 'YYYY-MM' for monthly-window usage counting. */
export function israelMonthKey(instant: string | number | Date): string { return israelDayKey(instant).slice(0, 7); }
