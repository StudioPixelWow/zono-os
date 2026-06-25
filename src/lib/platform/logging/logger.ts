// ============================================================================
// ZONO — structured logger (pure core + pluggable sink). Production paths log
// THROUGH this, never raw console.log. Every record carries timestamp, severity,
// module, org, user, requestId, traceId and optional duration. Secrets are
// redacted. The sink is swappable (stdout JSON in prod, pretty in dev, capture
// in tests) so the core stays deterministic and testable.
// ============================================================================
import type { LogContext, LogRecord, Severity } from "../types";

const SEVERITY_RANK: Record<Severity, number> = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };

// Keys whose values must never be logged (defence-in-depth).
const SECRET_KEYS = /(secret|token|api[_-]?key|password|authorization|service[_-]?role|bearer|cookie)/i;
const SECRET_VALUE = /\b(sk-[a-z0-9]{12,}|eyJ[a-z0-9_.-]{20,}|bearer\s+\S+)\b/i;

export function redact(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return SECRET_VALUE.test(value) ? "[redacted]" : value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(v);
    }
    return out;
  }
  return value;
}

export type LogSink = (record: LogRecord) => void;

/** Default sink: structured JSON to stdout for error+, suppressed below `warn`
 *  unless ZONO_LOG_DEBUG is set. Never throws. */
export const stdoutSink: LogSink = (record) => {
  try {
    const minOut: Severity = (typeof process !== "undefined" && process.env?.ZONO_LOG_DEBUG) ? "debug" : "info";
    if (SEVERITY_RANK[record.severity] < SEVERITY_RANK[minOut]) return;
    (record.severity === "error" || record.severity === "fatal" ? console.error : console.log)(JSON.stringify(record));
  } catch { /* logging must never crash a request */ }
};

let activeSink: LogSink = stdoutSink;
export function setLogSink(sink: LogSink): void { activeSink = sink; }
export function resetLogSink(): void { activeSink = stdoutSink; }

export interface Logger {
  child(ctx: Partial<LogContext>): Logger;
  log(severity: Severity, message: string, opts?: { durationMs?: number; detail?: Record<string, unknown> }): LogRecord;
  debug(message: string, detail?: Record<string, unknown>): LogRecord;
  info(message: string, detail?: Record<string, unknown>): LogRecord;
  warn(message: string, detail?: Record<string, unknown>): LogRecord;
  error(message: string, detail?: Record<string, unknown>): LogRecord;
  fatal(message: string, detail?: Record<string, unknown>): LogRecord;
  /** Time an async op and log its duration + outcome. */
  time<T>(message: string, fn: () => Promise<T>): Promise<T>;
}

/** Build a structured logger bound to a context. Pure record construction; the
 *  side effect is the (swappable) sink. */
export function createLogger(ctx: LogContext, sink: LogSink = activeSink): Logger {
  const emit = (severity: Severity, message: string, opts?: { durationMs?: number; detail?: Record<string, unknown> }): LogRecord => {
    const record: LogRecord = {
      ...ctx,
      timestamp: new Date().toISOString(),
      severity,
      message,
      durationMs: opts?.durationMs,
      detail: opts?.detail ? (redact(opts.detail) as Record<string, unknown>) : undefined,
    };
    sink(record);
    return record;
  };
  const logger: Logger = {
    child: (extra) => createLogger({ ...ctx, ...extra }, sink),
    log: emit,
    debug: (m, d) => emit("debug", m, { detail: d }),
    info: (m, d) => emit("info", m, { detail: d }),
    warn: (m, d) => emit("warn", m, { detail: d }),
    error: (m, d) => emit("error", m, { detail: d }),
    fatal: (m, d) => emit("fatal", m, { detail: d }),
    time: async (message, fn) => {
      const t0 = Date.now();
      try { const r = await fn(); emit("info", message, { durationMs: Date.now() - t0, detail: { outcome: "ok" } }); return r; }
      catch (e) { emit("error", message, { durationMs: Date.now() - t0, detail: { outcome: "error", error: e instanceof Error ? e.message : String(e) } }); throw e; }
    },
  };
  return logger;
}
