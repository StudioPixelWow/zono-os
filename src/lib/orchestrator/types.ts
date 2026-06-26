// ============================================================================
// ZONO Automation Orchestrator™ — shared types (client-safe, no server imports).
// ============================================================================

export type ZonoOrchestratorTrigger =
  | "login"
  | "dashboard_load"
  | "manual_sync"
  | "scheduled_cron"
  | "property_created"
  | "property_updated"
  | "external_sync_completed"
  | "transactions_sync_completed";

export type OrchestratorRunStatus = "running" | "success" | "partial" | "failed" | "skipped";
export type OrchestratorStepStatus = "success" | "partial" | "failed" | "skipped";

export interface OrchestratorStepResult {
  name: string;
  status: OrchestratorStepStatus;
  durationMs: number;
  summary: string;
  error?: string;
  critical?: boolean;
}

export interface RunZonoOrchestratorInput {
  organizationId: string;
  userId?: string | null;
  trigger: ZonoOrchestratorTrigger;
  /** Force a full run, bypassing the staleness check and taking over EXPIRED locks. */
  force?: boolean;
  source?: string | null;
  /**
   * Skip the provider scrape step (Step 1). The manual "סנכרן עכשיו" flow already
   * scrapes via the browser-driven chunked sync, so it runs the orchestrator with
   * this set — bridge + events + snapshots + brain only.
   */
  skipExternalSync?: boolean;
  /** Skip route revalidation (used by cron / `after()` contexts where it's invalid). */
  skipRevalidation?: boolean;
}

export interface OrchestratorResult {
  status: OrchestratorRunStatus;
  runId: string | null;
  trigger: ZonoOrchestratorTrigger;
  organizationId: string;
  durationMs: number;
  skipped?: boolean;
  skippedReason?: string;
  steps: OrchestratorStepResult[];
  error?: string;
}

/** Stale window for login / dashboard_load triggers (15 minutes). */
export const ORCHESTRATOR_STALE_MS = 15 * 60 * 1000;
/** Lock lifetime (10 minutes). */
export const ORCHESTRATOR_LOCK_MS = 10 * 60 * 1000;

/** Price-change thresholds for emitting a price_reduction event/alert. */
export const PRICE_DROP_MIN_PERCENT = 2;
export const PRICE_DROP_MIN_ABS = 50_000;
export const PRICE_DROP_HOT_PERCENT = 8;
export const PRICE_DROP_HOT_ABS = 150_000;
