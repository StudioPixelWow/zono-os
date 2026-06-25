// ============================================================================
// ZONO Property Radar™ — daily market events engine (orchestration).
// Once per day, cheaply re-scans each active area's metadata, diffs it against
// the cached sources, records market events, and fans the consequences
// (buyer matches, opportunity scores, alerts, perfect-match tasks) into the
// per-org tables. Full fetch happens ONLY when the content hash changed —
// credit usage stays controlled. Storage-agnostic (injectable repos).
// ============================================================================
import { getPropertyProvider } from "../providers/registry";
import { validateNormalizedListingMetadata } from "../providers/validation";
import { createListingContentHash } from "../utils";
import { calculatePropertyOpportunityScore } from "../intelligence/scoring";
import type { AgentScoringPreferences } from "../intelligence/types";
import { matchPropertyToBuyers, normalizeListingForMatching } from "../matching/engine";
import type { MatchableBuyer, MatchingPort } from "../matching/types";
import { endOfTodayIso } from "../matching/util";
import type { MarketRepository } from "../market/types";
import { detectPropertyChanges } from "./diff";
import { buildMarketEventAlert } from "./alerts";
import type {
  DailyMarketRefreshInput,
  DailyMarketRefreshResult,
  DetectedMarketEvent,
  MarketEventRepository,
  MarketEventSeverity,
  NormalizedListingMetadata,
} from "./types";

const MISSING_TO_DELETED_THRESHOLD = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DailyMarketEventsDeps {
  marketRepo?: MarketRepository;
  eventRepo?: MarketEventRepository;
  matching?: MatchingPort | null;
}

async function defaultMarketRepo(): Promise<MarketRepository> {
  return (await import("../market/repository")).createMarketRepository();
}
async function defaultEventRepo(): Promise<MarketEventRepository> {
  return (await import("./repository")).createMarketEventRepository();
}
async function defaultMatching(): Promise<MatchingPort | null> {
  try { return (await import("../matching/repository")).createMatchingRepository(); }
  catch { return null; }
}

function errMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

/** A source that changed during the refresh and must be re-evaluated per org. */
interface ChangedSource {
  sourceId: string;
  source: NormalizedListingMetadata;
  events: DetectedMarketEvent[];
}

