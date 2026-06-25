// ============================================================================
// ZONO Property Radar™ — shared market sync engine.
// ----------------------------------------------------------------------------
// Scans a provider+area ONCE into the shared market cache, then fans out org-
// specific scores + alerts. TTL cache prevents duplicate scans across orgs.
// Storage-agnostic (MarketRepository) so it runs against Supabase or an in-memory
// repo (dev-check). Runs ALONGSIDE the existing org-level runPropertyAreaSync —
// that engine is untouched and keeps working.
// ============================================================================
import { getPropertyProvider } from "../providers/registry";
import { validateNormalizedListingMetadata } from "../providers/validation";
import type { NormalizedListingMetadata } from "../providers/types";
import { createListingContentHash } from "../utils";
import { createMarketAreaKey } from "./area-key";
import { computeNextScanAfter, DEFAULT_TTL_MINUTES, isCacheFresh } from "./cache-state";
import { fanoutMarketSourcesToRelevantOrgs } from "./fanout";
import type { FanoutSource, MarketRepository, MarketSyncInput, MarketSyncResult } from "./types";

const MISSING_TO_DELETED_THRESHOLD = 2;

export interface MarketSyncDeps {
  repo?: MarketRepository;
}

async function getDefaultRepository(): Promise<MarketRepository> {
  const mod = await import("./repository"); // server-only, lazy
  return mod.createMarketRepository();
}

