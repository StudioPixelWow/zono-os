// ============================================================================
// ZONO — Enterprise Reliability Platform™ public surface (pure layers only).
// Observability + reliability primitives. Server-only services import directly.
// NO business logic — the deterministic engines remain the source of truth.
// ============================================================================
export * from "./types";
export { newId, newRequestId, newTraceId, newCorrelationId, newExecutionId, isId } from "./logging/ids";
export { createLogger, setLogSink, resetLogSink, stdoutSink, redact, type Logger, type LogSink } from "./logging/logger";
export { percentile, summarize, MetricsRegistry, metrics } from "./metrics/metrics";
export { startSpan, traced, type Span } from "./tracing/tracing";
export { DEFAULT_RETRY, isRetryableError, backoffDelay, decideRetry, withRetry } from "./retry/retry";
export {
  PROTECTED_PROVIDERS, DEFAULT_CIRCUIT, initialCircuit, canRequest, onSuccess, onFailure, circuitHealth,
  type ProtectedProvider,
} from "./circuit-breaker/circuit-breaker";
export {
  QUEUE_TYPES, QUEUE_LABELS, makeJob, shouldEnqueue, planClaim, onJobFailure, canCancel,
  planRecovery, planReplayDeadLetter, queueCounts, type ClaimPlan, type FailureOutcome,
} from "./queue/queue";
export { rolloutBucket, evaluateFlag, evaluateAll, defaultFlag } from "./feature-flags/flags";
export { RATE_LIMITS, decide as rateLimitDecide, RateLimiter, rateLimiter } from "./rate-limit/rate-limit";
export {
  HEALTH_COMPONENTS, rollupHealth, buildHealthReport, statusFromLatency,
  loadLevel, degradationPlan, type LoadLevel, type DegradationPlan,
} from "./health/health";
export { buildPlatformAlerts, type AlertInput } from "./alerts/alerts";
