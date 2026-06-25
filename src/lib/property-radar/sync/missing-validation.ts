// ============================================================================
// ZONO Property Radar™ — daily missing-validation pass.
// ----------------------------------------------------------------------------
// A cheap, provider-free sweep that ages out listings the radar hasn't seen in a
// while: a source not seen for `missingAfterHours` is flagged MISSING; once its
// missing_count crosses the threshold it becomes DELETED (soft — status only,
// never a hard delete). Recorded as a sync run with run_type 'validation'.
//
// This phase makes NO external provider calls — it reasons purely over stored
// source state (last_seen_at + missing_count).
// ============================================================================
import type {
  RunMissingValidationInput,
  RunMissingValidationResult,
  SyncRepository,
} from "./types";
import type { RunSyncDeps } from "./engine";

const DEFAULT_MISSING_AFTER_HOURS = 48;
const MISSING_TO_DELETED_THRESHOLD = 2;

async function getDefaultRepository(): Promise<SyncRepository> {
  const mod = await import("./repository");
  return mod.createSyncRepository();
}

export async function runMissingValidation(
  input: RunMissingValidationInput,
  deps?: RunSyncDeps,
): Promise<RunMissingValidationResult> {
  const { orgId, providerName, area } = input;
  const dryRun = input.options?.dryRun ?? false;
  const missingAfterHours = input.options?.missingAfterHours ?? DEFAULT_MISSING_AFTER_HOURS;

  const result: RunMissingValidationResult = {
    runId: "dry-run",
    provider: providerName,
    status: "success",
    checkedCount: 0,
    missingCount: 0,
    deletedCount: 0,
    errors: [],
  };

  let repo: SyncRepository;
  try {
    repo = deps?.repo ?? (await getDefaultRepository());
  } catch (e) {
    result.status = "failed";
    result.errors.push(`repository unavailable: ${errMsg(e)}`);
    return result;
  }

  let runId = "dry-run";
  try {
    if (!dryRun) {
      runId = await repo.createSyncRun({
        orgId,
        provider: providerName,
        area,
        runType: "validation",
      });
    }
    result.runId = runId;

    const cutoffIso = new Date(Date.now() - missingAfterHours * 3600_000).toISOString();
    const stale = await repo.getStaleSources(orgId, providerName, cutoffIso, area);
    result.checkedCount = stale.length;

    for (const src of stale) {
      if (src.source_status === "deleted") continue;
      try {
        if (src.missing_count >= MISSING_TO_DELETED_THRESHOLD) {
          if (!dryRun) await repo.markSourceDeleted(src.id);
          result.deletedCount++;
        } else {
          if (!dryRun) await repo.markSourceMissing(src.id);
          result.missingCount++;
        }
      } catch (e) {
        result.errors.push(`source ${src.id}: ${errMsg(e)}`);
      }
    }

    if (!dryRun) {
      await repo.finishSyncRun(runId, {
        status: result.errors.length ? "partial" : "success",
        scannedCount: result.checkedCount,
        newCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        missingCount: result.missingCount,
        deletedCount: result.deletedCount,
        fullFetchCount: 0,
        creditsUsed: 0,
        creditsSavedEstimate: 0,
        stopReason: "validation",
        errorMessage: result.errors.length ? result.errors.join(" | ") : null,
      });
    }

    return result;
  } catch (err) {
    result.status = "failed";
    result.errors.push(errMsg(err));
    if (!dryRun && runId !== "dry-run") {
      try {
        await repo.finishSyncRun(runId, {
          status: "failed",
          scannedCount: result.checkedCount,
          newCount: 0,
          updatedCount: 0,
          unchangedCount: 0,
          missingCount: result.missingCount,
          deletedCount: result.deletedCount,
          fullFetchCount: 0,
          creditsUsed: 0,
          creditsSavedEstimate: 0,
          stopReason: "error",
          errorMessage: errMsg(err),
        });
      } catch {
        /* best-effort */
      }
    }
    return result;
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