function newest(listings: NormalizedListingMetadata[]): NormalizedListingMetadata | null {
  if (listings.length === 0) return null;
  let best = listings[0]!;
  let bestMs = best.publishedAt ? Date.parse(best.publishedAt) : NaN;
  for (const l of listings) {
    const ms = l.publishedAt ? Date.parse(l.publishedAt) : NaN;
    if (Number.isFinite(ms) && (!Number.isFinite(bestMs) || ms > bestMs)) { best = l; bestMs = ms; }
  }
  return best;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function runMarketAreaSync(
  input: MarketSyncInput,
  deps?: MarketSyncDeps,
): Promise<MarketSyncResult> {
  const now = new Date();
  const provider = input.providerName;
  const runType = input.runType ?? "automatic";
  const dryRun = input.options?.dryRun ?? false;
  const forceRefresh = input.options?.forceRefresh ?? false;
  const marketAreaKey = createMarketAreaKey(input.area);
  const city = input.area.city;
  const neighborhood = input.area.neighborhood ?? null;

  const result: MarketSyncResult = {
    runId: "dry-run",
    provider,
    marketAreaKey,
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
    affectedOrgsCount: 0,
    alertsCreatedCount: 0,
    errors: [],
  };

  let repo: MarketRepository;
  try {
    repo = deps?.repo ?? (await getDefaultRepository());
  } catch (e) {
    result.status = "failed";
    result.errors.push(`repository unavailable: ${errMsg(e)}`);
    return result;
  }

  const providerImpl = getPropertyProvider(provider); // pure

  try {
    // 2) TTL cache check — skip the scan entirely when fresh.
    const cacheState = await repo.getMarketAreaCacheState(provider, marketAreaKey);
    if (!forceRefresh && !dryRun && isCacheFresh(cacheState, now)) {
      result.status = "cache_fresh";
      return result;
    }

    // 3) open shared run
    if (!dryRun) {
      result.runId = await repo.createMarketSyncRun({ provider, marketAreaKey, city, neighborhood, runType });
    }

    // 5) watermark + 6) scan
    const watermark = await repo.getMarketWatermark(provider, marketAreaKey);
    const ttlMinutes = watermark?.ttl_minutes ?? cacheState?.ttl_minutes ?? DEFAULT_TTL_MINUTES;
    const scan = await providerImpl.scanAreaMetadata(input.area, {
      maxPages: input.options?.maxPages,
      unchangedStreakStopThreshold: input.options?.unchangedStreakStopThreshold,
      sincePublishedAt: watermark?.latest_published_at ?? null,
      watermarkExternalId: watermark?.latest_external_id ?? null,
    });
    result.scannedCount = scan.listings.length;

    // 7) decide vs shared sources
    const existing = await repo.getExistingMarketSourcesForArea(provider, marketAreaKey);
    const existingByExt = new Map(existing.map((s) => [s.external_id, s]));
    const seenExt = new Set<string>();
    const fanoutSources: FanoutSource[] = [];

    for (const meta of scan.listings) {
      const v = validateNormalizedListingMetadata(meta);
      if (!v.valid) { result.errors.push(`invalid ${meta?.externalId ?? "?"}: ${v.errors.join("; ")}`); continue; }
      seenExt.add(meta.externalId);
      const ex = existingByExt.get(meta.externalId) ?? null;
      const nextHash = createListingContentHash(meta);
      const decision = !ex ? "new" : ex.content_hash && ex.content_hash === nextHash ? "unchanged" : "updated";
      const priceDropped = !!ex && ex.price != null && meta.price != null && meta.price < ex.price;

      if (decision === "new") {
        if (!dryRun) {
          const sourceId = await repo.insertMarketSourceFromMetadata(meta, marketAreaKey, nextHash);
          const details = await providerImpl.fetchListingDetails(meta.externalId, meta.externalUrl);
          await repo.updateMarketSourceFullDetails(sourceId, details, createListingContentHash(details));
          fanoutSources.push({ sourceId, source: details, isNew: true, isUpdate: false, priceDropped: false });
        }
        result.fullFetchCount++; result.newCount++;
      } else if (decision === "updated") {
        if (!dryRun && ex) {
          await repo.updateMarketSourceSeen(ex.id, meta, nextHash);
          const details = await providerImpl.fetchListingDetails(meta.externalId, meta.externalUrl);
          await repo.updateMarketSourceFullDetails(ex.id, details, createListingContentHash(details));
          fanoutSources.push({ sourceId: ex.id, source: details, isNew: false, isUpdate: true, priceDropped });
        }
        result.fullFetchCount++; result.updatedCount++;
      } else {
        if (!dryRun && ex) await repo.updateMarketSourceSeen(ex.id, meta, nextHash);
        result.unchangedCount++;
      }
    }

    // 9) missing / deleted
    for (const ex of existing) {
      if (seenExt.has(ex.external_id) || ex.source_status === "deleted") continue;
      if (ex.missing_count >= MISSING_TO_DELETED_THRESHOLD) {
        if (!dryRun) await repo.markMarketSourceDeleted(ex.id);
        result.deletedCount++;
      } else {
        if (!dryRun) await repo.markMarketSourceMissing(ex.id);
        result.missingCount++;
      }
    }

    // 10) watermark
    const top = newest(scan.listings);
    if (!dryRun) {
      await repo.upsertMarketWatermark(provider, marketAreaKey, {
        latestExternalId: top?.externalId ?? watermark?.latest_external_id ?? null,
        latestPublishedAt: top?.publishedAt ?? watermark?.latest_published_at ?? null,
        lastSuccessfulScanAt: now.toISOString(),
        lastPageScanned: scan.scannedPages,
        stopReason: scan.stopReason ?? null,
      });
    }

    // 12) fan-out to relevant orgs (personal score + alerts)
    if (!dryRun && fanoutSources.length > 0) {
      try {
        const fan = await fanoutMarketSourcesToRelevantOrgs(repo, {
          provider, marketAreaKey, city, neighborhood, marketSources: fanoutSources,
        });
        result.affectedOrgsCount = fan.affectedOrgsCount;
        result.alertsCreatedCount = fan.alertsCreated;
      } catch (e) {
        result.errors.push(`fanout: ${errMsg(e)}`); // non-fatal → partial
      }
    }

    // 6/credits
    result.creditsUsed = scan.creditsUsedEstimate + result.fullFetchCount;
    result.creditsSavedEstimate = Math.max(0, result.scannedCount - result.fullFetchCount);

    // 11) cache state
    if (!dryRun) {
      await repo.upsertMarketAreaCacheState(provider, marketAreaKey, {
        city, neighborhood,
        lastScanAt: now.toISOString(),
        nextScanAfter: computeNextScanAfter(now, ttlMinutes),
        ttlMinutes,
        status: result.errors.length ? "error" : "fresh",
        activeOrgsCount: result.affectedOrgsCount,
        listingsCount: existing.length + result.newCount,
        lastNewCount: result.newCount,
        lastUpdatedCount: result.updatedCount,
        lastErrorMessage: result.errors.length ? result.errors.join(" | ") : null,
      });
    }

    // 13) finish run
    result.status = result.errors.length ? "partial" : "success";
    if (!dryRun) {
      await repo.finishMarketSyncRun(result.runId, {
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
        affectedOrgsCount: result.affectedOrgsCount,
        alertsCreatedCount: result.alertsCreatedCount,
        stopReason: scan.stopReason ?? null,
        errorMessage: result.errors.length ? result.errors.join(" | ") : null,
      });
    }
    return result;
  } catch (e) {
    result.status = "failed";
    result.errors.push(errMsg(e));
    if (!dryRun && result.runId !== "dry-run") {
      try {
        await repo.finishMarketSyncRun(result.runId, {
          status: "failed", scannedCount: result.scannedCount, newCount: result.newCount,
          updatedCount: result.updatedCount, unchangedCount: result.unchangedCount,
          missingCount: result.missingCount, deletedCount: result.deletedCount,
          fullFetchCount: result.fullFetchCount, creditsUsed: result.creditsUsed,
          creditsSavedEstimate: result.creditsSavedEstimate, affectedOrgsCount: result.affectedOrgsCount,
          alertsCreatedCount: result.alertsCreatedCount, stopReason: "error", errorMessage: errMsg(e),
        });
      } catch { /* best-effort */ }
      try {
        await repo.upsertMarketAreaCacheState(provider, marketAreaKey, {
          city, neighborhood, status: "error", lastErrorMessage: errMsg(e),
        });
      } catch { /* best-effort */ }
    }
    return result;
  }
}
