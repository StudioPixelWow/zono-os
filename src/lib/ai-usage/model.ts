// ============================================================================
// ZONO — P6.1 AI Usage & Cost · canonical model (PURE, client-safe).
// The deterministic contract for AI provider usage/economics: the feature
// taxonomy, provider/model normalization, request types, token math, cost-basis
// classification, and safe error categories. Kept separate from product-usage
// telemetry (domain_events): domain_events = product usage; ai_usage_costs = AI
// provider economics. No prices are hardcoded here — cost is authoritative-source
// only, else NULL/UNAVAILABLE.
// ============================================================================

// ── Feature taxonomy (stable keys — never page names) ───────────────────────
// Derived from the P6.1 AI call-site audit. Every AI request maps to one key.
export const AI_FEATURES = {
  ai_copilot: "ai_copilot",                 // comm-copilot enrichment / reasoning gateway
  marketing_dna: "marketing_dna",           // creative-studio marketing DNA analysis (vision)
  brand_dna: "brand_dna",                   // creative-dna brand analyzer (vision)
  ad_copy: "ad_copy",                       // creative-studio copy generation
  creative_concept: "creative_concept",     // creative concept generation
  campaign_plan: "campaign_plan",           // campaign planning
  creative_asset: "creative_asset",         // asset plans
  creative_thinking: "creative_thinking",   // creative-director reasoning
  ad_prompt: "ad_prompt",                   // art-direction / scene prompt
  ad_qa_vision: "ad_qa_vision",             // ad pipeline QA vision read-back
  quick_creative: "quick_creative",         // quick creative text
  image_generation: "image_generation",     // final image gen (per-image priced)
  property_description: "property_description", // property marketing copy
  neighborhood_enrichment: "neighborhood_enrichment", // background enrichment
  geo_discovery: "geo_discovery",           // background geo discovery
} as const;
export type AiFeatureKey = (typeof AI_FEATURES)[keyof typeof AI_FEATURES];
const FEATURE_SET = new Set<string>(Object.values(AI_FEATURES));
export function isValidFeature(key: string): key is AiFeatureKey { return FEATURE_SET.has(key); }

export const AI_FEATURE_LABEL: Record<string, string> = {
  ai_copilot: "קופיילוט", marketing_dna: "ניתוח DNA שיווקי", brand_dna: "DNA מותג",
  ad_copy: "קופי למודעות", creative_concept: "קונספט קריאייטיב", campaign_plan: "תכנון קמפיין",
  creative_asset: "נכסי קריאייטיב", creative_thinking: "חשיבה קריאייטיבית", ad_prompt: "פרומפט אמנותי",
  ad_qa_vision: "בקרת איכות ויזואלית", quick_creative: "קריאייטיב מהיר", image_generation: "יצירת תמונות",
  property_description: "תיאור נכס", neighborhood_enrichment: "העשרת שכונה", geo_discovery: "גילוי גאוגרפי",
};
export function featureLabel(k: string): string { return AI_FEATURE_LABEL[k] ?? k; }

