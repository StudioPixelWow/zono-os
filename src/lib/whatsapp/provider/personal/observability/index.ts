// ============================================================================
// 📊 ZONO — Personal transport OBSERVABILITY surface (server-only).
// ----------------------------------------------------------------------------
// Defines the named metric instruments and the emit helpers used to instrument
// the adapter/outbound/webhook/actions. Each helper updates a Prometheus metric
// AND emits a structured log line (redacted). Everything here is transport-
// generic — it names no provider/Evolution — and adds VISIBILITY ONLY. Per-agent
// cardinality is bounded by the Beta session cap.
// ============================================================================
import "server-only";
import { registry } from "./metrics";
import { log, type LogContext } from "./logger";

export { registry } from "./metrics";
export { log } from "./logger";
export { withSpan } from "./trace";

// ── Instruments ──────────────────────────────────────────────────────────────
const connectTotal = registry.counter("wa_personal_connect_total", "Personal connect attempts by outcome");
const qrTotal = registry.counter("wa_personal_qr_generated_total", "Personal QR generations by outcome");
const reconnectTotal = registry.counter("wa_personal_reconnect_total", "Personal reconnect attempts by outcome");
const outboundTotal = registry.counter("wa_personal_outbound_total", "Personal outbound sends by outcome");
const inboundTotal = registry.counter("wa_personal_inbound_total", "Personal inbound webhook events by outcome");
const authFailures = registry.counter("wa_personal_webhook_auth_failures_total", "Personal webhook auth failures (fail-closed)");
const opErrors = registry.counter("wa_personal_operation_errors_total", "Personal transport operation errors by op + category");
const ackTotal = registry.counter("wa_personal_disclosure_ack_total", "Personal Beta disclosure acknowledgements");
const switchTotal = registry.counter("wa_personal_transport_switch_total", "Per-agent transport switches by target");
const sessionUp = registry.gauge("wa_personal_session_up", "1 when an agent's personal session is connected, else 0");
const workerConfigured = registry.gauge("wa_personal_worker_configured", "1 when the personal transport backend is configured");

const lbl = (ctx?: LogContext) => ({ org: ctx?.org ?? "unknown" });

// ── Emit helpers (metric + structured log) ──────────────────────────────────
export function recordConnect(outcome: string, ctx?: LogContext): void {
  connectTotal.inc({ outcome, ...lbl(ctx) }); log.info("connect", ctx ?? {}, { outcome });
}
export function recordQr(outcome: string, ctx?: LogContext): void {
  qrTotal.inc({ outcome, ...lbl(ctx) }); log.info("qr_generated", ctx ?? {}, { outcome });
}
export function recordReconnect(outcome: string, ctx?: LogContext): void {
  reconnectTotal.inc({ outcome, ...lbl(ctx) }); log.info("reconnect", ctx ?? {}, { outcome });
}
export function recordOutbound(outcome: string, ctx?: LogContext): void {
  outboundTotal.inc({ outcome, ...lbl(ctx) });
  (outcome === "sent" || outcome === "duplicate" ? log.info : log.warn)("outbound", ctx ?? {}, { outcome });
}
export function recordInbound(outcome: string, ctx?: LogContext): void {
  inboundTotal.inc({ outcome }); log.info("inbound", ctx ?? {}, { outcome });
}
export function recordAuthFailure(): void {
  authFailures.inc(); log.warn("webhook_auth_failure", {}, {});
}
export function recordOpError(op: string, category: string, ctx?: LogContext): void {
  opErrors.inc({ op, category, ...lbl(ctx) }); log.error("op_error", ctx ?? {}, { op, category });
}
export function recordAck(ctx?: LogContext): void { ackTotal.inc(lbl(ctx)); log.info("disclosure_ack", ctx ?? {}, {}); }
export function recordSwitch(to: string, ctx?: LogContext): void { switchTotal.inc({ to, ...lbl(ctx) }); log.info("transport_switch", ctx ?? {}, { to }); }
export function recordSessionUp(up: boolean, ctx?: LogContext): void {
  sessionUp.set(up ? 1 : 0, { org: ctx?.org ?? "unknown", agent: ctx?.agent ?? "unknown" });
}
export function setWorkerConfigured(configured: boolean): void { workerConfigured.set(configured ? 1 : 0); }
