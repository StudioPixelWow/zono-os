// ============================================================================
// ZONO Property Radar™ — incremental sync engine.
// ----------------------------------------------------------------------------
// Walks one (org, provider, area) and decides per listing:
//   NEW / UPDATED / UNCHANGED / MISSING / DELETED — spending the *minimum*
// credits: a cheap metadata scan covers everything, and an expensive full fetch
// happens ONLY for NEW and UPDATED listings. UNCHANGED never triggers a full
// fetch. Nothing is ever hard-deleted (status flags only).
//
// The engine is storage-agnostic: it talks to a SyncRepository, so it runs
// end-to-end against the real Supabase repo OR an in-memory repo (dev-check).
// Provider access is via getPropertyProvider — unimplemented providers fail
// cleanly with a readable error.
// ============================================================================
import { getPropertyProvider } from "../providers/registry";
import { validateNormalizedListingMetadata } from "../providers/validation";
import type { NormalizedListingMetadata } from "../providers/types";
import { createListingContentHash } from "../utils";
import { evaluateListingOpportunity } from "../intelligence";
import {
  DEFAULT_RADAR_SETTINGS,
  type AgentScoringPreferences,
  type RadarIntelligenceRepository,
  type RadarSettingsLite,
} from "../intelligence/types";
import { decideListingSync } from "./decisions";
import type {
  PropertySyncDecision,
  RunPropertyAreaSyncInput,
  RunPropertyAreaSyncResult,
  SyncRepository,
} from "./types";

/** The engine needs both the storage + intelligence-write contracts. */
type RadarRepository = SyncRepository & RadarIntelligenceRepository;

const MISSING_TO_DELETED_THRESHOLD = 2;

export interface RunSyncDeps {
  /** Storage backend. Defaults to the Supabase repository (lazy-loaded). */
  repo?: RadarRepository;
}

async function getDefaultRepository(): Promise<RadarRepository> {
  // Lazy import so client/test contexts that pass their own repo never pull in
  // the server-only Supabase module.
  const mod = await import("./repository");
  return mod.createSyncRepository();
}

/** Newest listing by publishedAt (falls back to the first listing). */
function pickNewest(listings: NormalizedListingMetadata[]): NormalizedListingMetadata | null {
  if (listings.length === 0) return null;
  let newest = listings[0]!;
  let newestMs = newest.publishedAt ? Date.parse(newest.publishedAt) : NaN;
  for (const l of listings) {
    const ms = l.publishedAt ? Date.parse(l.publishedAt) : NaN;
    if (Number.isFinite(ms) && (!Number.isFinite(newestMs) || ms > newestMs)) {
      newest = l;
      newestMs = ms;
    }
  }
  return newest;
}