// ── Provider normalization ──────────────────────────────────────────────────
export const AI_PROVIDERS = { openai: "openai", anthropic: "anthropic", gemini: "gemini", google: "google", unknown: "unknown" } as const;
export type AiProvider = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS];
/** Normalize a raw provider/model hint to a canonical provider id. Deterministic. */
export function normalizeProvider(raw: string | null | undefined): AiProvider {
  const s = (raw ?? "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("anthropic") || s.includes("claude")) return "anthropic";
  if (s.includes("gemini") || s.includes("imagen") || s.includes("google") || s.includes("generativelanguage")) return s.includes("google") && !s.includes("gemini") && !s.includes("imagen") ? "google" : "gemini";
  if (s.includes("openai") || s.startsWith("gpt") || s.includes("gpt-") || s.includes("dall") || s.includes("gpt-image") || s.startsWith("o1") || s.startsWith("o3")) return "openai";
  return "unknown";
}

/** Normalize a model id: trim, lowercase, strip provider prefixes. Never invents. */
export function normalizeModel(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "unknown";
  return s.replace(/^models\//i, "").toLowerCase();
}

// ── Request types ───────────────────────────────────────────────────────────
export const AI_REQUEST_TYPES = ["chat", "vision", "image", "embedding", "other"] as const;
export type AiRequestType = (typeof AI_REQUEST_TYPES)[number];
export function isValidRequestType(t: string): t is AiRequestType { return (AI_REQUEST_TYPES as readonly string[]).includes(t); }

// ── Status + safe error categories (never raw provider error payloads) ──────
export type AiStatus = "success" | "failed";
export const AI_ERROR_CATEGORIES = ["timeout", "rate_limit", "auth", "invalid_request", "content_filter", "provider_error", "network", "quota", "unknown"] as const;
export type AiErrorCategory = (typeof AI_ERROR_CATEGORIES)[number];
/** Map an arbitrary error to a SAFE normalized category — never stores the raw message. */
export function normalizeErrorCategory(err: unknown): AiErrorCategory {
  const m = (err instanceof Error ? err.message : typeof err === "string" ? err : "").toLowerCase();
  if (!m) return "unknown";
  if (/timeout|timed out|etimedout|abort/.test(m)) return "timeout";
  if (/rate.?limit|429|too many requests/.test(m)) return "rate_limit";
  if (/quota|insufficient|billing|credit/.test(m)) return "quota";
  if (/unauthor|401|403|api key|forbidden|permission/.test(m)) return "auth";
  if (/content|safety|filter|policy/.test(m)) return "content_filter";
  if (/invalid|400|bad request|malformed/.test(m)) return "invalid_request";
  if (/network|econnre|fetch failed|socket|dns|enotfound/.test(m)) return "network";
  if (/5\d\d|server error|internal|overloaded|unavailable/.test(m)) return "provider_error";
  return "unknown";
}

// ── Token math ──────────────────────────────────────────────────────────────
export interface TokenCounts { input: number | null; output: number | null; total: number | null }
/**
 * Reconcile provider token counts deterministically. total = input+output when
 * both present; if provider gives total but not the split, keep total. Negative
 * or non-finite values are treated as unavailable (null). NEVER estimated from
 * text length here — provider-reported only.
 */
export function reconcileTokens(input: number | null | undefined, output: number | null | undefined, providerTotal?: number | null): TokenCounts {
  const i = numOrNull(input), o = numOrNull(output), pt = numOrNull(providerTotal);
  let total: number | null = pt;
  if (i !== null && o !== null) total = i + o;
  else if (total === null && (i !== null || o !== null)) total = (i ?? 0) + (o ?? 0);
  return { input: i, output: o, total };
}
function numOrNull(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return Math.floor(v);
}

// ── Cost basis (the honesty contract) ───────────────────────────────────────
// P6.1 has NO authoritative cost source (no provider cost field parsed, no billing
// API, no verified pricing registry). So cost is ALWAYS unavailable today — we
// record tokens, cost stays NULL, basis = "unavailable". "estimated" and
// "provider_reported" exist for future authoritative sources but must never be
// used with fabricated prices.
export type CostBasis = "provider_reported" | "estimated" | "unavailable";
export const CURRENCY_DEFAULT = "USD";

export interface AiCostResolution { costAmount: number | null; currency: string; basis: CostBasis }
/** With no authoritative pricing source configured, cost is UNAVAILABLE. Deterministic. */
export function resolveCost(_tokens: TokenCounts, authoritative?: { amount: number; currency: string } | null): AiCostResolution {
  if (authoritative && Number.isFinite(authoritative.amount)) {
    return { costAmount: authoritative.amount, currency: authoritative.currency || CURRENCY_DEFAULT, basis: "provider_reported" };
  }
  return { costAmount: null, currency: CURRENCY_DEFAULT, basis: "unavailable" };
}

// ── Metadata sanitization (reuse the telemetry contract; never AI content) ──
export { sanitizeTelemetryMetadata as sanitizeAiMetadata } from "@/lib/telemetry/model";

// Keys that must NEVER appear in an AI usage record (content/secret guard).
export const FORBIDDEN_AI_KEYS = ["prompt", "prompts", "messages", "message", "completion", "completions", "response", "raw_response", "rawResponse", "content", "text", "transcript", "api_key", "apikey", "authorization", "token", "secret"] as const;
