"use server";
// ============================================================================
// City Directory server actions — territory-scoped reads/writes for the UI.
// Reads are background-safe: fetching status NEVER starts or restarts a job.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { refreshCityDirectory } from "./runner";
import { computeDirectoryActivity } from "./activity";
import { getLatestDirectoryRun } from "./observability";
import { getCityIntelligenceReadiness, getNationalDirectoryStatus, type CityReadiness } from "./readiness";
import type { CityDirectorySeedResult, CityDirectoryStatus } from "./types";

/** Read the persisted directory status + activity for a city. Background-safe:
 *  navigating away and back loads the current status; it never restarts a job. */
export async function getCityDirectoryStatusAction(city: string): Promise<{ ok: boolean; data?: CityDirectoryStatus; error?: string }> {
  const { profile } = await getSessionContext().catch(() => ({ profile: null }));
  if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." };
  try {
    const [run, activity] = await Promise.all([
      getLatestDirectoryRun(profile.org_id, city.trim()),
      computeDirectoryActivity(city),
    ]);
    return { ok: true, data: { run, activity } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "טעינת סטטוס המדריך נכשלה." };
  }
}

/** Trigger a directory refresh for a city (operator/manager action). */
export async function refreshCityDirectoryAction(city: string): Promise<{ ok: boolean; result?: CityDirectorySeedResult; status?: CityDirectoryStatus; error?: string }> {
  const { profile } = await getSessionContext().catch(() => ({ profile: null }));
  if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." };
  try {
    const result = await refreshCityDirectory(profile.org_id, city, "manual_action");
    const [run, activity] = await Promise.all([
      getLatestDirectoryRun(profile.org_id, city.trim()),
      computeDirectoryActivity(city),
    ]);
    return { ok: true, result, status: { run, activity } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "רענון המדריך נכשל." };
  }
}

/** Canonical readiness for a city — the onboarding/first-login resolver. */
export async function getCityReadinessAction(city: string): Promise<{ ok: boolean; readiness?: CityReadiness; error?: string }> {
  const { profile } = await getSessionContext().catch(() => ({ profile: null }));
  if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." };
  try {
    return { ok: true, readiness: await getCityIntelligenceReadiness(city) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "טעינת מוכנות העיר נכשלה." };
  }
}

/**
 * On-demand bootstrap trigger (single-flight). Called after onboarding resolves
 * the operating city. If a bootstrap is already BUILDING for this city, the
 * caller ATTACHES to it (no duplicate job). READY/PARTIAL/STALE return existing
 * data immediately. PROVIDER_CAPABILITY_REQUIRED does NOT re-run an incapable
 * mechanism. MISSING starts one bootstrap.
 */
export async function bootstrapCityIntelligenceAction(city: string): Promise<{ ok: boolean; readiness?: CityReadiness; started?: boolean; attached?: boolean; error?: string }> {
  const { profile } = await getSessionContext().catch(() => ({ profile: null }));
  if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." };
  try {
    const before = await getCityIntelligenceReadiness(city);
    // Single-flight: attach to an in-flight bootstrap; never duplicate.
    if (before.state === "BUILDING") return { ok: true, readiness: before, attached: true, started: false };
    // Don't re-run a mechanism known to be incapable, or refetch when data is fresh enough.
    if (before.state === "PROVIDER_CAPABILITY_REQUIRED" || before.state === "READY" || before.state === "PARTIAL") {
      return { ok: true, readiness: before, started: false, attached: false };
    }
    // MISSING / STALE / FAILED_RETRYABLE → start (or refresh) one bootstrap.
    await refreshCityDirectory(profile.org_id, city, "onboarding_bootstrap");
    return { ok: true, readiness: await getCityIntelligenceReadiness(city), started: true, attached: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "התחלת בניית מודיעין העיר נכשלה." };
  }
}

/** Platform-Admin national directory rollup (operator-only). */
export async function getNationalDirectoryStatusAction(): Promise<{ ok: boolean; cities?: CityReadiness[]; error?: string }> {
  const { profile } = await getSessionContext().catch(() => ({ profile: null }));
  if (!profile?.org_id) return { ok: false, error: "יש להתחבר." };
  try {
    return { ok: true, cities: await getNationalDirectoryStatus() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "טעינת סטטוס המדריך הארצי נכשלה." };
  }
}
