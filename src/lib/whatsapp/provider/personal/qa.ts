// ============================================================================
// 📘 ZONO OS — Batch 6.6A · PERSONAL WHATSAPP BRIDGE — SELF TEST.
//
// Runnable gate: `npx tsx src/lib/whatsapp/provider/personal/qa.ts`.
// A) Behavioral tests of the C9 compat layer (pure mappers: status, number,
//    requests, responses, webhooks, errors, instance roundtrip).
// B) Contract tests over representative Evolution payload FIXTURES — proving only
//    the compat layer needs to change if Evolution's shapes drift.
// C) Source guards locking the security + architecture invariants: fail-closed
//    webhook, C10 kill switch at every entry point, approval-gated + rate-limited
//    outbound, no secret/QR/body logging, Evolution sealed in the adapter, no new
//    conversation/message model, registry resolves the personal provider.
// Exits non-zero on any failure. Live pairing/inbound/outbound are BLOCKED here
// (need a running worker + real number) and are NOT asserted as passing.
// ============================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeState, normalizeWebhookState } from "./compat/status";
import { normalizeNumber, buildSendText, buildPresence, buildCreateInstance } from "./compat/requests";
import { fromSend, fromConnect, fromConnectionState } from "./compat/responses";
import { normalizeWebhook } from "./compat/webhooks";
import { classifyHttp } from "./compat/errors";
import { instanceName, ctxFromInstance } from "./compat/instance";
import { registry as metricsRegistry } from "./observability/metrics";
import { safeFields } from "./observability/logger";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.error("  ✗ " + name); } };

console.log("\nPersonal WhatsApp Bridge (6.6A) — SELF TEST\n");

// ── A) Behavioral — C9 compat mappers ───────────────────────────────────────
check("A1 status: open→connected, close(+qr)→waiting_qr, unknown→error",
  normalizeState("open", false) === "connected" && normalizeState("close", true) === "waiting_qr" &&
  normalizeState("close", false) === "disconnected" && normalizeState("weird", false) === "error");
check("A2 status never fabricates 'connected' from unknown",
  normalizeState("???", false) !== "connected" && normalizeState("", true) === "waiting_qr");
check("A3 webhook state map: open→connected, connecting→connecting, close→disconnected",
  normalizeWebhookState("open") === "connected" && normalizeWebhookState("connecting") === "connecting" && normalizeWebhookState("close") === "disconnected");
check("A4 number normalization: 05x→972x, strips +/spaces, keeps intl",
  normalizeNumber("050-123 4567") === "972501234567" && normalizeNumber("+972541112222") === "972541112222" && normalizeNumber("00972541112222") === "972541112222");
check("A5 sendText body maps to {number,text}", (() => { const b = buildSendText({ toPhone: "0501234567", text: "hi" }); return b.number === "972501234567" && b.text === "hi"; })());
check("A6 presence body: composing when on, paused when off", buildPresence("0501234567", true).presence === "composing" && buildPresence("0501234567", false).presence === "paused");
check("A7 create-instance sets Baileys integration + qrcode + webhook events + auth header when token", (() => {
  const b = buildCreateInstance("zono__o__u", "https://z/api/whatsapp/personal/webhook", "tok") as { integration: string; qrcode: boolean; webhook: { url: string; events: string[]; headers?: { authorization?: string } } };
  return b.integration === "WHATSAPP-BAILEYS" && b.qrcode === true && b.webhook.events.includes("MESSAGES_UPSERT") && b.webhook.headers?.authorization === "Bearer tok";
})());
check("A8 create-instance omits auth header when no token", (() => {
  const b = buildCreateInstance("i", "https://z/w") as { webhook: { headers?: unknown } };
  return b.webhook.headers === undefined;
})());
check("A9 send result: id→ok+providerMessageId, missing id→fail",
  fromSend({ key: { id: "M1" } }).ok === true && fromSend({}).ok === false);
check("A10 connect response with QR → waiting_qr + carries image/raw", (() => {
  const c = fromConnect({ base64: "data:image/png;base64,AAAA", code: "raw-qr" }, "2026-07-23T00:00:00.000Z");
  return c.state === "waiting_qr" && c.qr?.image === "data:image/png;base64,AAAA" && c.qr?.raw === "raw-qr" && !!c.qr?.expiresAt;
})());
check("A11 connectionState 'open' → connected (no QR)", fromConnectionState({ instance: { state: "open" } }).state === "connected");
check("A12 error classify: 401→auth, 404→not_found, 429→rate_limited", classifyHttp(401, "").category === "auth" && classifyHttp(404, "").category === "not_found" && classifyHttp(429, "").category === "rate_limited");
check("A13 instance name roundtrips (org,user) and rejects foreign", (() => {
  const n = instanceName({ orgId: "o1", userId: "u1" });
  const back = ctxFromInstance(n);
  return back?.orgId === "o1" && back?.userId === "u1" && ctxFromInstance("someoneElse") === null;
})());