export async function runDailyMarketEventsRefresh(
  input: DailyMarketRefreshInput = {},
  deps?: DailyMarketEventsDeps,
): Promise<DailyMarketRefreshResult> {
  const now = new Date();
  const since24h = new Date(now.getTime() - DAY_MS).toISOString();
  const dryRun = input.dryRun ?? false;

  const result: DailyMarketRefreshResult = {
    status: "success", providers: [], areasProcessed: 0, sourcesRefreshed: 0,
    metadataScans: 0, fullFetches: 0, eventsCreated: 0, priceDrops: 0, priceIncreases: 0,
    hotDeals: 0, removed: 0, backOnMarket: 0, statusChanged: 0, metadataChanged: 0,
    buyerMatchGained: 0, buyerMatchLost: 0, alertsCreated: 0, matchesRecalculated: 0,
    affectedOrgs: 0, creditsUsedEstimate: 0, errors: [],
  };

  let marketRepo: MarketRepository, eventRepo: MarketEventRepository, matching: MatchingPort | null;
  try {
    marketRepo = deps?.marketRepo ?? (await defaultMarketRepo());
    eventRepo = deps?.eventRepo ?? (await defaultEventRepo());
    matching = deps && "matching" in deps ? deps.matching ?? null : await defaultMatching();
  } catch (e) {
    result.status = "failed";
    result.errors.push(`repositories unavailable: ${errMsg(e)}`);
    return result;
  }

  let areas;
  try {
    areas = await eventRepo.getActiveMarketAreas(input.providerName, input.marketAreaKey);
  } catch (e) {
    result.status = "failed";
    result.errors.push(`getActiveMarketAreas: ${errMsg(e)}`);
    return result;
  }
  if (input.maxAreas && input.maxAreas > 0) areas = areas.slice(0, input.maxAreas);

  const providers = new Set<string>();
  const affectedOrgIds = new Set<string>();

  const bump = (ev: DetectedMarketEvent["eventType"]) => {
    if (ev === "price_drop") result.priceDrops++;
    else if (ev === "price_increase") result.priceIncreases++;
    else if (ev === "hot_deal") result.hotDeals++;
    else if (ev === "back_on_market") result.backOnMarket++;
    else if (ev === "status_changed") result.statusChanged++;
    else if (ev === "metadata_changed") result.metadataChanged++;
  };

  for (const area of areas) {
    providers.add(area.provider);
    try {
      const providerImpl = getPropertyProvider(area.provider); // pure
      const existing = await marketRepo.getExistingMarketSourcesForArea(area.provider, area.marketAreaKey);
      const byExt = new Map(existing.map((s) => [s.external_id, s]));
      const seen = new Set<string>();

      const scan = await providerImpl.scanAreaMetadata(
        { city: area.city ?? "", neighborhood: area.neighborhood, provider: area.provider },
        {},
      );
      result.metadataScans++;
      result.creditsUsedEstimate += scan.creditsUsedEstimate;
      let listings = scan.listings;
      if (input.maxListings && input.maxListings > 0) listings = listings.slice(0, input.maxListings);

      const changed: ChangedSource[] = [];

      for (const meta of listings) {
        const v = validateNormalizedListingMetadata(meta);
        if (!v.valid) { result.errors.push(`invalid ${meta?.externalId ?? "?"}`); continue; }
        seen.add(meta.externalId);
        const ex = byExt.get(meta.externalId) ?? null;

        if (!ex) {
          // A listing not previously cached appears — track it (insert + full fetch).
          if (dryRun) continue;
          const sourceId = await marketRepo.insertMarketSourceFromMetadata(meta, area.marketAreaKey, createListingContentHash(meta));
          const details = await providerImpl.fetchListingDetails(meta.externalId, meta.externalUrl);
          await marketRepo.updateMarketSourceFullDetails(sourceId, details, createListingContentHash(details));
          result.fullFetches++; result.creditsUsedEstimate++;
          changed.push({ sourceId, source: details, events: [] });
          continue;
        }

        const diff = detectPropertyChanges(ex, meta);
        if (!dryRun) await marketRepo.updateMarketSourceSeen(ex.id, meta, diff.nextHash);
        result.sourcesRefreshed++;

        // Full fetch ONLY when the content hash changed (or forced) — credit control.
        let sourceMeta: NormalizedListingMetadata = meta;
        if (!dryRun && (diff.needsFullFetch || input.forceFullFetch)) {
          const details = await providerImpl.fetchListingDetails(meta.externalId, meta.externalUrl);
          await marketRepo.updateMarketSourceFullDetails(ex.id, details, createListingContentHash(details));
          result.fullFetches++; result.creditsUsedEstimate++;
          sourceMeta = details;
        }

        // Persist detected events.
        for (const ev of diff.events) {
          bump(ev.eventType);
          if (!dryRun) {
            await eventRepo.insertMarketEvent({
              marketPropertySourceId: ex.id, provider: area.provider, marketAreaKey: area.marketAreaKey,
              city: area.city, neighborhood: area.neighborhood, eventType: ev.eventType, severity: ev.severity,
              previousValue: ev.previousValue, nextValue: ev.nextValue,
              priceDelta: ev.priceDelta ?? null, priceDeltaPercent: ev.priceDeltaPercent ?? null,
            });
            result.eventsCreated++;
          }
        }
        if (diff.changed) changed.push({ sourceId: ex.id, source: sourceMeta, events: diff.events });
      }

      // Missing / removed sweep.
      for (const ex of existing) {
        if (seen.has(ex.external_id) || ex.source_status === "deleted") continue;
        if (ex.missing_count >= MISSING_TO_DELETED_THRESHOLD) {
          if (!dryRun) {
            await marketRepo.markMarketSourceDeleted(ex.id);
            await eventRepo.insertMarketEvent({
              marketPropertySourceId: ex.id, provider: area.provider, marketAreaKey: area.marketAreaKey,
              city: area.city, neighborhood: area.neighborhood, eventType: "removed", severity: "medium",
              previousValue: { source_status: ex.source_status }, nextValue: { source_status: "deleted" },
            });
            result.eventsCreated++;
            if (matching) { try { await matching.markMatchesInactiveForSource(ex.id); } catch (e) { result.errors.push(`deactivate ${ex.id}: ${errMsg(e)}`); } }
          }
          result.removed++;
        } else if (!dryRun) {
          await marketRepo.markMarketSourceMissing(ex.id);
        }
      }

      // Re-evaluate changed sources for each relevant org (matches/scores/alerts/tasks).
      if (!dryRun && changed.length > 0 && matching) {
        const orgs = await marketRepo.getRelevantOrgsForMarketArea(area.city ?? "", area.neighborhood);
        for (const { orgId } of orgs) {
          let buyers: MatchableBuyer[];
          try { buyers = await matching.getActiveBuyersForOrg(orgId); }
          catch (e) { result.errors.push(`buyers ${orgId}: ${errMsg(e)}`); continue; }
          affectedOrgIds.add(orgId);
          const prefs: AgentScoringPreferences = {
            expertiseCities: area.city ? [area.city] : [], expertiseNeighborhoods: area.neighborhood ? [area.neighborhood] : [],
          };
          for (const cs of changed) {
            try {
              await recomputeOrgSource({
                marketRepo, eventRepo, matching, orgId, area, buyers, prefs, changed: cs, since24h, result, bump,
              });
            } catch (e) { result.errors.push(`recompute ${orgId}/${cs.sourceId}: ${errMsg(e)}`); }
          }
        }
      }
    } catch (e) {
      result.errors.push(`${area.provider}/${area.city ?? "?"}: ${errMsg(e)}`);
    }
    result.areasProcessed++;
  }

  result.providers = [...providers] as DailyMarketRefreshResult["providers"];
  result.affectedOrgs = affectedOrgIds.size;
  result.status = result.errors.length ? "partial" : "success";
  return result;
}

