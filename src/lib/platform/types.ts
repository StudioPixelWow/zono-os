// ============================================================================
// ZONO — Enterprise Reliability Platform™ types (Phase 20, client-safe, no I/O).
// Production-grade infrastructure: structured logging, metrics, health, queues,
// retries, circuit breakers, feature flags, rate limits. NO business logic.
// ============================================================================

export type Severity = "debug" | "info" | "warn" | "error" | "fatal";
export type HealthStatus = "healthy" | "warning" | "critical" | "unknown";

// ── Logging context (every structured log carries this) ──────────────────────
export interface LogContext {
  requestId?: string;
  traceId?: string;
  correlationId?: string;
  executionId?: string;
  journeyId?: string;
  propertyId?: string;
  providerId?: string;
  module: string;
  orgId?: string | null;
  userId?: string | null;
}

export interface LogRecord extends LogContext {
  timestamp: string;
  severity: Severity;
  message: string;
  durationMs?: number;
  detail?: Record<string, unknown>;
}

// ── Metrics ──────────────────────────────────────────────────────────────────
export interface LatencySummary {
  metric: string;
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

// ── Health ─────────────────────────────────────────────────────────────────--
export interface HealthComponent {
  key: string;
  label: string;
  status: HealthStatus;
  detail?: string;
  latencyMs?: number | null;
}
export interface HealthReport {
  overall: HealthStatus;
  components: HealthComponent[];
  generatedAt: string;
}

// ── Queue ──────────────────────────────────────────────────────────────────--
export type QueueType =
  | "property_sync" | "market_refresh" | "journey" | "ai" | "reports" | "snapshots" | "notifications";
export type JobStatus = "pending" | "claimed" | "running" | "done" | "failed" | "dead" | "cancelled";

export interface QueueJob {
  id: string;
  queue: QueueType;
  status: JobStatus;
  priority: number;          // lower = higher priority
  attempts: number;
  maxAttempts: number;
  runAt: string;             // ISO; scheduled time
  idempotencyKey: string | null;
  payload?: Record<string, unknown>;
}

// ── Retry ──────────────────────────────────────────────────────────────────--
export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;       // 0..1
}
export interface RetryDecision {
  retry: boolean;
  attempt: number;
  delayMs: number;
  reason: string;
}

// ── Circuit breaker ─────────────────────────────────────────────────────────-
export type CircuitState = "closed" | "open" | "half_open";
export interface CircuitConfig {
  failureThreshold: number;  // consecutive failures to open
  cooldownMs: number;        // open → half_open after this
  halfOpenProbes: number;    // successes in half_open to close
}
export interface CircuitSnapshot {
  provider: string;
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
  probeSuccesses: number;
}

// ── Feature flags ───────────────────────────────────────────────────────────-
export interface FeatureFlag {
  key: string;
  enabled: boolean;
  environments: string[];        // ["production","preview",...] empty = all
  orgIds: string[];              // empty = all orgs
  roles: string[];               // empty = all roles
  userIds: string[];             // empty = all users
  rolloutPercent: number;        // 0..100 gradual rollout
}
export interface FlagContext {
  environment: string;
  orgId?: string | null;
  roleKey?: string | null;
  userId?: string | null;
}

// ── Rate limit ─────────────────────────────────────────────────────────────--
export type RateLimitDomain = "ai" | "sync" | "cron" | "reports" | "exports" | "auth";
export interface RateLimitConfig { limit: number; windowMs: number }
export interface RateLimitDecision { allowed: boolean; remaining: number; resetMs: number; retryAfterMs: number }

// ── Alerts ─────────────────────────────────────────────────────────────────--
export interface PlatformAlert {
  key: string;
  severity: "warning" | "critical";
  title: string;
  detail: string;
}

// ── Audit ──────────────────────────────────────────────────────────────────--
export interface AuditEntry {
  actorUserId: string | null;
  orgId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  source: string;
  correlationId: string | null;
}
