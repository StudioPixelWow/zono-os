// ============================================================================
// 📐 AI Memory schema + SECRET SAFETY (pure). Phase 27.7.
// Validates memory input and guarantees no secrets are ever stored: secret-like
// keys are deep-stripped from the value and obvious secrets in text are rejected.
// ============================================================================
import type { AiMemoryInput, MemoryType, MemoryVisibility, MemorySource } from "./types";

const MEMORY_TYPES: ReadonlySet<string> = new Set([
  "user_preference", "broker_preference", "office_preference", "working_style",
  "favorite_area", "faq", "pinned_intelligence", "dismissed_insight",
  "decision", "rule", "manual_note", "context",
]);
const VISIBILITIES: ReadonlySet<string> = new Set(["private", "office", "organization", "system"]);
const SOURCES: ReadonlySet<string> = new Set([
  "manual", "reasoning_gateway", "mission_planner", "action_center",
  "broker_coach", "decision_brain", "user_action",
]);

export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  user_preference: "העדפת משתמש", broker_preference: "העדפת סוכן", office_preference: "העדפת משרד",
  working_style: "סגנון עבודה", favorite_area: "אזור מועדף", faq: "שאלה נפוצה",
  pinned_intelligence: "מודיעין מוצמד", dismissed_insight: "תובנה שנדחתה",
  decision: "החלטה", rule: "כלל", manual_note: "הערה ידנית", context: "הקשר",
};
export const VISIBILITY_LABELS: Record<MemoryVisibility, string> = {
  private: "פרטי", office: "משרד", organization: "ארגון", system: "מערכת",
};

// Never store secrets.
const SECRET_KEYS = new Set(["api_key", "apikey", "password", "passwd", "token", "secret", "access_token", "refresh_token", "private_key", "client_secret"]);
const SECRET_TEXT = [/sk-[a-z0-9]{16,}/i, /bearer\s+[a-z0-9._-]{16,}/i, /api[_-]?key/i, /password\s*[:=]/i];

export function deepStripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepStripSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.has(k.toLowerCase())) continue;
      out[k] = deepStripSecrets(v);
    }
    return out;
  }
  return value;
}

export function looksLikeSecret(text: string): boolean {
  return SECRET_TEXT.some((re) => re.test(text));
}

export interface MemorySchemaResult { ok: boolean; errors: string[]; value: Record<string, unknown> }

export function validateMemoryInput(input: AiMemoryInput): MemorySchemaResult {
  const errors: string[] = [];
  if (!input.title || !input.title.trim()) errors.push("missing title");
  if (!MEMORY_TYPES.has(input.memoryType)) errors.push(`invalid memory_type: ${input.memoryType}`);
  if (input.visibility && !VISIBILITIES.has(input.visibility)) errors.push(`invalid visibility: ${input.visibility}`);
  if (input.sourceType && !SOURCES.has(input.sourceType)) errors.push(`invalid source_type: ${input.sourceType}`);
  if (typeof input.confidence === "number" && (input.confidence < 0 || input.confidence > 100)) errors.push("confidence out of range");
  if (looksLikeSecret(input.title) || (input.summary && looksLikeSecret(input.summary))) errors.push("memory must not contain secrets");

  const value = deepStripSecrets(input.value ?? {}) as Record<string, unknown>;
  return { ok: errors.length === 0, errors, value };
}

export function isValidSource(s: string): s is MemorySource { return SOURCES.has(s); }
