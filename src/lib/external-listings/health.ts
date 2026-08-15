// ============================================================================
// 🩺 Hourly Market Watch — operator health resolver (server-only, read-only).
// Reads the canonical run ledger (zono_orchestrator_runs, source=hourly-market-
// watch). Operator surface only — not customer UI. No migration.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type HourlyWatchState = "HEALTHY" | "RUNNING" | "DELAYED" | "PARTIAL" | "FAILED" | "UNKNOWN";

export interface HourlyWatchHealth {
  state: HourlyWatchState;
  lastSuccessAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunDurationMs: number | null;
  nextExpectedRunAt: string | null;   // top of next hour
  orgsProcessedLastHour: number;
  orgsDeferredLastHour: number;
  newListingsLastHour: number;
  changedListingsLastHour: number;
  errorsLastHour: number;
  staleRecoveriesLast24h: number;      // should be 0 in normal operation
  runningNow: number;
}

const WATCH_SOURCE = "hourly-market-watch";
const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const s = (v: unknown): string | null => (typeof v === "string" ? v : v == null ? null : String(v));

export async function getHourlyWatchHealth(): Promise<HourlyWatchHealth> {
  const db = createServiceRoleClient();
  const nextExpectedRunAt = (() => { const d = new Date(); d.setUTCMinutes(0, 0, 0); d.setUTCHours(d.getUTCHours() + 1); return d.toISOString(); })();
  const base: HourlyWatchHealth = {
    state: "UNKNOWN", lastSuccessAt: null, lastRunAt: null, lastRunStatus: null, lastRunDurationMs: null,
    nextExpectedRunAt, orgsProcessedLastHour: 0, orgsDeferredLastHour: 0, newListingsLastHour: 0,
    changedListingsLastHour: 0, errorsLastHour: 0, staleRecoveriesLast24h: 0, runningNow: 0,
  };
  try {
    const { data } = await db.from("zono_orchestrator_runs")
      .select("status,started_at,finished_at,duration_ms,error,metadata")
      .eq("source", WATCH_SOURCE).order("started_at", { ascending: false }).limit(500);
    const rows = (data ?? []) as Record<string, unknown>[];
    if (!rows.length) return base;

    const hourAgo = Date.now() - 3_600_000;
    const dayAgo = Date.now() - 86_400_000;
    const lastHour = rows.filter((r) => new Date(s(r.started_at) ?? 0).getTime() >= hourAgo);
    const last = rows[0];
    const lastSuccess = rows.find((r) => s(r.status) === "success");
    const md = (r: Record<string, unknown>) => (r.metadata as Record<string, unknown> | null) ?? {};

    const health: HourlyWatchHealth = {
      ...base,
      lastRunAt: s(last.started_at),
      lastRunStatus: s(last.status),
      lastRunDurationMs: last.duration_ms == null ? null : n(last.duration_ms),
      lastSuccessAt: lastSuccess ? s(lastSuccess.started_at) : null,
      orgsProcessedLastHour: lastHour.filter((r) => ["success", "partial"].includes(s(r.status) ?? "")).length,
      orgsDeferredLastHour: lastHour.filter((r) => s(r.status) === "deferred").length,
      newListingsLastHour: lastHour.reduce((a, r) => a + n(md(r).new_listings), 0),
      changedListingsLastHour: lastHour.reduce((a, r) => a + n(md(r).changed_listings), 0),
      errorsLastHour: lastHour.reduce((a, r) => a + n(md(r).error_count), 0),
      staleRecoveriesLast24h: rows.filter((r) => new Date(s(r.started_at) ?? 0).getTime() >= dayAgo && s(r.status) === "timed_out").length,
      runningNow: rows.filter((r) => s(r.status) === "running").length,
    };

    // Deterministic state resolution.
    const lastStart = new Date(s(last.started_at) ?? 0).getTime();
    const overdue = Date.now() - lastStart > 90 * 60_000; // >90min since last run started
    if (health.runningNow > 0 && Date.now() - lastStart < 15 * 60_000) health.state = "RUNNING";
    else if (health.staleRecoveriesLast24h > 0 && lastHour.some((r) => s(r.status) === "timed_out")) health.state = "FAILED";
    else if (overdue) health.state = "DELAYED";
    else if (lastHour.some((r) => s(r.status) === "failed")) health.state = "FAILED";
    else if (health.orgsDeferredLastHour > 0 || lastHour.some((r) => md(r).enrichment_deferred === true)) health.state = "PARTIAL";
    else if (lastSuccess) health.state = "HEALTHY";
    else health.state = "UNKNOWN";

    return health;
  } catch {
    return base;
  }
}