// ── B) Contract tests — representative Evolution FIXTURES → canonical ─────────
const NOW = "2026-07-23T12:00:00.000Z";
const fxInbound = { event: "messages.upsert", instance: instanceName({ orgId: "O", userId: "U" }),
  data: { key: { id: "WA1", remoteJid: "972501112222@s.whatsapp.net", fromMe: false }, pushName: "דנה", messageTimestamp: 1770000000, message: { conversation: "שלום" } } };
check("B1 fixture inbound text → canonical message with sender/text/id + owning ctx", (() => {
  const r = normalizeWebhook(fxInbound, NOW);
  return r.kind === "message" && r.ctx.orgId === "O" && r.ctx.userId === "U" && r.message.fromPhone === "972501112222" && r.message.text === "שלום" && r.message.providerMessageId === "WA1";
})());
check("B2 fixture fromMe echo → ignored (no self-ingest)", normalizeWebhook({ ...fxInbound, data: { ...fxInbound.data, key: { ...fxInbound.data.key, fromMe: true } } }, NOW).kind === "ignore");
check("B3 fixture group message → ignored", normalizeWebhook({ ...fxInbound, data: { ...fxInbound.data, key: { ...fxInbound.data.key, remoteJid: "12345-67@g.us" } } }, NOW).kind === "ignore");
check("B4 fixture unknown instance → ignored (ownership resolves to null)", normalizeWebhook({ ...fxInbound, instance: "not-a-zono-instance" }, NOW).kind === "ignore");
check("B5 fixture connection.update open → status connected", (() => { const r = normalizeWebhook({ event: "connection.update", instance: instanceName({ orgId: "O", userId: "U" }), data: { state: "open" } }, NOW); return r.kind === "status" && r.state === "connected"; })());
check("B6 fixture qrcode.updated → status waiting_qr", (() => { const r = normalizeWebhook({ event: "qrcode.updated", instance: instanceName({ orgId: "O", userId: "U" }), data: {} }, NOW); return r.kind === "status" && r.state === "waiting_qr"; })());
check("B7 extended-text fixture maps text", (() => { const r = normalizeWebhook({ ...fxInbound, data: { ...fxInbound.data, message: { extendedTextMessage: { text: "היי" } } } }, NOW); return r.kind === "message" && r.message.text === "היי"; })());

// ── C) Source guards — security + architecture invariants ────────────────────
const adapter = read("src/lib/whatsapp/provider/personal/adapter.ts");
const outbound = read("src/lib/whatsapp/provider/personal/outbound.ts");
const flag = read("src/lib/whatsapp/provider/personal-flag.ts");
const webhookRoute = read("src/app/api/whatsapp/personal/webhook/route.ts");
const registry = read("src/lib/whatsapp/provider/registry.ts");
const disclosure = read("src/lib/whatsapp/provider/personal/disclosure.ts");
const eslint = read("eslint.config.mjs");
const guard = read("scripts/check-whatsapp-personal-boundaries.mjs");

check("C1 C10 kill switch enforced in adapter connect/generateQR/sendMessage",
  /connect\(ctx\)[\s\S]{0,120}isPersonalWhatsappEnabled/.test(adapter) && (adapter.match(/isPersonalWhatsappEnabled\(\)/g) ?? []).length >= 3);
check("C2 disconnect/delete stay allowed when disabled (no kill-switch gate on teardown)",
  /async disconnect\(ctx\)[\s\S]{0,220}clearSession/.test(adapter) && !/async disconnect\(ctx\)[\s\S]{0,120}isPersonalWhatsappEnabled/.test(adapter));
check("C3 webhook route authorizes FAIL-CLOSED (no token → false, 403)",
  /if \(!token\) return false/.test(strip(webhookRoute)) && webhookRoute.includes("status: 403"));
