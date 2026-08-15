"use server";
// ============================================================================
// City Directory server actions — territory-scoped reads/writes for the UI.
// Reads are background-safe: fetching status NEVER starts or restarts a job.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { refreshCityDirectory } from "./runner";
import { computeDirectoryActivity } from "./activity";
import { getLatestDirectoryRun } from "./observability";
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
