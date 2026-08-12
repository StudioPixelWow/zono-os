/*
 * P5.6 — Ops severity / heartbeat / alert QA (LOCAL, no DB, no network).
 * Proves the operational classifiers are deterministic, never fake a healthy on
 * a failed read (unavailable, not 0), classify heartbeats by documented
 * thresholds, and build explainable alerts with correct severity ordering.
 * Run: npx tsx scripts/platform-ops-qa.ts
 */
import {
  classifyHeartbeat, heartbeatSeverity, queueSeverity, worstSeverity, buildOpsAlerts,
  integrationSeverity, HEARTBEAT_THRESHOLDS, OPS_THRESHOLDS, CRON_SCHEDULES,
  type QueueSignal,
} from "../src/lib/platform-admin/ops/model";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

const NOW = 1_700_000_000_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const q = (over: Partial<QueueSignal> = {}): QueueSignal => ({ key: "k", label: "L", active: 0, failed: 0, deadLetter: 0, oldestPendingAgeMs: null, ...over });

function main(): void {
  console.log("P5.6 ops resolver QA\n");

  // ── 1. Heartbeat classification by documented thresholds. ──
  assert(classifyHeartbeat(ago(60_000), NOW) === "healthy", "heartbeat 1m → healthy");
  assert(classifyHeartbeat(ago(HEARTBEAT_THRESHOLDS.healthyMs + 1000), NOW) === "stale", "heartbeat >15m → stale");
  assert(classifyHeartbeat(ago(HEARTBEAT_THRESHOLDS.staleMs + 1000), NOW) === "offline", "heartbeat >24h → offline");
  assert(classifyHeartbeat(null, NOW) === "unknown", "heartbeat null → unknown (no last_seen)");
  assert(heartbeatSeverity("healthy") === "healthy" && heartbeatSeverity("offline") === "warning" && heartbeatSeverity("unknown") === "unavailable", "heartbeat→severity mapping");

  // ── 2. Queue severity: no fake zero on failed read. ──
  assert(queueSeverity(q({ active: null, failed: null, deadLetter: null })) === "unavailable", "all-null queue → unavailable (NOT healthy)");
  assert(queueSeverity(q()) === "healthy", "empty queue → healthy");
  assert(queueSeverity(q({ failed: 1 })) === "warning", "1 failed → warning");
  assert(queueSeverity(q({ deadLetter: OPS_THRESHOLDS.deadLetterCritical })) === "critical", "dead-letter ≥ critical threshold → critical");
  assert(queueSeverity(q({ deadLetter: 1 })) === "warning", "1 dead-letter → warning");
  assert(queueSeverity(q({ oldestPendingAgeMs: OPS_THRESHOLDS.oldestPendingWarningMs + 1 })) === "warning", "stale backlog → warning");

  // ── 3. Severity ordering. ──
  assert(worstSeverity(["healthy", "warning", "critical", "unavailable"]) === "critical", "worst = critical");
  assert(worstSeverity(["healthy", "unavailable"]) === "unavailable", "worst(healthy,unavailable) = unavailable");
  assert(worstSeverity([]) === "healthy", "worst([]) = healthy");

  // ── 4. Integration severity. ──
  assert(integrationSeverity("connected") === "healthy" && integrationSeverity("not_configured") === "healthy", "connected/not_configured → healthy");
  assert(integrationSeverity("disconnected") === "warning" && integrationSeverity("warning") === "warning", "disconnected/warning → warning");
  assert(integrationSeverity("unavailable") === "unavailable", "unavailable → unavailable");

  // ── 5. Alert builder: deterministic, explainable, critical-first. ──
  const alerts = buildOpsAlerts({
    dbReachable: false,
    queues: [q({ label: "Q1", failed: 3 }), q({ label: "Q2", deadLetter: OPS_THRESHOLDS.deadLetterCritical })],
    extension: { stale: 2, offline: 1 },
    integrations: [{ provider: "Meta", warning: 1, disconnected: 0 }],
  });
  assert(alerts[0].severity === "critical", "first alert is critical (DB unreachable / dead-letter)");
  assert(alerts.every((a) => a.reason.length > 0 && a.source.length > 0), "every alert has reason + source");
  assert(alerts.some((a) => a.subsystem === "database" && a.severity === "critical"), "DB-unreachable → critical alert");
  assert(alerts.some((a) => a.source === "extension" && a.severity === "warning"), "stale/offline extension → warning alert");
  assert(alerts.filter((a) => a.severity === "critical").length >= 2, "both critical conditions surfaced");
  const healthy = buildOpsAlerts({ dbReachable: true, queues: [q()], extension: { stale: 0, offline: 0 }, integrations: [] });
  assert(healthy.length === 0, "no conditions → no alerts");

  // ── 6. Cron catalog is config-only (14 schedules, no run history). ──
  assert(CRON_SCHEDULES.length === 14, `cron catalog has ${CRON_SCHEDULES.length} schedules`);
  assert(CRON_SCHEDULES.every((c) => c.path.startsWith("/api/cron/") && c.schedule.length > 0), "every cron has a path + schedule (config-only, no fake last-run)");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
