// ============================================================================
// ZONO — lightweight tracing spans (pure). Measure durations and attach them to
// the metrics registry + a correlation/trace id, with no external tracer.
// ============================================================================
import { metrics } from "../metrics/metrics";
import { newTraceId } from "../logging/ids";

export interface Span {
  name: string;
  traceId: string;
  startedAtMs: number;
  end(): number;
}

export function startSpan(name: string, traceId: string = newTraceId()): Span {
  const startedAtMs = Date.now();
  return {
    name, traceId, startedAtMs,
    end() { const d = Date.now() - startedAtMs; metrics.record(`span.${name}`, d); return d; },
  };
}

/** Trace an async op: records latency under `span.<name>` and returns its result. */
export async function traced<T>(name: string, fn: () => Promise<T>, traceId?: string): Promise<T> {
  const span = startSpan(name, traceId);
  try { return await fn(); } finally { span.end(); }
}