// ── Per-(org, changed source) recompute ──────────────────────────────────────
interface RecomputeCtx {
  marketRepo: MarketRepository;
  eventRepo: MarketEventRepository;
  matching: MatchingPort;
  orgId: string;
  area: { provider: NormalizedListingMetadata["provider"]; marketAreaKey: string; city: string | null; neighborhood: string | null };
  buyers: MatchableBuyer[];
  prefs: AgentScoringPreferences;
  changed: ChangedSource;
  since24h: string;
  result: DailyMarketRefreshResult;
  bump: (ev: DetectedMarketEvent["eventType"]) => void;
}

async function recomputeOrgSource(ctx: RecomputeCtx): Promise<void> {
  const { marketRepo, eventRepo, matching, orgId, area, buyers, prefs, changed, since24h, result } = ctx;
  const sourceId = changed.sourceId;

  const prevActive = await matching.countRelevantMatchesForSource(orgId, sourceId);

  const property = normalizeListingForMatching(changed.source, sourceId);
  const matchRes = matchPropertyToBuyers({ property, buyers });
  const relevantIds = matchRes.matches.map((m) => m.buyerId);

  for (const m of matchRes.matches) {
    const up = await matching.upsertBuyerPropertyMatch({
      orgId, buyerId: m.buyerId, marketPropertySourceId: sourceId, matchScore: m.matchScore,
      matchLevel: m.matchLevel, breakdown: m.breakdown, manualBonus: m.manualBonus, manualPenalty: m.manualPenalty,
      explanation: m.explanation,
    });
    // Perfect match → high-priority "contact the buyer" task (deduped).
    if (m.matchLevel === "perfect" && (up.created || up.scoreChanged)) {
      if (!(await matching.perfectMatchTaskExists(orgId, m.buyerId, sourceId))) {
        await matching.createPerfectMatchTask({ orgId, buyerId: m.buyerId, marketPropertySourceId: sourceId, buyerName: m.buyer.fullName, dueAtIso: endOfTodayIso(), matchScore: m.matchScore });
      }
    }
  }
  await matching.reconcileActiveMatches(orgId, sourceId, relevantIds);
  result.matchesRecalculated++;
  const newActive = matchRes.relevantCount;

  // Opportunity score + personal link, using the fresh buyer count.
  const score = calculatePropertyOpportunityScore({ orgId, source: changed.source, area: { city: area.city ?? "", neighborhood: area.neighborhood }, buyerMatchCount: newActive, agentPreferences: prefs });
  const { linkId } = await marketRepo.upsertOrgMarketPropertyLink(orgId, sourceId, {
    relevanceStatus: newActive > 0 ? "relevant" : "watch", opportunityScore: score.totalScore,
    buyerMatchCount: newActive, reasons: score.reasons, recommendation: score.recommendation,
  });

  // Buyer-relevance change → market event (+ alert when gained & worthwhile).
  const eventsForAlerts: DetectedMarketEvent[] = [...changed.events];
  if (newActive > prevActive) {
    const severity: MarketEventSeverity = newActive >= 3 ? "high" : "medium";
    const gained: DetectedMarketEvent = { eventType: "buyer_match_gained", severity, previousValue: { count: prevActive }, nextValue: { count: newActive } };
    await eventRepo.insertMarketEvent({
      marketPropertySourceId: sourceId, provider: area.provider, marketAreaKey: area.marketAreaKey,
      city: area.city, neighborhood: area.neighborhood, eventType: "buyer_match_gained", severity,
      previousValue: gained.previousValue, nextValue: gained.nextValue, metadata: { orgId },
    });
    result.eventsCreated++; result.buyerMatchGained++;
    eventsForAlerts.push(gained);
  } else if (newActive < prevActive) {
    await eventRepo.insertMarketEvent({
      marketPropertySourceId: sourceId, provider: area.provider, marketAreaKey: area.marketAreaKey,
      city: area.city, neighborhood: area.neighborhood, eventType: "buyer_match_lost", severity: "low",
      previousValue: { count: prevActive }, nextValue: { count: newActive }, metadata: { orgId },
    });
    result.eventsCreated++; result.buyerMatchLost++;
  }

  // Meaningful event alerts (price drop / hot deal / back on market / gained), deduped 24h.
  for (const ev of eventsForAlerts) {
    const built = buildMarketEventAlert({ event: ev, source: changed.source, marketPropertySourceId: sourceId, buyerMatchCount: newActive, opportunityScore: score.totalScore });
    if (!built) continue;
    if (await eventRepo.recentOrgEventAlertExists(orgId, sourceId, built.alertType, since24h)) continue;
    await marketRepo.insertMarketAlert({
      orgId, marketPropertySourceId: sourceId, orgMarketPropertyLinkId: linkId,
      alertType: built.alertType, title: built.title, message: built.message, priority: built.priority,
      opportunityScore: built.opportunityScore, metadata: built.metadata,
    });
    result.alertsCreated++;
  }
}
