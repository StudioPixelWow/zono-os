// ============================================================================
// ZONO — PLATFORM OPS model (P5.6). PURE, client-safe, deterministic.
// ----------------------------------------------------------------------------
// The canonical operational SEVERITY + alert decision (like P5.4/P5.5 resolvers).
// The server layer (server/ops.ts) fetches bounded aggregate signals and
// delegates every classification here. HARD RULES:
//   · Only deterministic rules — NO opaque scoring. Every alert states its
//     reason, source, affected subsystem/org, and timestamp where available.
//   · Never fabricate uptime/SLA. A signal we cannot read → UNAVAILABLE.
//   · Do NOT show fake zeros — a failed query is "unavailable", not 0.
// ============================================================================

// ── Severity ────────────────────────────────────────────────────────────────
export type OpsSeverity = "critical" | "warning" | "healthy" | "unavailable";

export const SEVERITY_RANK: Record<OpsSeverity, number> = { critical: 3, warning: 2, unavailable: 1, healthy: 0 };
export const SEVERITY_LABEL: Record<OpsSeverity, string> = { critical: "קריטי", warning: "אזהרה", healthy: "תקין", unavailable: "לא זמין" };

/** Worst (highest-rank) severity across a set. Empty → healthy. */
export function worstSeverity(list: OpsSeverity[]): OpsSeverity {
  return list.reduce<OpsSeverity>((w, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[w] ? s : w), "healthy");
}

// ── Deterministic thresholds (documented, tunable) ──────────────────────────
export const OPS_THRESHOLDS = {
  /** dead-letter items ≥ this → CRITICAL (a real backlog needing intervention). */
  deadLetterCritical: 25,
  /** dead-letter items ≥ this (and < critical) → WARNING. */
  deadLetterWarning: 1,
  /** failed jobs ≥ this → WARNING. */
  failedJobsWarning: 1,
  /** oldest pending age ≥ this → WARNING (queue not draining). */
  oldestPendingWarningMs: 30 * 60 * 1000, // 30m — 3× the slowest 10-min drain cron
} as const;

// ── Extension heartbeat thresholds ──────────────────────────────────────────
// NOTE: the Facebook extension is a browser-side client and the repo defines NO
// heartbeat cadence constant (audit §7). These thresholds are therefore a
// documented PRODUCT choice (not derived from code) and are intentionally
// generous so a user who merely closed their browser overnight is "stale", not
// "offline". Tune here if a real cadence is later established.
export const HEARTBEAT_THRESHOLDS = {
  healthyMs: 15 * 60 * 1000,   // seen within 15m → healthy (browser open & active)
  staleMs: 24 * 60 * 60 * 1000, // 15m–24h → stale (likely closed browser)
} as const;                       // > 24h → offline

export type HeartbeatClass = "healthy" | "stale" | "offline" | "unknown";
export const HEARTBEAT_LABEL: Record<HeartbeatClass, string> = { healthy: "פעיל", stale: "לא עדכני", offline: "לא מקוון", unknown: "לא ידוע" };

/** Classify an instance by its last-seen timestamp. No timestamp → unknown. */
export function classifyHeartbeat(lastSeenIso: string | null, nowMs: number): HeartbeatClass {
  if (!lastSeenIso) return "unknown";
  const t = Date.parse(lastSeenIso);
  if (Number.isNaN(t)) return "unknown";
  const age = nowMs - t;
  if (age <= HEARTBEAT_THRESHOLDS.healthyMs) return "healthy";
  if (age <= HEARTBEAT_THRESHOLDS.staleMs) return "stale";
  return "offline";
}

export function heartbeatSeverity(c: HeartbeatClass): OpsSeverity {
  switch (c) { case "healthy": return "healthy"; case "stale": return "warning"; case "offline": return "warning"; default: return "unavailable"; }
}

// ── Integration state (reuses the platform DAL vocabulary) ──────────────────
export type IntegrationState = "connected" | "warning" | "disconnected" | "not_configured" | "unavailable";
export const INTEGRATION_LABEL: Record<IntegrationState, string> = {
  connected: "מחובר", warning: "מוגבל", disconnected: "מנותק", not_configured: "לא מוגדר", unavailable: "לא זמין",
};
export function integrationSeverity(s: IntegrationState): OpsSeverity {
  switch (s) { case "connected": return "healthy"; case "warning": return "warning"; case "disconnected": return "warning"; case "not_configured": return "healthy"; default: return "unavailable"; }
}

// ── Queue / job severity ────────────────────────────────────────────────────
export interface QueueSignal {
  key: string; label: string;
  active: number | null;   // pending/backlog + in-flight (null = unavailable)
  failed: number | null;
  deadLetter: number | null;
  oldestPendingAgeMs: number | null;
}
export function queueSeverity(q: QueueSignal): OpsSeverity {
  // A failed read (all null) → unavailable; never a fake healthy.
  if (q.active === null && q.failed === null && q.deadLetter === null) return "unavailable";
  if ((q.deadLetter ?? 0) >= OPS_THRESHOLDS.deadLetterCritical) return "critical";
  const warn =
    (q.deadLetter ?? 0) >= OPS_THRESHOLDS.deadLetterWarning ||
    (q.failed ?? 0) >= OPS_THRESHOLDS.failedJobsWarning ||
    (q.oldestPendingAgeMs ?? 0) >= OPS_THRESHOLDS.oldestPendingWarningMs;
  return warn ? "warning" : "healthy";
}

