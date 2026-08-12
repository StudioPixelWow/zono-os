// ============================================================================
// ZONO — P6.1 AI Usage & Cost QA (deterministic, pure-model).
// Proves the canonical AI-usage contract without touching the DB or a provider:
//   · feature validation · provider/model normalization · request types
//   · token math (input/output/total, nulls, negatives) · cost UNAVAILABLE honesty
//   · safe error categories · no prompt/secret keys permitted
// Run: npx tsx scripts/platform-ai-usage-qa.ts
// ============================================================================
import {
  isValidFeature, isValidRequestType, normalizeProvider, normalizeModel,
  reconcileTokens, resolveCost, normalizeErrorCategory, sanitizeAiMetadata,
  FORBIDDEN_AI_KEYS, AI_FEATURES,
} from "../src/lib/ai-usage/model";

let failed = 0;
function ok(cond: boolean, label: string) { if (cond) console.log("  ✓ " + label); else { console.log("  ✗ " + label); failed++; } }

console.log("P6.1 · feature validation");
ok(isValidFeature("ai_copilot"), "ai_copilot is a valid feature");
ok(isValidFeature(AI_FEATURES.image_generation), "image_generation is valid");
ok(!isValidFeature("home_page"), "arbitrary page name rejected");
ok(!isValidFeature(""), "empty feature rejected");

console.log("\nP6.1 · provider normalization");
ok(normalizeProvider("claude-3-5-sonnet-latest") === "anthropic", "claude → anthropic");
ok(normalizeProvider("gpt-4o-mini") === "openai", "gpt-4o-mini → openai");
ok(normalizeProvider("OpenAI") === "openai", "OpenAI → openai");
ok(normalizeProvider("gemini-2.0-flash") === "gemini", "gemini → gemini");
ok(normalizeProvider("imagen-3.0-generate-002") === "gemini", "imagen → gemini");
ok(normalizeProvider("") === "unknown", "empty provider → unknown");
ok(normalizeProvider("mystery-llm") === "unknown", "unknown provider → unknown");

console.log("\nP6.1 · model + request-type normalization");
ok(normalizeModel("models/gemini-2.0-flash") === "gemini-2.0-flash", "strips models/ prefix + lowercases");
ok(normalizeModel("  GPT-4o  ") === "gpt-4o", "trims + lowercases");
ok(normalizeModel(null) === "unknown", "null model → unknown");
ok(isValidRequestType("vision") && isValidRequestType("image") && !isValidRequestType("nonsense"), "request types validated");

console.log("\nP6.1 · token math (provider-reported only)");
let t = reconcileTokens(100, 40, undefined);
ok(t.input === 100 && t.output === 40 && t.total === 140, "input+output → total (140)");
t = reconcileTokens(null, null, 250);
ok(t.total === 250 && t.input === null && t.output === null, "provider total kept when split absent");
t = reconcileTokens(-5, 10, undefined);
ok(t.input === null && t.output === 10 && t.total === 10, "negative token → null; partial sum");
t = reconcileTokens(undefined, undefined, undefined);
ok(t.input === null && t.output === null && t.total === null, "all-absent → all null (unavailable)");

console.log("\nP6.1 · cost honesty (no authoritative source → UNAVAILABLE)");
let c = resolveCost(reconcileTokens(1000, 500), null);
ok(c.costAmount === null && c.basis === "unavailable", "no source → cost NULL, basis unavailable (no fabrication)");
c = resolveCost(reconcileTokens(1000, 500), { amount: 0.0123, currency: "USD" });
ok(c.costAmount === 0.0123 && c.basis === "provider_reported", "authoritative source → cost recorded, basis provider_reported");

console.log("\nP6.1 · safe error categories (never raw payloads)");
ok(normalizeErrorCategory(new Error("Request timed out after 12000ms")) === "timeout", "timeout");
ok(normalizeErrorCategory("429 Too Many Requests") === "rate_limit", "rate_limit");
ok(normalizeErrorCategory("401 Unauthorized: invalid api key") === "auth", "auth");
ok(normalizeErrorCategory("insufficient_quota / billing") === "quota", "quota");
ok(normalizeErrorCategory("500 internal server error overloaded") === "provider_error", "provider_error");
ok(normalizeErrorCategory("") === "unknown", "empty → unknown");

console.log("\nP6.1 · privacy — no AI content/secrets in records");
ok(FORBIDDEN_AI_KEYS.includes("prompt") && FORBIDDEN_AI_KEYS.includes("completion") && FORBIDDEN_AI_KEYS.includes("api_key"), "forbidden-key list covers prompt/completion/api_key");
const meta = sanitizeAiMetadata({ prompt: "secret question", completion: "answer", api_key: "sk-x", feature: "ok", attempt: 2 });
ok(meta.prompt === "[omitted]" || meta.prompt === undefined, "prompt not stored verbatim");
ok(meta.api_key === "[redacted]" || meta.api_key === undefined, "api_key not stored verbatim");
ok(meta.attempt === 2 && meta.feature === "ok", "safe scalar metadata preserved");

console.log("");
if (failed === 0) console.log("ALL CHECKS PASSED");
else { console.log(`${failed} CHECK(S) FAILED`); process.exit(1); }
