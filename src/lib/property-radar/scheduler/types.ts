// ============================================================================
// ZONO Property Radar™ — scheduler types (client-safe, no I/O).
// Vocabulary for the automatic area orchestrator: areas, priority, settings,
// the data-access contract (so the orchestrator is DB-agnostic and testable),
// and the run summary.
// ============================================================================
import type { PropertyProviderName } from "../types";

export type AreaPriority = "hot" | "active" | "passive";

/** An expertise area the radar may scan. Mirrors spec section 3. */
export interface OrchestratorArea {
  areaId?: string;
  city: string;
  neighborhood?: string | null;
  priority?: AreaPriority; // manual override when present
}

/** Settings subset the scheduler reasons over. */
export interface RadarSchedulerSettings {
  syncEnabled: boolean;
  smartSyncEnabled: boolean;
  maxDailyCredits: number;
  maxPagesPerScan: number;
  unchangedStreakStopThreshold: number;
  providerYad2Enabled: boolean;
  providerMadlanEnabled: boolean;
  /** Optional non-smart interval; falls back to 6h when absent. */
  syncIntervalHours?: number | null;
}

export const DEFAULT_SCHEDULER_SETTINGS: RadarSchedulerSettings = {
  syncEnabled: true,
  smartSyncEnabled: true,
  maxDailyCredits: 1000,
  maxPagesPerScan: 3,
  unchangedStreakStopThreshold: 15,
  providerYad2Enabled: true,
  providerMadlanEnabled: true,
  syncIntervalHours: null,
};

/** Per-area signals used to derive priority. */
export interface AreaPriorityContext {
  recentAlertCount?: number;
  activeBuyers?: number;
  activeProperties?: number;
}

/** Credit-budget decision for one area at a given priority. */
export interface CreditBudgetDecision {
  allowed: boolean;
  reason?: string;
  remainingCredits: number;
}

// ── Data access (injectable; default impl is server-only Supabase) ───────────
export interface OrgSchedulerRecord {
  orgId: string;
  settings: RadarSchedulerSettings;
}

export interface OrchestratorDataAccess {
  /** Orgs with property_radar_settings.sync_enabled = true (+ their settings). */
  listSyncEnabledOrgs(maxOrgs?: number): Promise<OrgSchedulerRecord[]>;
  /** Expertise areas for an org (real source; empty when none). */
  getAreasForOrg(orgId: string): Promise<OrchestratorArea[]>;
  /** Last successful scan time for (org, provider, area), or null. */
  getWatermarkScanAt(
    orgId: string,
    provider: PropertyProviderName,
    area: OrchestratorArea,
  ): Promise<string | null>;
  /** Credits consumed today (UTC day) by this org's sync runs. */
  getTodayCreditUsage(orgId: string): Promise<number>;
  /** Recent (e.g. 24h) alert count for an area — feeds hot detection. */
  getRecentAlertCount(orgId: string, area: OrchestratorArea, sinceIso: string): Promise<number>;
}

// ── Orchestrator input / output ──────────────────────────────────────────────
export interface RunOrchestratorInput {
  now?: Date;
  orgId?: string;
  providerName?: PropertyProviderName;
  dryRun?: boolean;
  maxOrgs?: number;
  maxAreasPerOrg?: number;
  /** Run type recorded on sync runs (default "automatic"). */
  runType?: "automatic" | "manual" | "validation";
}

export interface PlannedArea {
  city: string;
  neighborhood: string | null;
  priority: AreaPriority;
  due: boolean;
  willRun: boolean;
  reason: string;
  lastScanAt: string | null;
}

export interface OrgPlan {
  orgId: string;
  areasConsidered: number;
  creditsUsedToday: number;
  remainingCredits: number;
  planned: PlannedArea[];
}

export interface AreaRunOutcome {
  orgId: string;
  city: string;
  neighborhood: string | null;
  status: "success" | "partial" | "failed";
  scannedCount: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  missingCount: number;
  deletedCount: number;
  creditsUsed: number;
  creditsSaved: number;
  error?: string;
}

export interface OrchestratorSummary {
  provider: PropertyProviderName | null;
  dryRun: boolean;
  orgsConsidered: number;
  areasConsidered: number;
  areasDue: number;
  areasRun: number;
  areasSkipped: number;
  newListings: number;
  creditsUsed: number;
  skippedReason?: string;
  errors: string[];
  plans: OrgPlan[];
  runs: AreaRunOutcome[];
}
