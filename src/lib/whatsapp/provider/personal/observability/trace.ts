// ============================================================================
// 📊 ZONO — Personal transport TRACING (OpenTelemetry-shaped, log-backed).
// ----------------------------------------------------------------------------
// A thin span helper that times an operation, records status, emits an
// OTel-shaped span as a structured log, and observes a latency histogram. It is
// a dependency-free seam: point OTEL_EXPORTER_OTLP_ENDPOINT + an OpenTelemetry
// SDK/Collector at these spans in production; the shape (name, spanId, traceId,
// startTime, durationMs, attributes, status) maps 1:1 to an OTLP span. Adds
// visibility ONLY — the wrapped operation is unchanged. No provider/Evolution.
// ============================================================================
import crypto from "node:crypto";
import { log, type LogContext } from "./logger";
import { registry } from "./metrics";

const spanDuration = registry.histogram(
  "wa_personal_span_duration_seconds",
  "Duration of personal-transport operations (span), by op + status",
);

const id = (n: number) => crypto.randomBytes(n).toString("hex");

export interface SpanAttrs { op: string; ctx?: LogContext; attributes?: Record<string, unknown> }

/** Run `fn` inside a timed span. Emits a span log + latency histogram sample,
 *  tagging ok/error. Never swallows the error — it re-throws after recording. */
export async function withSpan<T>(attrs: SpanAttrs, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const traceId = id(16), spanId = id(8);
  try {
    const result = await fn();
    finish("ok", attrs, traceId, spanId, start);
    return result;
  } catch (e) {
    finish("error", attrs, traceId, spanId, start, e instanceof Error ? e.name : "error");
    throw e;
  }
}

function finish(status: "ok" | "error", attrs: SpanAttrs, traceId: string, spanId: string, startMs: number, errKind?: string): void {
  const durationMs = Date.now() - startMs;
  spanDuration.observe(durationMs / 1000, { op: attrs.op, status });
  log.info("span", attrs.ctx ?? {}, {
    span_name: attrs.op, trace_id: traceId, span_id: spanId,
    duration_ms: durationMs, status, ...(errKind ? { error_kind: errKind } : {}),
    ...(attrs.attributes ?? {}),
  });
}
