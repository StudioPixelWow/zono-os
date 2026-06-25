// ============================================================================
// ZONO — health aggregation + graceful degradation (pure). Rolls component
// statuses into one overall status, and decides load-shedding actions when the
// system is under pressure (reduce refresh frequency, pause low-priority jobs,
// keep critical workflows running).
// ============================================================================
import type { HealthComponent, HealthReport, HealthStatus } from "../types";

const RANK: Record<HealthStatus, number> = { healthy: 0, unknown: 1, warning: 2, critical: 3 };

/** The components the Health Center reports on. */
export const HEALTH_COMPONENTS: { key: string; label: string }[] = [
  { key: "database", label: "Supabase Database" },
  { key: "realtime", label: "Realtime" },
  { key: "cron", label: "Cron" },
  { key: "providers", label: "Provider Status (Apify)" },
  { key: "queues", label: "Queues" },
  { key: "ai", label: "AI Providers" },
  { key: "journey", label: "Journey Engine" },
  { key: "property_radar", label: "Property Radar" },
  { key: "shared_cache", label: "Shared Market Cache" },
  { key: "office_intelligence", label: "Office Intelligence" },
  { key: "storage", label: "Storage" },
];

/** Overall = worst component (critical > warning > unknown > healthy). */
export function rollupHealth(components: HealthComponent[]): HealthStatus {
  if (components.length === 0) return "unknown";
  return components.reduce<HealthStatus>((worst, c) => (RANK[c.status] > RANK[worst] ? c.status : worst), "healthy");
}

export function buildHealthReport(components: HealthComponent[]): HealthReport {
  return { overall: rollupHealth(components), components, generatedAt: new Date().toISOString() };
}

export function statusFromLatency(latencyMs: number | null, warnMs = 800, critMs = 3000): HealthStatus {
  if (latencyMs == null) return "unknown";
  if (latencyMs >= critMs) return "critical";
  if (latencyMs >= warnMs) return "warning";
  return "healthy";
}

// ── Graceful degradation / load protection ──────────────────────────────────
export type LoadLevel = "normal" | "elevated" | "high" | "overload";

export function loadLevel(metrics: { p95Ms: number; queueDepth: number; errorRatePct: number }): LoadLevel {
  if (metrics.p95Ms > 5000 || metrics.queueDepth > 10000 || metrics.errorRatePct > 25) return "overload";
  if (metrics.p95Ms > 2500 || metrics.queueDepth > 3000 || metrics.errorRatePct > 10) return "high";
  if (metrics.p95Ms > 1200 || metrics.queueDepth > 1000 || metrics.errorRatePct > 3) return "elevated";
  return "normal";
}

export interface DegradationPlan {
  level: LoadLevel;
  refreshIntervalMultiplier: number; // scale up cron/refresh intervals
  pauseLowPriority: boolean;
  pauseNonCritical: boolean;
  keepCritical: true;                // critical workflows ALWAYS run
  note: string;
}

/** Decide load-shedding. Critical workflows are never paused. */
export function degradationPlan(level: LoadLevel): DegradationPlan {
  switch (level) {
    case "overload": return { level, refreshIntervalMultiplier: 4, pauseLowPriority: true, pauseNonCritical: true, keepCritical: true, note: "מצב עומס: מושהות עבודות לא-קריטיות, רענון פי 4." };
    case "high": return { level, refreshIntervalMultiplier: 3, pauseLowPriority: true, pauseNonCritical: false, keepCritical: true, note: "עומס גבוה: מושהות עבודות בעדיפות נמוכה, רענון פי 3." };
    case "elevated": return { level, refreshIntervalMultiplier: 2, pauseLowPriority: true, pauseNonCritical: false, keepCritical: true, note: "עומס מוגבר: רענון פי 2." };
    default: return { level, refreshIntervalMultiplier: 1, pauseLowPriority: false, pauseNonCritical: false, keepCritical: true, note: "תקין." };
  }
}
