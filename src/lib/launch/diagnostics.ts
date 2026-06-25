// ============================================================================
// ZONO — system diagnostics (pure parts). The list of checks the diagnostics
// page reports on, plus a deterministic rollup. Real probing lives in the
// server layer; this stays client-safe so the UI can render labels/order.
// ============================================================================
import type { DiagnosticCheck, DiagnosticsReport, DiagStatus } from "./types";

const RANK: Record<DiagStatus, number> = { pass: 0, unknown: 1, warning: 2, fail: 3 };

/** Checks the Diagnostics page reports, in display order. */
export const DIAGNOSTIC_CHECKS: { key: string; label: string }[] = [
  { key: "environment", label: "Environment" },
  { key: "database", label: "Database" },
  { key: "rls", label: "RLS / Tenancy" },
  { key: "providers", label: "Providers (Apify)" },
  { key: "maps", label: "Maps" },
  { key: "ai", label: "AI" },
  { key: "realtime", label: "Realtime" },
  { key: "storage", label: "Storage" },
  { key: "cron", label: "Cron" },
  { key: "permissions", label: "Permissions" },
  { key: "queues", label: "Queues" },
  { key: "feature_flags", label: "Feature Flags" },
];

/** Overall = worst check (fail > warning > unknown > pass). */
export function rollupDiagnostics(checks: DiagnosticCheck[]): DiagStatus {
  if (checks.length === 0) return "unknown";
  return checks.reduce<DiagStatus>((worst, c) => (RANK[c.status] > RANK[worst] ? c.status : worst), "pass");
}

export function buildDiagnosticsReport(checks: DiagnosticCheck[]): DiagnosticsReport {
  return { overall: rollupDiagnostics(checks), checks, generatedAt: new Date().toISOString() };
}

/** Map a configuration-presence boolean to a check (configured → pass). */
export function configCheck(key: string, label: string, configured: boolean, missingDetail: string): DiagnosticCheck {
  return configured ? { key, label, status: "pass" } : { key, label, status: "unknown", detail: missingDetail };
}
