// ============================================================================
// ZONO — AI prompt building + safety + cache keys (pure, client-safe).
// Prompts are ALWAYS built from a sanitized, structured context — never from raw
// DB payloads, secrets, internal ids or cross-org data. The system prompt pins
// the AI to an augmentation role (explain/recommend/generate) and forbids it
// from overriding the deterministic engines.
// ============================================================================
import type { AiKind, AiMessage } from "./types";

// Keys that must never reach a prompt.
const FORBIDDEN_KEY = /(api[_-]?key|secret|token|password|authorization|bearer|service[_-]?role|raw_?(metadata|payload|full_payload)|access[_-]?token|client[_-]?secret)/i;
// Value patterns that look like credentials.
const SECRET_VALUE = /(sk-[A-Za-z0-9_-]{10,}|Bearer\s+[A-Za-z0-9._-]{10,}|eyJ[A-Za-z0-9._-]{20,})/;

/** Recursively drop secret-ish keys + redact secret-looking strings. Pure. */
export function sanitizeContext<T>(input: T): T {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v == null) return v;
    if (typeof v === "string") return SECRET_VALUE.test(v) ? "[redacted]" : v;
    if (typeof v !== "object") return v;
    if (seen.has(v as object)) return undefined;
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(k)) continue;
      out[k] = walk(val);
    }
    return out;
  };
  return walk(input) as T;
}

/** Throw if a built prompt still contains anything credential-like. */
export function assertNoSecrets(text: string): void {
  if (SECRET_VALUE.test(text) || /service_role/i.test(text)) {
    throw new Error("prompt_safety: refusing to send a prompt containing credential-like content");
  }
}

// ── Stable hashing for cache invalidation ────────────────────────────────────
function stableStringify(obj: unknown): string {
  if (obj == null || typeof obj !== "object") return JSON.stringify(obj) ?? "null";
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`).join(",")}}`;
}
export function computeDataHash(context: unknown): string {
  const s = stableStringify(sanitizeContext(context));
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
export function buildCacheKey(kind: AiKind, entityId: string | null, dataHash: string, extra = ""): string {
  return [kind, entityId ?? "_", dataHash, extra].filter(Boolean).join(":");
}

// ── System prompt (augmentation role, Hebrew, deterministic-engine guardrail) ─
export const ZONO_SYSTEM_PROMPT =
  "אתה ZONO Copilot — עוזר AI לסוכני נדל\"ן בישראל. תפקידך לעזור: להסביר, להמליץ, לנסח, לסכם ולתעדף. " +
  "המנועים הדטרמיניסטיים של ZONO (רדאר נכסים, התאמת קונים, מודיעין מוכרים וציוני הזדמנות) הם מקור האמת היחיד — " +
  "לעולם אל תשנה ציונים, אל תחליט מי מתאים למי, ואל תמציא נתונים שלא קיבלת. השתמש אך ורק בהקשר המובנה שניתן לך. " +
  "כתוב בעברית, בטון מקצועי, תכליתי ופרקטי. אל תמליץ לבצע פעולה אוטומטית — רק להציע לסוכן.";

/** Build chat messages from a sanitized structured context + a task instruction. */
export function buildMessages(kind: AiKind, context: unknown, instruction: string): AiMessage[] {
  const safe = sanitizeContext(context);
  const block = `סוג בקשה: ${kind}\nהקשר מובנה (JSON):\n${JSON.stringify(safe, null, 2)}`;
  const user = `${block}\n\nמשימה:\n${instruction}`;
  assertNoSecrets(user);
  return [
    { role: "system", content: ZONO_SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}
