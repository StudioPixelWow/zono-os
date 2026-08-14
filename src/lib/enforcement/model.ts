// ============================================================================
// ZONO — P7.0 Enforcement Readiness · canonical model (PURE, client-safe).
// The ONE mode + decision model for entitlement/limit enforcement. P7.0 is
// PREPARATION: the default mode is SHADOW everywhere, so deploying this code
// blocks NO customer. Enforcement only ever happens when a specific key is
// explicitly set to PILOT (for a named pilot org) or ENFORCED — via config, not
// code — so there is an instant config-only rollback (kill switch).
// ============================================================================
import { needsAtomicEnforcement, type LimitKey } from "@/lib/limits/model";

// ── Canonical enforcement modes (no scattered booleans) ─────────────────────
export const ENFORCEMENT_MODES = ["OFF", "SHADOW", "PILOT", "ENFORCED"] as const;
export type EnforcementMode = (typeof ENFORCEMENT_MODES)[number];
export const DEFAULT_MODE: EnforcementMode = "SHADOW"; // safe default when unconfigured

// ── Block response contract (stable server-side codes) ──────────────────────
export const BLOCK_CODES = ["FEATURE_NOT_AVAILABLE", "LIMIT_REACHED", "LIMIT_UNAVAILABLE", "ACCESS_ENFORCEMENT_ERROR"] as const;
export type BlockCode = (typeof BLOCK_CODES)[number];
export const BLOCK_MESSAGE_HE: Record<BlockCode, string> = {
  FEATURE_NOT_AVAILABLE: "התכונה אינה כלולה בתוכנית הנוכחית.",
  LIMIT_REACHED: "הגעת למגבלת השימוש של התוכנית.",
  LIMIT_UNAVAILABLE: "בדיקת המגבלה אינה זמינה כרגע — הפעולה הותרה.",
  ACCESS_ENFORCEMENT_ERROR: "שגיאת בדיקת הרשאה — הפעולה הותרה בזהירות.",
};

// ── Decision ────────────────────────────────────────────────────────────────
export interface EnforcementDecision {
  decision: "allow" | "deny";
  enforced: boolean;          // did enforcement actually apply (vs shadow/off)?
  mode: EnforcementMode;
  wouldBlock: boolean;        // would this block if fully ENFORCED?
  code: BlockCode | null;     // set only when decision = deny
  reason: string;
}

export interface DecisionInput {
  mode: EnforcementMode;
  wouldBlock: boolean;        // resolver says over-limit / feature denied
  available: boolean;         // is the check trustworthy (usage source present)?
  isPilotOrg: boolean;        // does this org participate in a PILOT?
  code: BlockCode;            // which block code applies if denied
}

/**
 * The single decision function. SHADOW/OFF never deny. PILOT denies only for a
 * pilot org. ENFORCED denies for all — but only when the check is `available`
 * and `wouldBlock`. When a limit check is unavailable we FAIL OPEN (allow) so a
 * telemetry gap never blocks a customer. Deterministic.
 */
export function decideEnforcement(i: DecisionInput): EnforcementDecision {
  const base = { mode: i.mode, wouldBlock: i.wouldBlock };
  const applies = i.mode === "ENFORCED" || (i.mode === "PILOT" && i.isPilotOrg);
  if (!applies) {
    return { ...base, decision: "allow", enforced: false, code: null,
      reason: i.mode === "OFF" ? "אכיפה כבויה" : i.mode === "SHADOW" ? "מצב צל — מדווח, לא אוכף" : "PILOT — הארגון אינו בפיילוט" };
  }
  // Enforcement applies. Fail OPEN when the check is not trustworthy.
  if (!i.available) {
    return { ...base, decision: "allow", enforced: true, code: null, reason: "בדיקה לא זמינה — fail-open" };
  }
  if (i.wouldBlock) {
    return { ...base, decision: "deny", enforced: true, code: i.code, reason: BLOCK_MESSAGE_HE[i.code] };
  }
  return { ...base, decision: "allow", enforced: true, code: null, reason: "בתוך ההרשאה/מגבלה" };
}

// ── Fail-open vs fail-closed policy (explicit per control class) ────────────
// FEATURE ACCESS is a security/entitlement boundary → FAIL CLOSED when ENFORCED
// (an errored access check denies). USAGE LIMITS are availability-sensitive →
// FAIL OPEN (an errored/unavailable usage read allows), so a telemetry glitch
// never locks out a paying customer. Documented, not a blind global rule.
export type ControlClass = "feature_access" | "usage_limit";
export const FAIL_POLICY: Record<ControlClass, "fail_closed" | "fail_open"> = {
  feature_access: "fail_closed",
  usage_limit: "fail_open",
};

// ── Enforcement readiness classification ────────────────────────────────────
export type Readiness = "SAFE_TO_ENFORCE" | "NEEDS_ATOMIC_GUARD" | "NEEDS_DATA_FIX" | "NEEDS_PRODUCT_DECISION" | "UNAVAILABLE";

export interface LimitReadiness { limitKey: LimitKey; readiness: Readiness; atomicSafe: boolean; reason: string }
/**
 * Classify a limit's enforcement readiness. Concurrency-sensitive limits are
 * NEEDS_ATOMIC_GUARD until an atomic DB guard exists (`atomicGuardExists`).
 * `usageAvailable=false` → UNAVAILABLE. Aggregate limits (AI tokens) with a
 * configured cap are SAFE (post-hoc, no check-then-insert race).
 */
export function classifyLimitReadiness(limitKey: LimitKey, usageAvailable: boolean, hasConfiguredCap: boolean, atomicGuardExists: boolean): LimitReadiness {
  if (!usageAvailable) return { limitKey, readiness: "UNAVAILABLE", atomicSafe: false, reason: "אין מקור שימוש אמין" };
  if (!hasConfiguredCap) return { limitKey, readiness: "NEEDS_PRODUCT_DECISION", atomicSafe: false, reason: "אין תקרה מוגדרת בתוכנית" };
  if (needsAtomicEnforcement(limitKey)) {
    return atomicGuardExists
      ? { limitKey, readiness: "SAFE_TO_ENFORCE", atomicSafe: true, reason: "מוגן ע״י שומר אטומי" }
      : { limitKey, readiness: "NEEDS_ATOMIC_GUARD", atomicSafe: false, reason: "בדיקה-ואז-כתיבה חשופה למרוץ מקבילי — דורש שומר אטומי ב-DB" };
  }
  return { limitKey, readiness: "SAFE_TO_ENFORCE", atomicSafe: true, reason: "מצטבר/פוסט-הוק — ללא מרוץ" };
}

// ── AI enforcement architecture note (pre-flight → invoke → record) ─────────
// AI limits are special: usage is recorded AFTER the provider call. Safe hard
// enforcement therefore requires a PRE-FLIGHT check against the current period
// count BEFORE invoking the provider, then the normal post-call record. P7.0
// does NOT block AI; this documents the required order for a future pilot.
export const AI_ENFORCEMENT_ORDER = ["preflight_usage_check", "provider_invocation", "usage_record"] as const;
