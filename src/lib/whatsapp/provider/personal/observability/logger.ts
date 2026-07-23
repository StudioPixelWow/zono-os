// ============================================================================
// 📊 ZONO — Personal transport STRUCTURED LOGGER (JSON, redacted).
// ----------------------------------------------------------------------------
// Emits one JSON object per line to stdout — ready for Loki/Datadog/CloudWatch
// and log-based metrics. Correlation fields (org, agent, session_ref, event) let
// an issue be traced end-to-end WITHOUT exposing secrets. HARD redaction: token,
// QR, apikey, authorization, credential, and raw message bodies/text are never
// logged. Transport-generic — no provider/Evolution name.
// ============================================================================

type Level = "debug" | "info" | "warn" | "error";

const REDACT = /token|apikey|authorization|credential|qr|password|secret|\bbody\b|\btext\b|message_body/i;

/** Drop any field whose key looks sensitive; never emit message content. */
function safeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT.test(k)) { out[k] = "[redacted]"; continue; }
    if (typeof v === "string" && v.length > 300) { out[k] = `${v.slice(0, 60)}…[${v.length}]`; continue; }
    out[k] = v;
  }
  return out;
}

export interface LogContext { org?: string; agent?: string; sessionRef?: string | null }

function emit(level: Level, event: string, ctx: LogContext, fields: Record<string, unknown>): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    component: "whatsapp.personal",
    event,
    org: ctx.org ?? null,
    agent: ctx.agent ?? null,
    session_ref: ctx.sessionRef ?? null,
    ...safeFields(fields),
  };
  const s = JSON.stringify(line);
  if (level === "error") console.error(s);
  else if (level === "warn") console.warn(s);
  else console.log(s);
}

export const log = {
  debug: (event: string, ctx: LogContext = {}, fields: Record<string, unknown> = {}) => emit("debug", event, ctx, fields),
  info: (event: string, ctx: LogContext = {}, fields: Record<string, unknown> = {}) => emit("info", event, ctx, fields),
  warn: (event: string, ctx: LogContext = {}, fields: Record<string, unknown> = {}) => emit("warn", event, ctx, fields),
  error: (event: string, ctx: LogContext = {}, fields: Record<string, unknown> = {}) => emit("error", event, ctx, fields),
};

export { safeFields };
