// ============================================================================
// 🏃 City Directory runner — one orchestration path shared by the cron and the
// server action. Wraps discoverCityDirectory in the observability lifecycle
// (open → run → finalize) + stale-run recovery. Never throws.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { discoverCityDirectory } from "./seeder";
import { openDirectoryRun, finishDirectoryRun, closeStuckDirectoryRuns } from "./observability";
import type { CityDirectorySeedResult } from "./types";

export async function refreshCityDirectory(orgId: string | null, locality: string, trigger: string): Promise<CityDirectorySeedResult> {
  const db = createServiceRoleClient();
  await closeStuckDirectoryRuns(db);
  const startedAt = Date.now();
  const runId = await openDirectoryRun(db, orgId, locality.trim(), trigger);
  let result: CityDirectorySeedResult;
  try {
    result = await discoverCityDirectory(orgId, locality);
  } catch (e) {
    result = {
      locality: locality.trim(), source: "madlan_directory", status: "error",
      reason: e instanceof Error ? e.message : "directory refresh failed", observedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      officesDiscovered: 0, agentsDiscovered: 0, relationshipsDiscovered: 0, agentsWithoutOffice: 0,
      officesInserted: 0, officesUpdated: 0, agentsInserted: 0, agentsUpdated: 0, relationshipsPersisted: 0,
      officesDuplicatesMerged: 0, agentsDuplicatesMerged: 0, pagesFetched: 0, sourceExhausted: false,
      errors: [e instanceof Error ? e.message : "directory refresh failed"], notes: [],
    };
  }
  await finishDirectoryRun(db, runId, startedAt, result);
  return result;
}
