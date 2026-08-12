// ============================================================================
// ZONO — PLATFORM ACCESS model (P5.4). PURE, client-safe, deterministic.
// ----------------------------------------------------------------------------
// The canonical, explainable Effective-Access DECISION lives here (like P5.0's
// operatorCan). The server layer (server/access.ts) only fetches the org's plan,
// org overrides (org-scoped feature_flags) and limits, then delegates every
// decision to `resolveFeatureAccess` below. NOTHING here enforces anything —
// P5.4 is SHADOW MODE: we compute + explain + report drift; the app keeps its
// current always-on behavior. Precedence, adapted to the REAL schema:
//   BASE PLAN → PLAN ENTITLEMENT → ORG OVERRIDE (org feature_flag) →
//   GLOBAL FEATURE FLAG → EFFECTIVE ACCESS
// ============================================================================
import { planAllows, ENTITLEMENTS, type EntitlementKey } from "@/lib/launch/plans";
import type { PlanTier } from "@/lib/launch/types";

/** Canonical product features/modules. `entitlement: null` = a BASE module that
 *  is always granted (grandfathered — no entitlement gate exists for it today).
 *  Modules mirror the REAL product; entitlement mapping follows src/lib/launch. */
export interface FeatureDef {
  key: string;
  label: string;
  category: "crm" | "marketing" | "communication" | "intelligence" | "websites" | "ai" | "platform";
  entitlement: EntitlementKey | null;
  limitKey?: "seats" | "operatingAreas" | "monitoredListings" | "aiCallsPerMonth" | "syncsPerDay";
}

export const FEATURE_CATALOG: FeatureDef[] = [
  { key: "crm", label: "CRM", category: "crm", entitlement: null },
  { key: "properties", label: "נכסים", category: "crm", entitlement: null, limitKey: "monitoredListings" },
  { key: "leads", label: "לידים", category: "crm", entitlement: null },
  { key: "matching", label: "התאמות", category: "crm", entitlement: ENTITLEMENTS.BUYER_MATCHING },
  { key: "property_radar", label: "ראדאר נכסים", category: "intelligence", entitlement: ENTITLEMENTS.PROPERTY_RADAR, limitKey: "monitoredListings" },
  { key: "recommendations", label: "המלצות / הזדמנויות", category: "intelligence", entitlement: ENTITLEMENTS.SELLER_INTELLIGENCE },
  { key: "journeys", label: "מסעות לקוח", category: "marketing", entitlement: ENTITLEMENTS.JOURNEY_AUTOMATION },
  { key: "automations", label: "אוטומציות", category: "marketing", entitlement: ENTITLEMENTS.JOURNEY_AUTOMATION },
  { key: "distribution", label: "הפצה", category: "marketing", entitlement: null },
  { key: "facebook", label: "פייסבוק", category: "marketing", entitlement: null },
  { key: "whatsapp", label: "וואטסאפ", category: "communication", entitlement: null },
  { key: "agent_website", label: "אתר סוכן", category: "websites", entitlement: null },
  { key: "office_website", label: "אתר משרד", category: "websites", entitlement: ENTITLEMENTS.OFFICE_INTELLIGENCE },
  { key: "analytics", label: "אנליטיקה / Executive", category: "intelligence", entitlement: ENTITLEMENTS.EXECUTIVE_INTELLIGENCE },
  { key: "competitor_intelligence", label: "מודיעין תחרותי", category: "intelligence", entitlement: ENTITLEMENTS.COMPETITOR_INTELLIGENCE },
  { key: "multi_agent", label: "ריבוי סוכנים", category: "platform", entitlement: ENTITLEMENTS.MULTI_AGENT, limitKey: "seats" },
  { key: "ai", label: "יכולות AI", category: "ai", entitlement: ENTITLEMENTS.AI_COPILOT, limitKey: "aiCallsPerMonth" },
  { key: "priority_support", label: "תמיכה מועדפת", category: "platform", entitlement: ENTITLEMENTS.PRIORITY_SUPPORT },
];

export function featureByKey(key: string): FeatureDef | null {
  return FEATURE_CATALOG.find((f) => f.key === key) ?? null;
}

/** Normalize any raw plan string to the FLAT model. "enterprise" → enterprise;
 *  every legacy tier (starter/professional/office/pro/team) and unknown/empty →
 *  "standard" (all features are open on every plan, so legacy customers simply
 *  become standard). This is the backward-compat safety net. */
export function normalizePlanTier(raw: string | null | undefined): PlanTier {
  return (raw ?? "").toLowerCase() === "enterprise" ? "enterprise" : "standard";
}

export type AccessSource =
  | "base"              // ungated module — always granted (grandfathered)
  | "plan_entitlement"  // decided by the plan's entitlement set
  | "org_override"      // org-scoped feature_flag forced it
  | "feature_flag";     // global feature_flag forced it