export async function runPropertyAreaSync(
  input: RunPropertyAreaSyncInput,
  deps?: RunSyncDeps,
): Promise<RunPropertyAreaSyncResult> {
  const { orgId, providerName, area } = input;
  const runType = input.runType ?? "automatic";
  const dryRun = input.options?.dryRun ?? false;
  const forceFullFetch = input.options?.forceFullFetch ?? false;

  const result: RunPropertyAreaSyncResult = {
    runId: "dry-run",
    provider: providerName,
    area,
    status: "success",
    scannedCount: 0,
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    missingCount: 0,
    deletedCount: 0,
    fullFetchCount: 0,
    creditsUsed: 0,
    creditsSavedEstimate: 0,
    errors: [],
    decisions: [],
  };

  let runId = "dry-run";
  let repo: RadarRepository;
  try {
    repo = deps?.repo ?? (await getDefaultRepository());
  } catch (e) {
    result.status = "failed";
    result.errors.push(`repository unavailable: ${errMsg(e)}`);
    return result;
  }

  const provider = getPropertyProvider(providerName); // pure, no I/O

  try {
    // 1. open run (skipped in dryRun — dryRun never writes)
    if (!dryRun) {
      runId = await repo.createSyncRun({ orgId, provider: providerName, area, runType });
    }
    result.runId = runId;

    // 3. watermark → feeds incremental scan
    const watermark = await repo.getWatermark(orgId, providerName, area);

    // 4. cheap metadata scan (this is the call that fails for unimplemented providers)
    const scan = await provider.scanAreaMetadata(area, {
      maxPages: input.options?.maxPages,
      unchangedStreakStopThreshold: input.options?.unchangedStreakStopThreshold,
      sincePublishedAt: watermark?.latest_published_at ?? null,
      watermarkExternalId: watermark?.latest_external_id ?? null,
    });
    result.scannedCount = scan.listings.length;
    result.stopReason = scan.stopReason;

    // 6. existing sources for this area/provider
    const existing = await repo.getExistingSourcesForArea(orgId, providerName, area);
    const existingByExt = new Map(existing.map((s) => [s.external_id, s]));
    const seenExt = new Set<string>();

    // Intelligence context (only needed when we actually write). The scanned area
    // is treated as the agent's expertise area — the org chose to watch it.
    let settings: RadarSettingsLite = DEFAULT_RADAR_SETTINGS;
    const agentPreferences: AgentScoringPreferences = {
      expertiseCities: area.city ? [area.city] : [],
      expertiseNeighborhoods: area.neighborhood ? [area.neighborhood] : [],
    };
    if (!dryRun) {
      try {
        settings = await repo.getRadarSettings(orgId);
      } catch (e) {
        result.errors.push(`getRadarSettings: ${errMsg(e)}`); // non-fatal → partial
      }
    }

    // 5 + 7..10. validate + decide + apply per listing
    for (const meta of scan.listings) {
      const v = validateNormalizedListingMetadata(meta);
      if (!v.valid) {
        result.errors.push(
          `invalid listing ${meta?.externalId ?? "?"}: ${v.errors.join("; ")}`,
        );
        result.decisions.push({
          decision: "error",
          provider: providerName,
          externalId: meta?.externalId ?? "?",
          reason: v.errors.join("; "),
        });
        continue; // never crash the whole run on one bad row
      }

      seenExt.add(meta.externalId);
      const ex = existingByExt.get(meta.externalId) ?? null;
      const d = decideListingSync(meta, ex);

      // forceFullFetch upgrades UNCHANGED → UPDATED so the invariant
      // "UNCHANGED never full-fetches" is preserved.
      const decision =
        forceFullFetch && d.decision === "unchanged" ? "updated" : d.decision;

      const record: PropertySyncDecision = {
        decision,
        provider: providerName,
        externalId: meta.externalId,
        reason: decision === d.decision ? d.reason : "forceFullFetch refresh",
        existingSourceId: ex?.id,
        metadata: meta,
        previousHash: d.previousHash,
        nextHash: d.nextHash,
      };
      result.decisions.push(record);

      if (decision === "new") {
        if (!dryRun) {
          const sourceId = await repo.insertSourceFromMetadata(orgId, meta, d.nextHash);
          const details = await provider.fetchListingDetails(meta.externalId, meta.externalUrl);
          await repo.updateSourceFullDetails(sourceId, details, createListingContentHash(details));
          // Opportunity scoring + alert — resilient: failure → partial, not fatal.
          try {
            await evaluateListingOpportunity(repo, {
              orgId, area, source: details, propertySourceId: sourceId,
              settings, agentPreferences, isUpdate: false,
            });
          } catch (e) {
            result.errors.push(`intelligence ${meta.externalId}: ${errMsg(e)}`);
          }
        }
        result.fullFetchCount++;
        result.newCount++;
      } else if (decision === "updated") {
        if (!dryRun && ex) {
          const priceDropped =
            ex.price != null && meta.price != null && meta.price < ex.price;
          await repo.updateSourceSeen(ex.id, meta, d.nextHash);
          const details = await provider.fetchListingDetails(meta.externalId, meta.externalUrl);
          await repo.updateSourceFullDetails(ex.id, details, createListingContentHash(details));
          try {
            await evaluateListingOpportunity(repo, {
              orgId, area, source: details, propertySourceId: ex.id,
              settings, agentPreferences, isUpdate: true, priceDropped,
            });
          } catch (e) {
            result.errors.push(`intelligence ${meta.externalId}: ${errMsg(e)}`);
          }
        }
        result.fullFetchCount++;
        result.updatedCount++;
      } else {
        // UNCHANGED → touch last_seen only, NEVER a full fetch.
        if (!dryRun && ex) await repo.updateSourceSeen(ex.id, meta, d.nextHash);
        result.unchangedCount++;
      }
    }

    // 11 + 12. missing / deleted — active|missing sources not seen this scan
    for (const ex of existing) {
      if (seenExt.has(ex.external_id)) continue;
      if (ex.source_status === "deleted") continue;

      if (ex.missing_count >= MISSING_TO_DELETED_THRESHOLD) {
        if (!dryRun) await repo.markSourceDeleted(ex.id);
        result.deletedCount++;
        result.decisions.push({
          decision: "deleted",
          provider: providerName,
          externalId: ex.external_id,
          reason: `missing_count ${ex.missing_count} ≥ ${MISSING_TO_DELETED_THRESHOLD}`,
          existingSourceId: ex.id,
        });
      } else {
        if (!dryRun) await repo.markSourceMissing(ex.id);
        result.missingCount++;
        result.decisions.push({
          decision: "missing",
          provider: providerName,
          externalId: ex.external_id,
          reason: "not seen in latest scan",
          existingSourceId: ex.id,
        });
      }
    }

    // 13. watermark
    const newest = pickNewest(scan.listings);
    if (!dryRun) {
      await repo.upsertWatermark(orgId, providerName, area, {
        latestExternalId: newest?.externalId ?? watermark?.latest_external_id ?? null,
        latestPublishedAt: newest?.publishedAt ?? watermark?.latest_published_at ?? null,
        lastSuccessfulScanAt: new Date().toISOString(),
        lastPageScanned: scan.scannedPages,
        stopReason: scan.stopReason ?? null,
      });
    }

    // 6. credit accounting
    result.creditsUsed = scan.creditsUsedEstimate + result.fullFetchCount;
    result.creditsSavedEstimate = Math.max(0, result.scannedCount - result.fullFetchCount);

    // 14. close run
    result.status = result.errors.length > 0 ? "partial" : "success";
    if (!dryRun) {
      await repo.finishSyncRun(runId, {
        status: result.status,
        scannedCount: result.scannedCount,
        newCount: result.newCount,
        updatedCount: result.updatedCount,
        unchangedCount: result.unchangedCount,
        missingCount: result.missingCount,
        deletedCount: result.deletedCount,
        fullFetchCount: result.fullFetchCount,
        creditsUsed: result.creditsUsed,
        creditsSavedEstimate: result.creditsSavedEstimate,
        stopReason: result.stopReason ?? null,
        errorMessage: result.errors.length ? result.errors.join(" | ") : null,
      });
    }

    return result;
  } catch (err) {
    // 15. fatal error — record + close run as failed (never throw out).
    result.status = "failed";
    result.errors.push(errMsg(err));
    if (!dryRun && runId !== "dry-run") {
      try {
        await repo.finishSyncRun(runId, {
          status: "failed",
          scannedCount: result.scannedCount,
          newCount: result.newCount,
          updatedCount: result.updatedCount,
          unchangedCount: result.unchangedCount,
          missingCount: result.missingCount,
          deletedCount: result.deletedCount,
          fullFetchCount: result.fullFetchCount,
          creditsUsed: result.creditsUsed,
          creditsSavedEstimate: result.creditsSavedEstimate,
          stopReason: "error",
          errorMessage: errMsg(err),
        });
      } catch {
        /* best-effort — original error already captured */
      }
    }
    return result;
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