check("C4 disabled webhook policy: authenticate → ack 200, NO side effects, no content log",
  /isPersonalWhatsappEnabled\(\)/.test(webhookRoute) && /disabled: true/.test(webhookRoute) && !/body\.message|\.text/.test(strip(webhookRoute).split("isPersonalWhatsappEnabled")[1] ?? ""));
check("C5 outbound requires explicit approval + idempotency key",
  outbound.includes("approval_required") && /if \(!input\.approved\)/.test(outbound) && outbound.includes("idempotency_key"));
check("C6 outbound applies cooldown + burst + sustained rate limits",
  outbound.includes("cooldown") && outbound.includes("burst_limited") && outbound.includes("rate_limited"));
check("C7 kill switch is transport-generic (personal-flag CODE names no provider/Evolution)",
  !/evolution|baileys/i.test(strip(flag)));
check("C8 no token / QR / message-body logging in personal adapter+outbound",
  ![adapter, outbound].some((f) => /console\.(log|error|warn)\([^)]*(token|qr|\.text|body:)/i.test(f)));
check("C9 registry resolves the Personal provider for the bridge kind (single resolver)",
  registry.includes("personalTransportProvider") && /case "bridge":[\s\S]{0,80}personalTransportProvider/.test(strip(registry)));
check("C10 ESLint bans importing adapter/compat internals outside the provider dir",
  eslint.includes("no-restricted-imports") && eslint.includes("provider/personal/compat"));
check("C11 boundary guard exists and seals Evolution identifiers to the adapter",
  guard.includes("EVO_IDENTIFIERS") && guard.includes("EVO_FRAGMENTS"));
check("C12 disclosure gate stores version + audits WITHOUT QR/credentials",
  disclosure.includes("DISCLOSURE_VERSION") && disclosure.includes("logAudit") && !/qr|access_token|credential/i.test(strip(disclosure)));
check("C13 NO new conversation/message model — personal reuses canonical tables via ingest",
  outbound.includes("whatsapp_conversations") && outbound.includes("whatsapp_messages") && !/interface Conversation|interface Message/.test(outbound + adapter));
check("C14 personal transport registered in the journey Tier-A boundary (no journey reads)",
  read("scripts/check-journey-boundaries.mjs").includes('"src/lib/whatsapp/provider"'));

// ── D) Observability (6.6A.1) — visibility only, no architecture change ──────
const metricsRoute = read("src/app/api/whatsapp/personal/metrics/route.ts");
const obsIndex = read("src/lib/whatsapp/provider/personal/observability/index.ts");
const metricsLib = read("src/lib/whatsapp/provider/personal/observability/metrics.ts");
const logger = read("src/lib/whatsapp/provider/personal/observability/logger.ts");
const webhookRt = read("src/app/api/whatsapp/personal/webhook/route.ts");

check("D1 metrics registry renders Prometheus text with HELP/TYPE after inc", (() => {
  const c = metricsRegistry.counter("wa_qa_probe_total", "probe"); c.inc({ outcome: "ok" }); c.inc({ outcome: "ok" });
  const out = metricsRegistry.render();
  return out.includes("# HELP wa_qa_probe_total") && out.includes("# TYPE wa_qa_probe_total counter") && /wa_qa_probe_total\{outcome="ok"\} 2/.test(out);
})());
check("D2 histogram buckets are cumulative + monotonic (le≥value counts 1, below counts 0, +Inf=count)", (() => {
  const h = metricsRegistry.histogram("wa_qa_lat_seconds", "probe"); h.observe(0.2, { op: "x" });
  const out = metricsRegistry.render();
  const has = (le: string, n: number) => out.includes(`wa_qa_lat_seconds_bucket{le="${le}",op="x"} ${n}`);
  return has("0.1", 0) && has("0.25", 1) && has("0.5", 1) && has("+Inf", 1) &&
    out.includes('wa_qa_lat_seconds_sum{op="x"} 0.2') && out.includes('wa_qa_lat_seconds_count{op="x"} 1');
})());
check("D3 logger redaction strips secret-ish keys + message content", (() => {
  const s = safeFields({ token: "abc", qr: "img", text: "hello", body: "x", outcome: "sent", org: "O" });
  return s.token === "[redacted]" && s.qr === "[redacted]" && s.text === "[redacted]" && s.body === "[redacted]" && s.outcome === "sent" && s.org === "O";
})());
check("D4 metrics endpoint fail-closed bearer auth (403)", /if \(!token\) return false/.test(strip(metricsRoute)) && metricsRoute.includes("status: 403"));
check("D5 observability is transport-generic (names no provider/Evolution)", !/evolution|baileys/i.test(strip(obsIndex + metricsLib + logger)));
check("D6 entry points ARE instrumented (adapter connect + outbound + webhook + reconnect)",
  adapter.includes("recordConnect(") && outbound.includes("recordOutbound(") && webhookRt.includes("recordInbound(") && read("src/lib/whatsapp/provider/personal/actions.ts").includes("recordReconnect("));
