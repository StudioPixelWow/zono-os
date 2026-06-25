/**
 * LOCAL-DEV-ONLY check for the Enterprise Reliability Platform™ (Phase 20).
 * Pure layers only (no DB, no network, no server-only imports). Verifies the
 * observability + reliability primitives are deterministic and correct:
 * structured logging + redaction · metrics percentiles · retry/backoff +
 * jitter bounds · circuit breaker state machine · queue retry/DLQ/idempotency ·
 * feature-flag targeting + stable rollout · rate limiting · health rollup +
 * graceful degradation · alert ranking · id generation.
 *
 * Run: npx tsx scripts/platform-dev-check.ts
 */
import {
  newId, newRequestId, newTraceId, isId,
  createLogger, redact, setLogSink, resetLogSink,
  percentile, MetricsRegistry,
  DEFAULT_RETRY, isRetryableError, backoffDelay, decideRetry,
  PROTECTED_PROVIDERS, initialCircuit, canRequest, onSuccess, onFailure, circuitHealth, DEFAULT_CIRCUIT,
  QUEUE_TYPES, makeJob, shouldEnqueue, planClaim, onJobFailure, canCancel, planReplayDeadLetter, queueCounts,
  rolloutBucket, evaluateFlag, evaluateAll, defaultFlag,
  RATE_LIMITS, rateLimitDecide, RateLimiter,
  HEALTH_COMPONENTS, rollupHealth, buildHealthReport, statusFromLatency, loadLevel, degradationPlan,
  buildPlatformAlerts,
} from "../src/lib/platform";
import type { QueueJob, LogRecord } from "../src/lib/platform/types";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function main(): void {
  console.log("ZONO Enterprise Reliability Platform dev-check\n");

  // 1) IDs.
  assert(isId(newId("req"), "req") && newRequestId().startsWith("req_") && newTraceId().startsWith("trace_"), "id helpers produce prefixed, valid ids");
  assert(newId("x") !== newId("x"), "ids are unique");

  // 2) Logging + redaction.
  const captured: LogRecord[] = [];
  setLogSink((r) => captured.push(r));
  const log = createLogger({ module: "test", orgId: "org1", requestId: "req_1" });
  log.info("hello", { apiKey: "super-secret-value", count: 5 });
  resetLogSink();
  assert(captured.length === 1, "log emitted exactly once");
  const entry = captured[0]!;
  assert(entry.module === "test" && !!entry.timestamp && entry.severity === "info", "log carries module/timestamp/severity");
  assert(JSON.stringify(entry).indexOf("super-secret-value") === -1, "secret-keyed value redacted from log");
  const red = redact({ password: "p", nested: { token: "t", ok: 1 } }) as Record<string, unknown>;
  assert(red.password === "[redacted]" && (red.nested as Record<string, unknown>).token === "[redacted]", "redact strips secret keys (incl nested)");

  // 3) Metrics.
  assert(percentile([], 95) === 0, "percentile of empty = 0");
  assert(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50) >= 5 && percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 100) === 10, "percentile bounds correct");
  const m = new MetricsRegistry();
  for (let i = 1; i <= 100; i++) m.record("latency", i);
  const s = m.summary("latency")!;
  assert(s.count === 100 && s.p95 >= s.p50 && s.p99 >= s.p95 && s.max === 100, "metrics summary: count + monotone percentiles");
  const big = new MetricsRegistry();
  for (let i = 0; i < 5000; i++) big.record("x", i);
  assert(big.summary("x")!.count <= 1000, "metrics ring buffer caps memory (≤1000)");

  // 4) Retry + backoff. (isRetryableError matches error MESSAGES.)
  assert(DEFAULT_RETRY.maxAttempts === 5 && DEFAULT_RETRY.jitterRatio > 0, "default retry policy sane");
  assert(isRetryableError(new Error("503 service unavailable")) && isRetryableError("rate limit exceeded") && !isRetryableError("400 bad request"), "retryable: 5xx/429/timeout yes, 4xx no");
  const d1 = backoffDelay(1, DEFAULT_RETRY, 0.5);
  const d3 = backoffDelay(3, DEFAULT_RETRY, 0.5);
  assert(d3 > d1, "backoff grows with attempt");
  assert(backoffDelay(99, DEFAULT_RETRY, 1) <= DEFAULT_RETRY.maxDelayMs * (1 + DEFAULT_RETRY.jitterRatio), "backoff capped near maxDelayMs");
  const stop = decideRetry("503", DEFAULT_RETRY.maxAttempts, DEFAULT_RETRY);
  assert(!stop.retry && stop.reason.includes("max"), "retry stops at maxAttempts");
  assert(!decideRetry("400 bad request", 1, DEFAULT_RETRY).retry, "no retry for non-retryable error");
  assert(decideRetry("timeout", 1, DEFAULT_RETRY).retry, "retries a transient failure with attempts left");

  // 5) Circuit breaker state machine.
  assert(PROTECTED_PROVIDERS.includes("apify") && PROTECTED_PROVIDERS.includes("openai"), "protected providers registered");
  let c = initialCircuit("apify");
  assert(c.state === "closed" && canRequest(c).allowed, "circuit starts closed + allows");
  for (let i = 0; i < DEFAULT_CIRCUIT.failureThreshold; i++) c = onFailure(c);
  assert(c.state === "open" && !canRequest(c, DEFAULT_CIRCUIT, c.openedAt! + 1).allowed, "circuit opens after threshold + blocks");
  const afterCooldown = c.openedAt! + DEFAULT_CIRCUIT.cooldownMs + 1;
  assert(canRequest(c, DEFAULT_CIRCUIT, afterCooldown).allowed, "circuit half-opens after cooldown (probe allowed)");
  let h: typeof c = { ...c, state: "half_open", probeSuccesses: 0 };
  for (let i = 0; i < DEFAULT_CIRCUIT.halfOpenProbes; i++) h = onSuccess(h, DEFAULT_CIRCUIT, afterCooldown);
  assert(h.state === "closed", "circuit closes after enough half-open probes");
  assert(circuitHealth(initialCircuit("x")) === "healthy" && circuitHealth(c) === "critical", "circuit health maps state");

  // 6) Queue.
  assert(QUEUE_TYPES.length === 7, "7 queue types");
  const job = makeJob("property_sync", { idempotencyKey: "k1", priority: 2, payload: { foo: 1 } });
  assert(job.status === "pending" && job.attempts === 0 && job.idempotencyKey === "k1", "makeJob defaults (pending, 0 attempts)");
  const dup = makeJob("property_sync", { idempotencyKey: "k1" });
  assert(shouldEnqueue(dup, []) && !shouldEnqueue(dup, [job]), "idempotency: dup key not re-enqueued");
  const claim = planClaim([job]);
  assert(claim.claim.includes(job.id), "planClaim selects a due pending job");
  const transient = onJobFailure({ ...job, attempts: 0 }, new Error("503 unavailable"), DEFAULT_RETRY);
  assert(transient.status === "pending" && !transient.deadLettered, "transient failure → retry (rescheduled)");
  const dead = onJobFailure({ ...job, attempts: DEFAULT_RETRY.maxAttempts }, new Error("timeout"), DEFAULT_RETRY);
  assert(dead.status === "dead" && dead.deadLettered, "exhausted attempts → DLQ");
  const nonRetry = onJobFailure({ ...job, attempts: 0 }, new Error("400 bad request"), DEFAULT_RETRY);
  assert(nonRetry.status === "dead" && nonRetry.deadLettered, "non-retryable failure → DLQ immediately");
  assert(canCancel("pending") && canCancel("claimed") && !canCancel("done") && !canCancel("dead"), "cancel only non-terminal jobs");
  const replay = planReplayDeadLetter([{ ...job, status: "dead" }] as QueueJob[]);
  assert(replay.length === 1 && replay[0] === job.id, "DLQ replay returns dead job ids");
  const counts = queueCounts([{ ...job, status: "pending" }, { ...job, status: "dead" }] as QueueJob[]);
  assert(counts.dead === 1 && counts.pending === 1, "queueCounts tallies by status");

  // 7) Feature flags.
  assert(rolloutBucket("a") === rolloutBucket("a") && rolloutBucket("a") < 100, "rollout bucket stable + bounded");
  assert(!evaluateFlag(defaultFlag("f"), { environment: "production" }), "disabled flag → false");
  const onAll = defaultFlag("f", { enabled: true, rolloutPercent: 100 });
  assert(evaluateFlag(onAll, { environment: "production" }), "enabled + 100% → true");
  const envGated = defaultFlag("f", { enabled: true, rolloutPercent: 100, environments: ["preview"] });
  assert(!evaluateFlag(envGated, { environment: "production" }) && evaluateFlag(envGated, { environment: "preview" }), "environment targeting");
  const roleGated = defaultFlag("f", { enabled: true, rolloutPercent: 100, roles: ["admin", "owner"] });
  assert(evaluateFlag(roleGated, { environment: "production", roleKey: "admin" }) && !evaluateFlag(roleGated, { environment: "production", roleKey: "agent" }), "role targeting");
  const half = defaultFlag("f", { enabled: true, rolloutPercent: 50 });
  const a = evaluateFlag(half, { environment: "production", orgId: "o", userId: "u" });
  assert(a === evaluateFlag(half, { environment: "production", orgId: "o", userId: "u" }), "rollout decision stable per subject");
  assert(Object.keys(evaluateAll([onAll, defaultFlag("g")], { environment: "production" })).length === 2, "evaluateAll maps all flags");

  // 8) Rate limiting.
  assert(RATE_LIMITS.ai.limit === 60 && RATE_LIMITS.auth.limit === 10, "rate limits configured (ai 60, auth 10)");
  assert(rateLimitDecide(0, Date.now(), RATE_LIMITS.auth).allowed, "first request allowed");
  assert(!rateLimitDecide(RATE_LIMITS.auth.limit, Date.now(), RATE_LIMITS.auth).allowed, "over-limit blocked");
  const rl = new RateLimiter();
  let allowed = 0;
  for (let i = 0; i < 15; i++) if (rl.check("auth", "user1").allowed) allowed++;
  assert(allowed === RATE_LIMITS.auth.limit, "limiter enforces window count (10/min)");
  assert(rl.check("auth", "user2").allowed, "limiter is per-subject");

  // 9) Health + degradation.
  assert(HEALTH_COMPONENTS.length === 11, "11 health components");
  assert(rollupHealth([]) === "unknown", "empty rollup = unknown");
  assert(rollupHealth([{ key: "a", label: "A", status: "healthy" }, { key: "b", label: "B", status: "critical" }]) === "critical", "rollup = worst component");
  assert(statusFromLatency(100) === "healthy" && statusFromLatency(1000) === "warning" && statusFromLatency(5000) === "critical" && statusFromLatency(null) === "unknown", "latency thresholds");
  const rep = buildHealthReport([{ key: "a", label: "A", status: "warning" }]);
  assert(rep.overall === "warning" && !!rep.generatedAt, "health report shape");
  assert(loadLevel({ p95Ms: 100, queueDepth: 10, errorRatePct: 0 }) === "normal" && loadLevel({ p95Ms: 6000, queueDepth: 0, errorRatePct: 0 }) === "overload", "load levels");
  const plan = degradationPlan("overload");
  assert(plan.keepCritical === true && plan.pauseNonCritical && plan.refreshIntervalMultiplier === 4, "overload sheds non-critical but keeps critical");
  assert(degradationPlan("normal").pauseLowPriority === false, "normal load pauses nothing");

  // 10) Alerts (ranked critical-first).
  const alerts = buildPlatformAlerts({
    components: [{ key: "database", label: "DB", status: "warning" }, { key: "ai", label: "AI", status: "critical" }],
    circuits: [{ provider: "apify", state: "open", consecutiveFailures: 5, openedAt: Date.now(), probeSuccesses: 0 }],
    deadLetterCount: 30, queueDepth: 12000, errorRatePct: 30,
  });
  assert(alerts.length > 0 && alerts[0]!.severity === "critical", "alerts emitted, critical ranked first");
  assert(alerts.some((x) => x.key === "dlq") && alerts.some((x) => x.key.startsWith("circuit_")), "DLQ + circuit alerts present");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
