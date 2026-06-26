// ============================================================================
// ZONO — PHASE 26.14: Visibility guard (PURE, client-safe). Decides whether an
// intelligence source can be shown, and sanitizes output wording so ZONO never
// labels its work as "secret intelligence" / "spying" / "private data". No IO.
// Used by the governance service, the API layer and the Copilot.
// ============================================================================
import type { IntelligenceSource, VisibilityContext, GovernancePolicies } from "./agencyGovernanceTypes";
import { DEFAULT_POLICIES } from "./agencyGovernanceTypes";

export type VisibilityDecision = "visible" | "limited" | "hidden";

const LOW_CONFIDENCE = 0.4;

/** True when a source has aged past its retention window. */
export function isExpired(source: Pick<IntelligenceSource, "visibilityStatus" | "retentionUntil">, now = Date.now()): boolean {
  if (source.visibilityStatus === "expired") return true;
  if (source.retentionUntil) { const t = Date.parse(source.retentionUntil); if (!Number.isNaN(t) && t <= now) return true; }
  return false;
}

/**
 * Decide whether an intelligence source can be shown to a user.
 * - expired / hidden          → "hidden"
 * - needs_review              → "limited"
 * - source type disallowed by policy → "hidden"
 * - low-confidence public output when policy hides it → "limited"
 * - otherwise                 → "visible"
 */
export function canShowAgencyIntelligence(source: IntelligenceSource, context: VisibilityContext): VisibilityDecision {
  const p: GovernancePolicies = context.policies ?? DEFAULT_POLICIES;
  const now = context.now ?? Date.now();

  if (isExpired(source, now)) return "hidden";
  if (source.visibilityStatus === "hidden") return "hidden";
  if (source.visibilityStatus === "needs_review") return "limited";

  if (source.sourceType === "public" && !p.allow_public_sources) return "hidden";
  if (source.sourceType === "imported" && !p.allow_imported_sources) return "hidden";
  if (source.sourceType === "ai_generated" && !p.allow_ai_generated_summaries) return "hidden";

  if (source.visibilityStatus === "limited") return "limited";

  if (p.hide_low_confidence_public_output && source.sourceType === "public" && source.confidence != null && source.confidence < LOW_CONFIDENCE) {
    return "limited";
  }
  return "visible";
}

/** Keep only sources a user may see (visible + limited); drop hidden/expired. */
export function filterVisibleSources(sources: IntelligenceSource[], context: VisibilityContext): IntelligenceSource[] {
  return sources.filter((s) => canShowAgencyIntelligence(s, context) !== "hidden");
}

// ── Output wording compliance ────────────────────────────────────────────────
export const ALLOWED_WORDING = ["מודיעין עסקי", "מודיעין תחרותי", "אותות שוק", "ניתוח מתחרים"];

// Blocked → compliant replacement (longest/most-specific first).
const WORDING_REPLACEMENTS: [RegExp, string][] = [
  [/מודיעין\s*סודי/g, "מודיעין עסקי"],
  [/מודיעין\s*חסוי/g, "מודיעין עסקי"],
  [/מידע\s*חסוי/g, "מידע עסקי"],
  [/מידע\s*פרטי/g, "מידע עסקי גלוי"],
  [/ריגול/g, "ניתוח מתחרים"],
  [/לרגל/g, "לנתח"],
];
const BLOCKED_PATTERNS = [/מודיעין\s*סודי/, /מודיעין\s*חסוי/, /מידע\s*חסוי/, /מידע\s*פרטי/, /ריגול/, /לרגל/];

/** True when text contains any blocked compliance wording. */
export function containsBlockedWording(text: string): boolean {
  const t = text ?? "";
  return BLOCKED_PATTERNS.some((re) => re.test(t));
}

/** Replace blocked wording with compliant equivalents (idempotent). */
export function sanitizeWording(text: string | null | undefined): string {
  let out = text ?? "";
  for (const [re, rep] of WORDING_REPLACEMENTS) out = out.replace(re, rep);
  return out;
}

// ── Policy merge + retention (pure) ──────────────────────────────────────────
/** Overlay stored policy key→value pairs onto the compliant defaults (typed). */
export function mergePolicies(stored: Record<string, unknown>): GovernancePolicies {
  const out: GovernancePolicies = { ...DEFAULT_POLICIES };
  for (const k of Object.keys(DEFAULT_POLICIES) as (keyof GovernancePolicies)[]) {
    if (!(k in stored)) continue;
    const v = stored[k];
    if (k === "default_retention_days") { const n = Number(v); if (!Number.isNaN(n)) out[k] = n; }
    else if (typeof v === "boolean") (out[k] as boolean) = v;
    else if (v === "true" || v === "false") (out[k] as boolean) = v === "true";
  }
  return out;
}

/** Compute a retention deadline ISO from a collected date + retention days. */
export function retentionUntil(collectedAtIso: string | null, days: number, now = Date.now()): string {
  const base = collectedAtIso ? Date.parse(collectedAtIso) : now;
  const start = Number.isNaN(base) ? now : base;
  return new Date(start + Math.max(0, days) * 86400000).toISOString();
}