/** One org override / flag decision for a feature (from feature_flags). */
export interface FeatureOverride { enabled: boolean; scope: "org" | "global"; rolloutPct?: number | null }

export interface EffectiveAccess {
  feature: string;
  label: string;
  enabled: boolean;
  source: AccessSource;
  plan: PlanTier;
  entitlement: EntitlementKey | null;
  planEntitled: boolean;         // what the base plan alone would grant
  override: boolean | null;      // org/global flag decision, if any
  reason: string;
}

/**
 * THE canonical, deterministic Effective-Access decision. Pure: same inputs →
 * same output. `override` is a resolved feature_flag decision (org preferred
 * over global) or null. Fail-safe: an unknown feature is DISABLED.
 */
export function resolveFeatureAccess(tier: PlanTier, feature: FeatureDef | null, override: FeatureOverride | null): EffectiveAccess {
  if (!feature) {
    return { feature: "unknown", label: "לא ידוע", enabled: false, source: "plan_entitlement", plan: tier, entitlement: null, planEntitled: false, override: override?.enabled ?? null, reason: "יכולת לא מוכרת — נדחה כברירת מחדל בטוחה" };
  }
  const planEntitled = feature.entitlement ? planAllows(tier, feature.entitlement) : true;

  if (override) {
    return {
      feature: feature.key, label: feature.label, enabled: override.enabled,
      source: override.scope === "org" ? "org_override" : "feature_flag",
      plan: tier, entitlement: feature.entitlement, planEntitled, override: override.enabled,
      reason: override.enabled
        ? `הופעל ידנית דרך ${override.scope === "org" ? "override ארגוני" : "דגל גלובלי"}`
        : `הושבת ידנית דרך ${override.scope === "org" ? "override ארגוני" : "דגל גלובלי"}`,
    };
  }
  if (!feature.entitlement) {
    return { feature: feature.key, label: feature.label, enabled: true, source: "base", plan: tier, entitlement: null, planEntitled: true, override: null, reason: "מודול בסיס — זמין תמיד" };
  }
  return {
    feature: feature.key, label: feature.label, enabled: planEntitled, source: "plan_entitlement",
    plan: tier, entitlement: feature.entitlement, planEntitled, override: null,
    reason: planEntitled ? `כלול בתוכנית ${tier}` : `אינו כלול בתוכנית ${tier}`,
  };
}

// ── Drift (SHADOW MODE) ─────────────────────────────────────────────────────
// CURRENT production behavior is "always-on once role-authorized" (audit §5), so
// the current effective state for every feature is ENABLED. Drift = where the
// new resolver disagrees. CRITICAL = resolver would REMOVE access currently in
// use; that must block enforcement.
export type DriftSeverity = "critical" | "warning" | "info" | "none";
export interface DriftEntry { feature: string; label: string; current: boolean; resolved: boolean; severity: DriftSeverity; source: AccessSource; reason: string }

/** current=true for all features today (grandfathered). */
export function classifyDrift(e: EffectiveAccess, currentEnabled = true): DriftEntry {
  let severity: DriftSeverity = "none";
  if (currentEnabled && !e.enabled) severity = "critical";        // would remove live access
  else if (!currentEnabled && e.enabled) severity = "warning";    // resolver grants what UI hid
  else if (e.source === "org_override" || e.source === "feature_flag") severity = "info";
  return { feature: e.feature, label: e.label, current: currentEnabled, resolved: e.enabled, severity, source: e.source, reason: e.reason };
}

export interface DriftSummary { critical: number; warning: number; info: number; none: number; total: number }

/** Aggregate a drift set by severity — used by the platform drift report. */
export function summarizeDrift(entries: DriftEntry[]): DriftSummary {
  const s: DriftSummary = { critical: 0, warning: 0, info: 0, none: 0, total: entries.length };
  for (const e of entries) s[e.severity] += 1;
  return s;
}

// ── Access matrix (PURE) ────────────────────────────────────────────────────
// features × plans, PLAN-ALONE (no org overrides). This is the canonical
// "what each plan entitles" table rendered by the plans / feature-access
// screens. Base modules (entitlement:null) are true for every tier.
export const PLAN_TIERS: PlanTier[] = ["standard", "enterprise"];

export interface AccessMatrixCell { tier: PlanTier; entitled: boolean }
export interface AccessMatrixRow { feature: string; label: string; category: FeatureDef["category"]; entitlement: EntitlementKey | null; cells: AccessMatrixCell[] }

/** Deterministic features×plans entitlement matrix (plan-alone, no overrides). */
export function buildAccessMatrix(): AccessMatrixRow[] {
  return FEATURE_CATALOG.map((f) => ({
    feature: f.key,
    label: f.label,
    category: f.category,
    entitlement: f.entitlement,
    cells: PLAN_TIERS.map((tier) => ({
      tier,
      entitled: f.entitlement ? planAllows(tier, f.entitlement) : true,
    })),
  }));
}
