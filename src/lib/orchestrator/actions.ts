"use server";
// ============================================================================
// ZONO Orchestrator — server actions invoked from the UI.
// ============================================================================
import { runOrchestratorForSession } from "./triggers";
import { getSessionContext } from "@/lib/auth/session";
import { getSystemRefreshStatusRaw } from "./repository";
import { buildSystemRefreshStatus, EMPTY_SYSTEM_REFRESH_STATUS } from "./status";
import type { SystemRefreshStatusResult } from "./status";
import type { OrchestratorResult } from "./types";

export interface OrchestratorActionState {
  status: string;
  newProperties?: number;
  priceDrops?: number;
  alertsCreated?: number;
  error?: string;
  skippedReason?: string;
}

/**
 * Called after the manual chunked sync finishes: bridge external_listings into
 * market sources, refresh snapshots + decision brain, emit events/alerts and
 * revalidate the intelligence routes. Scrape already happened in the browser
 * loop, so external sync is skipped here.
 */
export async function runManualSyncOrchestratorAction(): Promise<OrchestratorActionState> {
  const r = await runOrchestratorForSession("manual_sync", { skipExternalSync: true, force: true, source: "manual_sync" });
  if (!("steps" in r)) return { status: r.status, error: r.skippedReason };
  const full = r as OrchestratorResult;
  const ev = full.steps.find((s) => s.name === "events_and_alerts");
  // Parse the structured summary numbers back out for the UI toast (best-effort).
  const nums = (ev?.summary ?? "").match(/\d+/g)?.map(Number) ?? [];
  return { status: full.status, newProperties: nums[0], priceDrops: nums[1], alertsCreated: nums[2] };
}

/**
 * Global "רענן מערכת" button — runs the FULL orchestration pipeline (bridge →
 * market snapshots → decision brain → events → alerts → revalidation). The heavy
 * provider scrape stays with the chunked "סנכרן עכשיו" flow + nightly cron (to
 * avoid serverless timeouts), so external sync is skipped here. Force-runs but
 * still respects the per-org lock (returns "skipped" if a run is already active).
 */
export async function runManualSystemRefreshAction(): Promise<OrchestratorActionState> {
  const r = await runOrchestratorForSession("manual_sync", { skipExternalSync: true, force: true, source: "sticky_system_refresh" });
  if (!("steps" in r)) return { status: r.status, skippedReason: r.skippedReason, error: r.skippedReason };
  const full = r as OrchestratorResult;
  const ev = full.steps.find((s) => s.name === "events_and_alerts");
  const nums = (ev?.summary ?? "").match(/\d+/g)?.map(Number) ?? [];
  return {
    status: full.status,
    newProperties: nums[0], priceDrops: nums[1], alertsCreated: nums[2],
    skippedReason: full.skippedReason,
    error: full.error,
  };
}

/**
 * Lightweight, read-only status for the sticky button's freshness indicator.
 * Reads ONLY the current organization's latest run + unread alert count, then
 * formats the Hebrew labels. Never throws — on any failure it returns the safe
 * empty status and logs server-side so the button silently degrades to basic.
 */
export async function getSystemRefreshStatusAction(): Promise<SystemRefreshStatusResult> {
  try {
    const { profile } = await getSessionContext();
    if (!profile) return EMPTY_SYSTEM_REFRESH_STATUS;
    const raw = await getSystemRefreshStatusRaw(profile.org_id);
    return buildSystemRefreshStatus(raw, Date.now());
  } catch (e) {
    console.error("[zono] getSystemRefreshStatusAction failed:", e);
    return EMPTY_SYSTEM_REFRESH_STATUS;
  }
}
