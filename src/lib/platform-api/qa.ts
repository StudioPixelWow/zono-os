// ============================================================================
// ✅ Platform API — self-tests (pure, offline). 31.0. Part 9.
// Auth/scope, rate limits, registry↔OpenAPI coverage, webhooks, errors,
// connectors. Every action endpoint is approval-gated.
// ============================================================================
import { ENDPOINTS, findEndpoint, hasScope, withinRateLimit } from "./registry";
import { buildOpenApi } from "./openapi";
import { buildWebhookPayload, canonicalPayload } from "./webhook-payload";
import { CONNECTORS } from "./connectors";
import { ALL_SCOPES, WEBHOOK_EVENTS, API_BASE, type Scope } from "./types";

export interface PACheck { name: string; pass: boolean; detail: string }
export interface PASelfCheck { ok: boolean; total: number; passed: number; checks: PACheck[] }

export function runSelfCheck(): PASelfCheck {
  const checks: PACheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Scope checks.
  add("scope granted", hasScope(["read:buyers"], "read:buyers") === true, "");
  add("scope denied", hasScope(["read:buyers"], "read:sellers") === false, "");
  add("wildcard grants all", ALL_SCOPES.every((s) => hasScope(["*"], s)), "");
  add("admin scope explicit (not read)", hasScope(["read:ai"], "admin:keys") === false, "");

  // Endpoint registry + routing.
  add("registry non-empty", ENDPOINTS.length >= 12, `${ENDPOINTS.length}`);
  add("findEndpoint matches read", findEndpoint("GET", "/buyers")?.id === "buyers.list", "");
  add("findEndpoint POST action", findEndpoint("POST", "/missions")?.id === "missions.create", "");
  add("findEndpoint trailing slash tolerant", findEndpoint("GET", "/buyers/")?.id === "buyers.list", "");
  add("unknown endpoint → null", findEndpoint("GET", "/nope") === null, "");
  add("every endpoint has a valid scope", ENDPOINTS.every((e) => (ALL_SCOPES as Scope[]).includes(e.scope) || e.scope === "*"), "");
  add("action endpoints are approval-gated", ENDPOINTS.filter((e) => e.kind === "action").every((e) => e.approvalGated === true), "");
  add("read endpoints not approval-gated", ENDPOINTS.filter((e) => e.kind === "read").every((e) => e.approvalGated === false), "");

  // Rate limit (pure sliding window).
  const now = 1_000_000;
  add("under limit allowed", withinRateLimit([now - 100, now - 200], now, 60_000, 5).allowed === true, "");
  const full = Array.from({ length: 5 }, (_, i) => now - i * 1000);
  const r = withinRateLimit(full, now, 60_000, 5);
  add("at limit blocked + retryAfter", r.allowed === false && r.retryAfterMs > 0, `${r.retryAfterMs}`);
  add("old requests expire from window", withinRateLimit([now - 120_000], now, 60_000, 1).allowed === true, "");

  // OpenAPI covers every endpoint.
  const spec = buildOpenApi("https://app.zono") as { paths: Record<string, Record<string, unknown>>; components: { securitySchemes: Record<string, unknown> } };
  const pathCount = Object.values(spec.paths).reduce((n, ops) => n + Object.keys(ops).length, 0);
  add("openapi covers all endpoints", pathCount === ENDPOINTS.length, `${pathCount}/${ENDPOINTS.length}`);
  add("openapi has bearer security", !!spec.components.securitySchemes.apiKey, "");
  add("openapi paths under API_BASE", Object.keys(spec.paths).every((p) => p.startsWith(API_BASE)), "");

  // Webhooks.
  add("8 webhook events", WEBHOOK_EVENTS.length === 8, `${WEBHOOK_EVENTS.length}`);
  const payload = buildWebhookPayload("mission.created", "org1", { missionId: "m1" });
  add("webhook payload shape", payload.event === "mission.created" && !!payload.id && !!payload.at && payload.data.missionId === "m1", "");
  add("canonical payload stable + sorted", canonicalPayload(payload) === canonicalPayload({ ...payload }) && canonicalPayload(payload).indexOf('"at"') < canonicalPayload(payload).indexOf('"event"'), "");

  // Connectors (integration hub).
  add("connectors catalog", CONNECTORS.length === 7 && CONNECTORS.some((c) => c.id === "whatsapp") && CONNECTORS.some((c) => c.id === "automation"), "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