// ── Alert model (explainable, deterministic) ────────────────────────────────
export interface OpsAlert {
  severity: Exclude<OpsSeverity, "healthy">;   // only actionable states are alerts
  source: string;        // which reader/subsystem produced it
  subsystem: string | null;
  reason: string;        // human-readable, deterministic
  orgId: string | null;
  orgName: string | null;
  at: string | null;     // timestamp where available
}

export interface AlertInputs {
  dbReachable: boolean | null;   // null = probe unavailable
  queues: QueueSignal[];
  extension: { stale: number; offline: number };
  integrations: { provider: string; warning: number; disconnected: number }[];
}

/** Build the deterministic alert list. Order: critical first, then warnings. */
export function buildOpsAlerts(inp: AlertInputs): OpsAlert[] {
  const alerts: OpsAlert[] = [];

  if (inp.dbReachable === false) {
    alerts.push({ severity: "critical", source: "system_health", subsystem: "database", reason: "מסד הנתונים אינו נגיש", orgId: null, orgName: null, at: null });
  }
  for (const q of inp.queues) {
    const sev = queueSeverity(q);
    if (sev === "critical") alerts.push({ severity: "critical", source: "queues", subsystem: q.label, reason: `מכתבים מתים בתור ${q.label}: ${q.deadLetter}`, orgId: null, orgName: null, at: null });
    else if (sev === "warning") {
      const bits: string[] = [];
      if ((q.deadLetter ?? 0) >= OPS_THRESHOLDS.deadLetterWarning) bits.push(`${q.deadLetter} מכתבים מתים`);
      if ((q.failed ?? 0) >= OPS_THRESHOLDS.failedJobsWarning) bits.push(`${q.failed} משימות שנכשלו`);
      if ((q.oldestPendingAgeMs ?? 0) >= OPS_THRESHOLDS.oldestPendingWarningMs) bits.push("תור לא מתנקז");
      alerts.push({ severity: "warning", source: "queues", subsystem: q.label, reason: bits.join(" · ") || "מצב תור מוגבל", orgId: null, orgName: null, at: null });
    }
  }
  if (inp.extension.offline > 0 || inp.extension.stale > 0) {
    alerts.push({ severity: "warning", source: "extension", subsystem: "Facebook Assistant", reason: `${inp.extension.offline} לא מקוונות · ${inp.extension.stale} לא עדכניות`, orgId: null, orgName: null, at: null });
  }
  for (const it of inp.integrations) {
    if (it.warning > 0 || it.disconnected > 0) {
      alerts.push({ severity: "warning", source: "integrations", subsystem: it.provider, reason: `${it.disconnected} מנותקים · ${it.warning} מוגבלים`, orgId: null, orgName: null, at: null });
    }
  }
  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}

// ── Cron schedule catalog (config-only — run history is NOT tracked) ─────────
// Mirror of vercel.json `crons`. There is NO cron_runs table (audit §10), so we
// show the CONFIGURED cadence + route existence only — never a fabricated "last
// success". A cron_runs model is proposed (deferred) in the delivery report.
export interface CronSchedule { path: string; schedule: string; cadence: string; subsystem: string }
export const CRON_SCHEDULES: CronSchedule[] = [
  { path: "/api/cron/kernel-drain", schedule: "*/10 * * * *", cadence: "כל 10 דקות", subsystem: "Kernel" },
  { path: "/api/cron/zono-master-sync", schedule: "0 1 * * *", cadence: "יומי 01:00", subsystem: "Sync" },
  { path: "/api/cron/external-listings-sync", schedule: "0 2 * * *", cadence: "יומי 02:00", subsystem: "Listings" },
  { path: "/api/cron/external-listings-geocode", schedule: "15 * * * *", cadence: "כל שעה :15", subsystem: "Listings" },
  { path: "/api/cron/brokerage-knowledge", schedule: "40 4 * * *", cadence: "יומי 04:40", subsystem: "Brokerage" },
  { path: "/api/cron/brokerage-evolution", schedule: "50 4 * * *", cadence: "יומי 04:50", subsystem: "Brokerage" },
  { path: "/api/cron/brokerage-continuous-learning", schedule: "0 */6 * * *", cadence: "כל 6 שעות", subsystem: "Brokerage" },
  { path: "/api/cron/transactions-refresh", schedule: "0 3 * * *", cadence: "יומי 03:00", subsystem: "Transactions" },
  { path: "/api/cron/property-radar-sync", schedule: "0 * * * *", cadence: "כל שעה", subsystem: "Property Radar" },
  { path: "/api/cron/property-radar-validation", schedule: "30 4 * * *", cadence: "יומי 04:30", subsystem: "Property Radar" },
  { path: "/api/cron/meta-dispatch-fast", schedule: "* * * * *", cadence: "כל דקה", subsystem: "Meta" },
  { path: "/api/cron/meta-dispatch-standard", schedule: "*/3 * * * *", cadence: "כל 3 דקות", subsystem: "Meta" },
  { path: "/api/cron/meta-dispatch-slow", schedule: "*/10 * * * *", cadence: "כל 10 דקות", subsystem: "Meta" },
  { path: "/api/cron/meta-recover", schedule: "*/15 * * * *", cadence: "כל 15 דקות", subsystem: "Meta" },
];