check("D7 NO architecture change — kill switch + no model duplication still hold with instrumentation",
  adapter.includes("isPersonalWhatsappEnabled") && !/interface Conversation|interface Message|create table/i.test(adapter + outbound + obsIndex));
check("D8 span helper is OTel-shaped (trace_id/span_id/duration/status)", (() => {
  const trace = read("src/lib/whatsapp/provider/personal/observability/trace.ts");
  return /trace_id/.test(trace) && /span_id/.test(trace) && /duration_ms/.test(trace) && /status/.test(trace);
})());

// ── E) SRE completion (6.6A.2) — synthetic monitoring + error budget ─────────
const synthetic = read("src/lib/whatsapp/provider/personal/synthetic.ts");
const synthRoute = read("src/app/api/whatsapp/personal/synthetic/route.ts");
const metricsRoute2 = read("src/app/api/whatsapp/personal/metrics/route.ts");
const rules = read("infra/evolution/observability/prometheus/rules.yml");
const promCfg = read("infra/evolution/observability/prometheus/prometheus.yml");

check("E1 render filter: include renders only matching family, exclude drops it", (() => {
  const g = metricsRegistry.gauge("wa_personal_synthetic_up", "x"); g.set(1);
  const inc = metricsRegistry.render({ include: "wa_personal_synthetic" });
  const exc = metricsRegistry.render({ exclude: "wa_personal_synthetic" });
  return inc.includes("wa_personal_synthetic_up") && !exc.includes("wa_personal_synthetic_up");
})());
check("E2 synthetic monitor NEVER creates a session (no connect/generateQR/createSession/sendMessage)",
  !/generateQR|createSession|sendMessage|\bconnect\(/.test(strip(synthetic)));
check("E3 synthetic checks all 7 readiness signals",
  ["registry_resolution", "adapter_availability", "authentication_path", "webhook_endpoint", "metrics_endpoint", "worker_health", "kill_switch"].every((c) => synthetic.includes(c)));
check("E4 synthetic uses the READ-ONLY neutral worker health (not a session op)",
  synthetic.includes("personalWorkerHealth") && !synthetic.includes("personalConnectAction"));
check("E5 synthetic route fail-closed bearer auth (403) + returns synthetic metrics only",
  /if \(!token\) return false/.test(strip(synthRoute)) && synthRoute.includes("status: 403") && synthRoute.includes('include: "wa_personal_synthetic"'));
check("E6 /metrics EXCLUDES synthetic series (no duplicate series across jobs)",
  metricsRoute2.includes('exclude: "wa_personal_synthetic"'));
check("E7 synthetic module is boundary-clean (no Evolution identifier)",
  !/evolution|baileys/i.test(strip(synthetic + synthRoute)));
check("E8 error-budget recording rules + 50% freeze + 100% stop alerts present",
  rules.includes("error_budget_consumed30d") && rules.includes("PersonalErrorBudget50pct") && rules.includes("PersonalErrorBudget100pct"));
check("E9 synthetic alerts defined (down / per-check / stale)",
  rules.includes("PersonalSyntheticDown") && rules.includes("PersonalSyntheticCheckFailing") && rules.includes("PersonalSyntheticStale"));
check("E10 prometheus scrapes the synthetic endpoint every 5m",
  /job_name: zono-wa-personal-synthetic[\s\S]{0,120}scrape_interval: 5m/.test(promCfg) && promCfg.includes("/api/whatsapp/personal/synthetic"));
check("E11 SRE is operations-only — no new provider/model, worker ping is read-only compat",
  read("src/lib/whatsapp/provider/personal/compat/index.ts").includes("workerPing") && !/interface Conversation|interface Message/.test(synthetic));

console.log(`\nPersonal WhatsApp Bridge (6.6A + 6.6A.1 + 6.6A.2) SELF TEST: ${passed} passed, ${failed} failed`);
console.log("(Live pairing / inbound / outbound = BLOCKED — require a running Evolution worker + a real WhatsApp number.)\n");
if (failed > 0) process.exit(1);
