/**
 * Transactions Intelligence service — server-only. Coverage targets, Apify sync
 * (with dev-only clearly-marked mock fallback), comparable-based property
 * research, building & street intelligence and the opportunity radar. Org-scoped.
 * Deterministic. No LLM. Never invents transaction data in production.
 */
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";
import {
  buildingIntelligence, detectOpportunity, deduplicateTransactions, isLargeCity, normalizeCityName,
  normalizeNeighborhoodName, normalizeStreetName, normalizeTransactionAddress, priceStats, priceTrend, researchProperty, streetIntelligence,
  TRANSACTIONS_ACTOR_NAME, type ResearchInput, type ResearchResult, type TxnComparable,
} from "./engine";
import {
  buildCityCoverageInput, buildTransactionsInput, canonicalCityName, fetchDatasetItems, getTransactionsRun, govmapActorId,
  isTransactionsApifyConfigured, MAX_TXNS_PER_PULL, normalizeTransaction, runTransactionsActor, startTransactionsRun,
  type NormalizedTransaction,
} from "./providers";
import { fetchMadlanDealsFromDataset, getMadlanRun, isMadlanConfigured, MADLAN_ACTOR_NAME, MADLAN_SOURCE, madlanActorId, madlanDocId, normalizeMadlanTransaction, runMadlanDeals, startMadlanRun, type NormalizedMadlanTransaction } from "./madlan";

const MADLAN_MAX_ROWS = 1000;
/** Newest-first, capped to the most recent N — matches Madlan's city page. */
function topRecent(rows: NormalizedMadlanTransaction[]): NormalizedMadlanTransaction[] {
  return [...rows].sort((a, b) => (b.dealDate ?? "").localeCompare(a.dealDate ?? "")).slice(0, MADLAN_MAX_ROWS);
}

type DB = Database["public"]["Tables"];
const isDev = process.env.NODE_ENV !== "production";

async function ctx() {
  const { user, profile, organization } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  return { userId: user.id, orgId: profile.org_id, profile, organization };
}

// ── Agent market coverage resolution ─────────────────────────────────────────
// `city` is the canonical GovMap spelling (קריית…) used for storage + filtering.
// `rawCity` is the agent's original spelling (קרית…) — what Madlan expects.
interface AgentMarket { city: string | null; rawCity: string | null; neighborhoods: string[] }

function resolveAgentMarket(profile: DB["users"]["Row"], org: DB["organizations"]["Row"] | null): AgentMarket {
  const city = profile.primary_city || profile.operating_city || (org?.operating_cities?.[0] ?? null);
  const primary = Array.isArray(profile.primary_neighborhoods) ? (profile.primary_neighborhoods as string[]) : [];
  const neighborhoods = (primary.length ? primary : profile.operating_neighborhoods?.length ? profile.operating_neighborhoods : org?.operating_neighborhoods ?? [])
    .map((n) => normalizeNeighborhoodName(n))
    .filter((n): n is string => !!n);
  return { city: canonicalCityName(city), rawCity: city ? String(city).trim() : null, neighborhoods };
}

export interface CoverageEnsureResult { created: number; city: string | null; needsConfig: boolean; largeCityWarning: boolean }

export async function ensureCoverageTargetsForAgent(): Promise<CoverageEnsureResult> {
  const { orgId, profile, organization } = await ctx();
  const supabase = await createClient();
  const market = resolveAgentMarket(profile, organization);
  if (!market.city) return { created: 0, city: null, needsConfig: true, largeCityWarning: false };

  const { data: existing } = await supabase.from("geo_coverage_targets").select("city_name,neighborhood_name").eq("organization_id", orgId);
  const have = new Set((existing ?? []).map((e) => `${e.city_name}|${e.neighborhood_name ?? ""}`));
  const rows: DB["geo_coverage_targets"]["Insert"][] = [];
  if (market.neighborhoods.length) {
    for (const n of market.neighborhoods) {
      if (have.has(`${market.city}|${n}`)) continue;
      rows.push({ organization_id: orgId, city_name: market.city, neighborhood_name: n, coverage_status: "pending", priority: 1 });
    }
  } else if (!have.has(`${market.city}|`)) {
    rows.push({ organization_id: orgId, city_name: market.city, coverage_status: "pending_neighborhoods", priority: 1, metadata: isLargeCity(market.city) ? { warning: "עיר גדולה — מומלץ להגדיר שכונות לכיסוי מלא" } : {} });
  }
  if (rows.length) await supabase.from("geo_coverage_targets").insert(rows as never);
  return { created: rows.length, city: market.city, needsConfig: false, largeCityWarning: isLargeCity(market.city) && !market.neighborhoods.length };
}

// ── Dev-only, clearly-marked mock transactions ───────────────────────────────
function devMockRaws(city: string, neighborhood: string | null, n = 24): Record<string, unknown>[] {
  const streets = ["הרצל", "ויצמן", "בן גוריון", "רוטשילד", "ז׳בוטינסקי"];
  return Array.from({ length: n }, (_, i) => {
    const area = 60 + (i % 6) * 12;
    const ppsqm = 22000 + (i % 5) * 2200 + (i % 2 ? 800 : 0);
    const d = new Date(); d.setMonth(d.getMonth() - (i % 30));
    return {
      _mock: true, assetId: `MOCK-${city}-${neighborhood ?? "city"}-${1000 + i}`,
      dealDate: d.toISOString().slice(0, 10), dealAmount: ppsqm * area, pricePerSqm: ppsqm,
      address: `${streets[i % streets.length]} ${5 + (i % 40)}`, cityName: city, neighborhood: neighborhood ?? "מרכז",
      rooms: 3 + (i % 3) * 0.5, floor: String(1 + (i % 6)), area, propertyType: "דירה",
      gush: String(10000 + (i % 50)), helka: String(1 + (i % 200)), tatHelka: String(1 + (i % 9)),
    };
  });
}

// ── Sync one coverage target ─────────────────────────────────────────────────
export interface SyncTargetResult { imported: number; duplicates: number; total: number; status: string; mock: boolean; error: string | null }

export async function syncCoverageTarget(targetId: string, dealDateRange = "all"): Promise<SyncTargetResult> {
  const { orgId, userId } = await ctx();
  const supabase = await createClient();
  const { data: target } = await supabase.from("geo_coverage_targets").select("*").eq("id", targetId).maybeSingle();
  if (!target) throw new Error("coverage target not found");

  const startedAt = new Date().toISOString();
  await supabase.from("geo_coverage_targets").update({ coverage_status: "syncing" } as never).eq("id", targetId);

  let raws: Record<string, unknown>[] = [];
  let mock = false;
  let error: string | null = null;
  try {
    if (isTransactionsApifyConfigured()) {
      raws = await runTransactionsActor(buildTransactionsInput(target.city_name, target.neighborhood_name, dealDateRange));
    } else if (isDev) {
      raws = devMockRaws(target.city_name, target.neighborhood_name); mock = true;
    } else {
      throw new Error("APIFY_TOKEN missing — transaction sync unavailable in production");
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "sync failed";
  }

  let imported = 0; let duplicates = 0;
  if (!error) {
    const normalized = deduplicateTransactions(raws.map(normalizeTransaction).map((t) => ({ ...t, asset_id: t.assetId, city_name: canonicalCityName(t.cityName), normalized_address: t.normalizedAddress, deal_date: t.dealDate, deal_amount: t.dealAmount, area: t.area })));
    const res = await persistTransactions(orgId, normalized);
    imported = res.imported; duplicates = res.duplicates;
  }

  const status = error ? "failed" : "completed";
  await supabase.from("geo_coverage_targets").update({
    coverage_status: error ? "failed" : "completed", last_sync_at: new Date().toISOString(),
    transactions_found: (target.transactions_found ?? 0) + imported, last_error: error,
  } as never).eq("id", targetId);

  await supabase.from("transaction_sync_logs").insert({
    organization_id: orgId, agent_id: userId, user_id: userId, city_name: target.city_name, neighborhood_name: target.neighborhood_name,
    coverage_target_id: targetId, actor_name: TRANSACTIONS_ACTOR_NAME, actor_id: govmapActorId(),
    status: error ? "failed" : "completed", started_at: startedAt, finished_at: new Date().toISOString(),
    records_imported: imported, duplicates_skipped: duplicates, total_records: imported + duplicates,
    error_message: error, raw_response: mock ? { mock: true } : {},
  } as never);

  return { imported, duplicates, total: imported + duplicates, status, mock, error };
}

/** Insert only genuinely-new transactions (asset + fallback dedup vs DB). */
async function persistTransactions(orgId: string, normalized: (NormalizedTransaction & { asset_id: string | null; city_name: string | null; normalized_address: string | null; deal_date: string | null; deal_amount: number | null; area: number | null })[]): Promise<{ imported: number; duplicates: number }> {
  if (!normalized.length) return { imported: 0, duplicates: 0 };
  const supabase = await createClient();
  const assetIds = normalized.map((t) => t.asset_id).filter((x): x is string => !!x);
  const normAddrs = normalized.map((t) => t.normalized_address).filter((x): x is string => !!x);

  const existingAssets = new Set<string>();
  const existingFallback = new Set<string>();
  if (assetIds.length) {
    const { data } = await supabase.from("property_transactions").select("asset_id").eq("organization_id", orgId).in("asset_id", assetIds);
    for (const r of data ?? []) if (r.asset_id) existingAssets.add(r.asset_id);
  }
  if (normAddrs.length) {
    const { data } = await supabase.from("property_transactions").select("city_name,normalized_address,deal_date,deal_amount,area").eq("organization_id", orgId).in("normalized_address", normAddrs);
    for (const r of data ?? []) existingFallback.add(`${r.city_name ?? ""}|${r.normalized_address ?? ""}|${r.deal_date ?? ""}|${r.deal_amount ?? ""}|${r.area ?? ""}`);
  }

  const toInsert: DB["property_transactions"]["Insert"][] = [];
  let duplicates = 0;
  for (const t of normalized) {
    const dup = t.asset_id ? existingAssets.has(t.asset_id) : existingFallback.has(`${t.city_name ?? ""}|${t.normalized_address ?? ""}|${t.deal_date ?? ""}|${t.deal_amount ?? ""}|${t.area ?? ""}`);
    if (dup) { duplicates++; continue; }
    toInsert.push({
      organization_id: orgId, source_platform: t.sourcePlatform, source_actor: t.sourceActor,
      asset_id: t.assetId, external_id: t.externalId, deal_date: t.dealDate, deal_amount: t.dealAmount, price_per_sqm: t.pricePerSqm,
      address: t.address, normalized_address: t.normalizedAddress, city_name: canonicalCityName(t.cityName), neighborhood_name: t.neighborhoodName,
      street: t.street, street_number: t.streetNumber, lat: t.lat, lng: t.lng, rooms: t.rooms, floor: t.floor, area: t.area,
      property_type: t.propertyType, is_first_hand: t.isFirstHand, gush: t.gush, helka: t.helka, tat_helka: t.tatHelka,
      raw_payload: t.rawPayload as never, scraped_at: new Date().toISOString(),
    });
  }
  let imported = 0;
  for (let i = 0; i < toInsert.length; i += 300) {
    const chunk = toInsert.slice(i, i + 300);
    const { error } = await supabase.from("property_transactions").insert(chunk as never);
    if (!error) imported += chunk.length;
  }
  return { imported, duplicates };
}

// ── Madlan (PRIMARY city-coverage source) ───────────────────────────────────
export interface MadlanSyncResult { imported: number; duplicates: number; crossSource: number; deals: number; needsConfig: boolean; error: string | null }

/** Pull the full Madlan city transaction list for the agent's city (primary). */
export async function syncMadlanForAgent(): Promise<MadlanSyncResult> {
  const { orgId, userId, profile, organization } = await ctx();
  const market = resolveAgentMarket(profile, organization);
  if (!market.city) return { imported: 0, duplicates: 0, crossSource: 0, deals: 0, needsConfig: true, error: null };
  if (!isMadlanConfigured()) {
    return { imported: 0, duplicates: 0, crossSource: 0, deals: 0, needsConfig: false, error: "APIFY_TOKEN missing — Madlan sync unavailable" };
  }
  const supabase = await createClient();
  const startedAt = new Date().toISOString();
  let deals = 0, imported = 0, duplicates = 0, crossSource = 0, error: string | null = null;
  try {
    // Madlan needs the precise area docId (קרית-ביאליק-ישראל), not a free name.
    const madlanCity = madlanDocId(market.rawCity ?? market.city!);
    const raws = await runMadlanDeals(madlanCity, null);
    deals = raws.length;
    const res = await persistMadlanTransactions(orgId, topRecent(raws.map(normalizeMadlanTransaction)));
    imported = res.imported; duplicates = res.duplicates; crossSource = res.crossSource;
  } catch (e) {
    error = e instanceof Error ? e.message : "madlan sync failed";
  }
  await supabase.from("transaction_sync_logs").insert({
    organization_id: orgId, agent_id: userId, user_id: userId, city_name: market.city,
    actor_name: MADLAN_ACTOR_NAME, actor_id: madlanActorId(), status: error ? "failed" : "completed",
    started_at: startedAt, finished_at: new Date().toISOString(), records_imported: imported,
    duplicates_skipped: duplicates, total_records: deals, error_message: error, raw_response: { source: MADLAN_SOURCE, crossSource },
  } as never);
  return { imported, duplicates, crossSource, deals, needsConfig: false, error };
}

// ── Non-blocking Madlan sync (client-polled live progress) ───────────────────
export interface MadlanStart { runId: string | null; datasetId: string | null; city: string | null; needsConfig: boolean; error: string | null }

/** Kick off the Madlan run (returns immediately) so the UI can poll progress. */
export async function startMadlanSync(): Promise<MadlanStart> {
  const { profile, organization } = await ctx();
  const market = resolveAgentMarket(profile, organization);
  if (!market.city) return { runId: null, datasetId: null, city: null, needsConfig: true, error: null };
  if (!isMadlanConfigured()) return { runId: null, datasetId: null, city: market.city, needsConfig: false, error: "APIFY_TOKEN missing — Madlan sync unavailable" };
  const madlanCity = madlanDocId(market.rawCity ?? market.city!);
  try {
    const r = await startMadlanRun(madlanCity, null);
    return { runId: r.runId, datasetId: r.datasetId, city: madlanCity, needsConfig: false, error: null };
  } catch (e) {
    return { runId: null, datasetId: null, city: madlanCity, needsConfig: false, error: e instanceof Error ? e.message : "failed to start" };
  }
}

/** Poll the run's status (the actor builds one city record, so `found` flips to ≥1 near the end). */
export async function pollMadlanSync(runId: string): Promise<{ status: string; found: number; datasetId: string | null }> {
  await ctx();
  const r = await getMadlanRun(runId);
  return { status: r.status, found: r.found, datasetId: r.datasetId };
}

/** After the run SUCCEEDED: fetch + persist the deals, log, recompute. */
export async function finishMadlanSync(datasetId: string): Promise<MadlanSyncResult> {
  const { orgId, userId, profile, organization } = await ctx();
  const market = resolveAgentMarket(profile, organization);
  const startedAt = new Date().toISOString();
  let deals = 0, imported = 0, duplicates = 0, crossSource = 0, error: string | null = null;
  try {
    const raws = await fetchMadlanDealsFromDataset(datasetId);
    deals = raws.length;
    const res = await persistMadlanTransactions(orgId, topRecent(raws.map(normalizeMadlanTransaction)));
    imported = res.imported; duplicates = res.duplicates; crossSource = res.crossSource;
  } catch (e) {
    error = e instanceof Error ? e.message : "madlan finish failed";
  }
  const supabase = await createClient();
  await supabase.from("transaction_sync_logs").insert({
    organization_id: orgId, agent_id: userId, user_id: userId, city_name: market.city,
    actor_name: MADLAN_ACTOR_NAME, actor_id: madlanActorId(), status: error ? "failed" : "completed",
    started_at: startedAt, finished_at: new Date().toISOString(), records_imported: imported,
    duplicates_skipped: duplicates, total_records: deals, error_message: error, raw_response: { source: MADLAN_SOURCE, crossSource },
  } as never);
  // NOTE: heavy street/building recompute is intentionally NOT awaited here — it
  // can take long and froze the finish step. It runs on the GovMap sync instead.
  return { imported, duplicates, crossSource, deals, needsConfig: false, error };
}

/** Insert new Madlan rows; dedup by madlan id + composite; mark cross-source dups vs GovMap. */
async function persistMadlanTransactions(orgId: string, rows: NormalizedMadlanTransaction[]): Promise<{ imported: number; duplicates: number; crossSource: number }> {
  if (!rows.length) return { imported: 0, duplicates: 0, crossSource: 0 };
  const supabase = await createClient();
  const madlanIds = rows.map((r) => r.madlanTransactionId).filter((x): x is string => !!x);
  const normAddrs = [...new Set(rows.map((r) => r.normalizedAddress).filter((x): x is string => !!x))];

  const existingMadlanIds = new Set<string>();
  if (madlanIds.length) {
    const { data } = await supabase.from("property_transactions").select("madlan_transaction_id").eq("organization_id", orgId).in("madlan_transaction_id", madlanIds);
    for (const r of data ?? []) if (r.madlan_transaction_id) existingMadlanIds.add(r.madlan_transaction_id);
  }
  // Existing rows (any source) at these addresses — for fallback dedup + cross-source linking.
  const govmapByKey = new Map<string, string>();
  const existingMadlanKeys = new Set<string>();
  if (normAddrs.length) {
    for (let i = 0; i < normAddrs.length; i += 200) {
      const { data } = await supabase.from("property_transactions").select("id,source_platform,city_name,normalized_address,deal_date,deal_amount,area").eq("organization_id", orgId).in("normalized_address", normAddrs.slice(i, i + 200));
      for (const r of data ?? []) {
        const key = `${canonicalCityName(r.city_name) ?? ""}|${r.normalized_address ?? ""}|${r.deal_date ?? ""}|${r.deal_amount ?? ""}|${r.area ?? ""}`;
        if (r.source_platform === "govmap_transactions") govmapByKey.set(key, r.id);
        else existingMadlanKeys.add(key);
      }
    }
  }

  const toInsert: DB["property_transactions"]["Insert"][] = [];
  let duplicates = 0, crossSource = 0;
  const batchKeys = new Set<string>();
  for (const t of rows) {
    const canonCity = canonicalCityName(t.cityName);
    const key = `${canonCity ?? ""}|${t.normalizedAddress ?? ""}|${t.dealDate ?? ""}|${t.dealAmount ?? ""}|${t.area ?? ""}`;
    if ((t.madlanTransactionId && existingMadlanIds.has(t.madlanTransactionId)) || existingMadlanKeys.has(key) || batchKeys.has(key)) { duplicates++; continue; }
    batchKeys.add(key);
    const govmapId = govmapByKey.get(key) ?? null;
    if (govmapId) crossSource++;
    toInsert.push({
      organization_id: orgId, source_platform: t.sourcePlatform, source_actor: t.sourceActor,
      madlan_transaction_id: t.madlanTransactionId, deal_date: t.dealDate, deal_amount: t.dealAmount, price_per_sqm: t.pricePerSqm,
      address: t.address, normalized_address: t.normalizedAddress, city_name: canonCity, neighborhood_name: t.neighborhoodName,
      street: t.street, street_number: t.streetNumber, rooms: t.rooms, floor: t.floor, area: t.area, property_type: t.propertyType,
      building_year: t.buildingYear, mediation: t.mediation, source_url: t.sourceUrl, duplicate_of: govmapId,
      raw_payload: t.rawPayload as never, scraped_at: new Date().toISOString(),
    });
  }
  let imported = 0;
  for (let i = 0; i < toInsert.length; i += 300) {
    const chunk = toInsert.slice(i, i + 300);
    const { error } = await supabase.from("property_transactions").insert(chunk as never);
    if (!error) imported += chunk.length;
  }
  return { imported, duplicates, crossSource };
}

/** Ensure targets then sync them all for the current agent's city. */
export async function syncTransactionsForAgent(dealDateRange = "all"): Promise<{ targets: number; imported: number; duplicates: number; mock: boolean; needsConfig: boolean }> {
  const ensure = await ensureCoverageTargetsForAgent();
  if (ensure.needsConfig) return { targets: 0, imported: 0, duplicates: 0, mock: false, needsConfig: true };
  const { orgId } = await ctx();
  const supabase = await createClient();
  const { data: targets } = await supabase.from("geo_coverage_targets").select("id").eq("organization_id", orgId).neq("coverage_status", "disabled").order("priority", { ascending: true }).limit(40);
  let imported = 0, duplicates = 0, mock = false;
  for (const t of targets ?? []) {
    try { const r = await syncCoverageTarget(t.id, dealDateRange); imported += r.imported; duplicates += r.duplicates; mock = mock || r.mock; } catch { /* isolate target failure */ }
  }
  // Recompute derived intel after a sync.
  await recomputeDerivedIntelligence();
  return { targets: (targets ?? []).length, imported, duplicates, mock, needsConfig: false };
}

export async function refreshAgentCityRecent(): Promise<{ targets: number; imported: number; duplicates: number; mock: boolean; needsConfig: boolean }> {
  return syncTransactionsForAgent("12");
}

export async function retryFailedTransactionSyncs(): Promise<{ retried: number; imported: number }> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const { data: failed } = await supabase.from("geo_coverage_targets").select("id").eq("organization_id", orgId).eq("coverage_status", "failed").limit(20);
  let imported = 0;
  for (const t of failed ?? []) { try { imported += (await syncCoverageTarget(t.id)).imported; } catch { /* skip */ } }
  if (failed?.length) await recomputeDerivedIntelligence();
  return { retried: (failed ?? []).length, imported };
}

// ── Transaction pool helper ──────────────────────────────────────────────────
async function loadPool(orgId: string, opts: { city?: string | null; neighborhood?: string | null; street?: string | null; normalizedAddress?: string | null }): Promise<TxnComparable[]> {
  const supabase = await createClient();
  let q = supabase.from("property_transactions").select("id,deal_date,deal_amount,price_per_sqm,address,normalized_address,city_name,neighborhood_name,street,rooms,area,property_type").eq("organization_id", orgId);
  if (opts.city) q = q.eq("city_name", canonicalCityName(opts.city) ?? "");
  if (opts.normalizedAddress) q = q.eq("normalized_address", opts.normalizedAddress);
  else if (opts.street) q = q.eq("street", normalizeStreetName(opts.street) ?? "");
  else if (opts.neighborhood) q = q.eq("neighborhood_name", normalizeNeighborhoodName(opts.neighborhood) ?? "");
  const { data } = await q.order("deal_date", { ascending: false }).limit(1500);
  return (data ?? []) as TxnComparable[];
}

// ── Property research ────────────────────────────────────────────────────────
export interface ResearchSaveInput extends ResearchInput {
  propertyListingId?: string | null;
  externalListingId?: string | null;
  acquisitionProfileId?: string | null;
}

export async function researchPropertyAgainstTransactions(input: ResearchSaveInput, save = false, preloadedPool?: TxnComparable[]): Promise<{ result: ResearchResult; reportId: string | null; streetTrend12m: number | null }> {
  const { orgId, userId } = await ctx();
  const pool = preloadedPool ?? await loadPool(orgId, { city: input.cityName });
  const result = researchProperty(input, pool);
  const street = input.street ? normalizeStreetName(input.street) : (input.normalizedAddress ? normalizeStreetName(input.normalizedAddress) : null);
  const streetTxns = street ? pool.filter((t) => normalizeStreetName(t.street ?? t.normalized_address) === street) : [];
  const streetTrend12m = priceTrend(streetTxns, 12);

  const reportId = save ? await saveResearchReport(orgId, userId, input, result) : null;
  return { result, reportId, streetTrend12m };
}

/** Persist one research report + link it into the Knowledge Graph. Shared by
 *  single-property research and the pipeline-wide recompute. */
async function saveResearchReport(orgId: string, userId: string, input: ResearchSaveInput, result: ResearchResult): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("property_research_reports").insert({
    organization_id: orgId, property_listing_id: input.propertyListingId ?? null, external_listing_id: input.externalListingId ?? null,
    acquisition_profile_id: input.acquisitionProfileId ?? null, created_by: userId,
    city_name: input.cityName, neighborhood_name: input.neighborhoodName, address: input.normalizedAddress, normalized_address: input.normalizedAddress,
    rooms: input.rooms, area: input.area, asking_price: input.askingPrice, asking_price_per_sqm: result.askingPpsqm,
    estimated_market_value: result.estimatedMarketValue, avg_price_per_sqm: result.avgPpsqm, median_price_per_sqm: result.medianPpsqm,
    min_price_per_sqm: result.minPpsqm, max_price_per_sqm: result.maxPpsqm, gap_from_market_percent: result.gapFromMarketPercent,
    comparable_transactions: result.comparables.slice(0, 20) as never, confidence_score: result.confidenceScore, confidence_level: result.confidenceLevel,
    explanation_hebrew: result.explanationHebrew,
  } as never).select("id").maybeSingle();
  const reportId = data?.id ?? null;
  if (reportId) await linkResearchGraph(orgId, reportId, input);
  return reportId;
}

async function linkResearchGraph(orgId: string, reportId: string, input: ResearchSaveInput) {
  const supabase = await createClient();
  const rels: DB["entity_relationships"]["Insert"][] = [];
  if (input.propertyListingId) rels.push({ org_id: orgId, source_entity_type: "research_report", source_entity_id: reportId, target_entity_type: "property", target_entity_id: input.propertyListingId, relationship_type: "values", strength_score: 70, status: "active" } as never);
  if (input.acquisitionProfileId) rels.push({ org_id: orgId, source_entity_type: "research_report", source_entity_id: reportId, target_entity_type: "acquisition", target_entity_id: input.acquisitionProfileId, relationship_type: "values", strength_score: 70, status: "active" } as never);
  if (rels.length) await supabase.from("entity_relationships").insert(rels as never);
}

// ── Building / Street intelligence (recompute + upsert) ──────────────────────
export async function generateBuildingIntelligence(cityName: string, normalizedAddress: string): Promise<DB["building_intelligence"]["Row"] | null> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const pool = await loadPool(orgId, { city: cityName, normalizedAddress });
  if (!pool.length) return null;
  const b = buildingIntelligence(pool);
  const street = normalizeStreetName(normalizedAddress);
  const houseNumber = normalizedAddress.replace(/^.*?\s(\d+[א-ת]?)$/u, "$1");
  const { data } = await supabase.from("building_intelligence").upsert({
    organization_id: orgId, city_name: normalizeCityName(cityName), street, house_number: houseNumber, normalized_address: normalizedAddress,
    transactions_count: b.transactionsCount, last_transaction_date: b.lastTransactionDate, avg_price_per_sqm: b.avgPpsqm, median_price_per_sqm: b.medianPpsqm,
    min_price_per_sqm: b.minPpsqm, max_price_per_sqm: b.maxPpsqm, avg_deal_amount: b.avgDeal, price_trend_12m: b.trend12m, price_trend_24m: b.trend24m,
    confidence_score: b.confidenceScore, summary_hebrew: b.summaryHebrew,
  } as never, { onConflict: "organization_id,city_name,normalized_address" }).select("*").maybeSingle();
  return (data ?? null) as DB["building_intelligence"]["Row"] | null;
}

export async function generateStreetIntelligence(cityName: string, street: string): Promise<DB["street_intelligence"]["Row"] | null> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const pool = await loadPool(orgId, { city: cityName, street });
  if (!pool.length) return null;
  const s = streetIntelligence(pool);
  const { data } = await supabase.from("street_intelligence").upsert({
    organization_id: orgId, city_name: normalizeCityName(cityName), street: normalizeStreetName(street),
    transactions_count: s.transactionsCount, avg_price_per_sqm: s.avgPpsqm, median_price_per_sqm: s.medianPpsqm, min_price_per_sqm: s.minPpsqm, max_price_per_sqm: s.maxPpsqm,
    avg_deal_amount: s.avgDeal, price_trend_6m: s.trend6m, price_trend_12m: s.trend12m, price_trend_24m: s.trend24m,
    liquidity_score: s.liquidityScore, street_score: s.streetScore, confidence_score: s.confidenceScore, summary_hebrew: s.summaryHebrew,
  } as never, { onConflict: "organization_id,city_name,street" }).select("*").maybeSingle();
  return (data ?? null) as DB["street_intelligence"]["Row"] | null;
}

// ── Non-blocking GovMap sync (PRIMARY) with live count + neighborhood spider ──
export interface GovmapStart { runId: string | null; datasetId: string | null; city: string | null; neighborhoods: number; needsConfig: boolean; error: string | null }

/** Start one city-wide GovMap run (centre + all known neighborhoods). Non-blocking. */
export async function startGovmapSync(dealDateRange = "all"): Promise<GovmapStart> {
  const { orgId, profile, organization } = await ctx();
  const market = resolveAgentMarket(profile, organization);
  if (!market.city) return { runId: null, datasetId: null, city: null, neighborhoods: 0, needsConfig: true, error: null };
  if (!isTransactionsApifyConfigured()) return { runId: null, datasetId: null, city: market.city, neighborhoods: 0, needsConfig: false, error: "APIFY_TOKEN missing" };
  await ensureCoverageTargetsForAgent();
  const supabase = await createClient();
  const { data: tg } = await supabase.from("geo_coverage_targets").select("neighborhood_name").eq("organization_id", orgId).eq("city_name", market.city).not("neighborhood_name", "is", null);
  const hoods = [...new Set([...market.neighborhoods, ...(tg ?? []).map((t) => t.neighborhood_name).filter((x): x is string => !!x)])];
  try {
    const r = await startTransactionsRun(buildCityCoverageInput(market.city, hoods, dealDateRange, Math.max(3000, MAX_TXNS_PER_PULL)));
    return { runId: r.runId, datasetId: r.datasetId, city: market.city, neighborhoods: hoods.length, needsConfig: false, error: null };
  } catch (e) {
    return { runId: null, datasetId: null, city: market.city, neighborhoods: hoods.length, needsConfig: false, error: e instanceof Error ? e.message : "failed to start" };
  }
}

/**
 * National neighborhoods reference (israel_neighborhoods) for a city — shared
 * across ALL orgs. Read the cache; if empty, fetch from OpenStreetMap once and
 * write it to the national table (service role) so every future agent in this
 * city gets it instantly. Deterministic; never invents data.
 */
async function getNationalNeighborhoods(city: string, rawCity: string): Promise<DB["israel_neighborhoods"]["Row"][]> {
  const supabase = await createClient();
  const { data: cached } = await supabase.from("israel_neighborhoods").select("*").eq("city_name", city).limit(500);
  if (cached && cached.length) return cached as DB["israel_neighborhoods"]["Row"][];
  // Lazy-fill from OSM into the shared national table.
  try {
    const { discoverNeighborhoodsOSM, dedupeDiscovered } = await import("./geo");
    const osm = dedupeDiscovered(await discoverNeighborhoodsOSM(rawCity));
    if (!osm.length) return [];
    const rows = osm.map((n) => ({ city_name: city, name_he: n.name, normalized_name: n.name, place_type: n.place, lat: n.lat, lng: n.lng, source: "osm", confidence_score: 60, is_verified: false }));
    const admin = createServiceRoleClient();
    await admin.from("israel_neighborhoods").upsert(rows as never, { onConflict: "city_name,normalized_name" });
    const { data: fresh } = await supabase.from("israel_neighborhoods").select("*").eq("city_name", city).limit(500);
    return (fresh ?? []) as DB["israel_neighborhoods"]["Row"][];
  } catch { return []; }
}

/**
 * Auto-discover the agent's city neighborhoods (Geo Layer) and seed them as
 * coverage targets so the GovMap scan covers the whole city. Deterministic:
 * national israel_neighborhoods reference (OSM-backed) + neighborhoods already
 * seen in stored transactions.
 */
export async function autoDiscoverNeighborhoods(): Promise<{ discovered: number; created: number; sources: string[]; city: string | null; needsConfig: boolean }> {
  const { orgId, profile, organization } = await ctx();
  const market = resolveAgentMarket(profile, organization);
  if (!market.city) return { discovered: 0, created: 0, sources: [], city: null, needsConfig: true };
  const supabase = await createClient();

  const found = new Map<string, { lat: number | null; lng: number | null; source: string }>();
  // 1) National reference (israel_neighborhoods) — shared across all orgs.
  //    Lazily populated from OSM the first time any agent works in this city.
  for (const n of await getNationalNeighborhoods(market.city, market.rawCity ?? market.city)) {
    if (!found.has(n.normalized_name)) found.set(n.normalized_name, { lat: n.lat, lng: n.lng, source: n.source });
  }
  // 2) Neighborhoods already present in stored transactions (guaranteed source).
  const { data: txnHoods } = await supabase.from("property_transactions").select("neighborhood_name").eq("organization_id", orgId).eq("city_name", market.city).not("neighborhood_name", "is", null).limit(4000);
  for (const t of txnHoods ?? []) {
    const nn = normalizeNeighborhoodName(t.neighborhood_name as string);
    if (nn && !found.has(nn)) found.set(nn, { lat: null, lng: null, source: "transactions" });
  }

  const { data: existing } = await supabase.from("geo_coverage_targets").select("neighborhood_name").eq("organization_id", orgId).eq("city_name", market.city);
  const have = new Set((existing ?? []).map((e) => e.neighborhood_name).filter(Boolean));
  const rows = [...found.entries()].filter(([n]) => !have.has(n)).slice(0, 120).map(([n, m]) => ({
    organization_id: orgId, city_name: market.city, neighborhood_name: n, lat: m.lat, lng: m.lng,
    coverage_status: "pending", priority: 2, metadata: { source: m.source },
  }));
  if (rows.length) await supabase.from("geo_coverage_targets").insert(rows as never);
  return { discovered: found.size, created: rows.length, sources: [...new Set([...found.values()].map((v) => v.source))], city: market.city, needsConfig: false };
}

/** Add a neighborhood coverage target for the agent's city (each = its own 700m pull). */
export async function addCoverageNeighborhood(neighborhood: string): Promise<{ created: boolean; city: string | null; name: string | null }> {
  const { orgId, profile, organization } = await ctx();
  const market = resolveAgentMarket(profile, organization);
  if (!market.city) return { created: false, city: null, name: null };
  const n = normalizeNeighborhoodName(neighborhood);
  if (!n) return { created: false, city: market.city, name: null };
  const supabase = await createClient();
  const { data: ex } = await supabase.from("geo_coverage_targets").select("id").eq("organization_id", orgId).eq("city_name", market.city).eq("neighborhood_name", n).maybeSingle();
  if (ex) return { created: false, city: market.city, name: n };
  await supabase.from("geo_coverage_targets").insert({ organization_id: orgId, city_name: market.city, neighborhood_name: n, coverage_status: "pending", priority: 1 } as never);
  return { created: true, city: market.city, name: n };
}

export async function pollGovmapSync(runId: string): Promise<{ status: string; found: number; datasetId: string | null }> {
  await ctx();
  const r = await getTransactionsRun(runId);
  return { status: r.status, found: r.found, datasetId: r.datasetId };
}

export async function finishGovmapSync(datasetId: string): Promise<{ imported: number; duplicates: number; deals: number; newNeighborhoods: number; error: string | null }> {
  const { orgId } = await ctx();
  let imported = 0, duplicates = 0, deals = 0, newNeighborhoods = 0, error: string | null = null;
  try {
    const raws = await fetchDatasetItems(datasetId, 6000);
    deals = raws.length;
    const normalized = raws.map(normalizeTransaction);
    const shaped = deduplicateTransactions(normalized.map((t) => ({ ...t, asset_id: t.assetId, city_name: canonicalCityName(t.cityName), normalized_address: t.normalizedAddress, deal_date: t.dealDate, deal_amount: t.dealAmount, area: t.area })));
    const res = await persistTransactions(orgId, shaped);
    imported = res.imported; duplicates = res.duplicates;
    newNeighborhoods = await discoverNeighborhoodCoverage(orgId, normalized);
  } catch (e) {
    error = e instanceof Error ? e.message : "govmap finish failed";
  }
  return { imported, duplicates, deals, newNeighborhoods, error };
}

/** Spider: add a coverage target for each neighborhood seen, so the NEXT sync covers it too. */
async function discoverNeighborhoodCoverage(orgId: string, normalized: NormalizedTransaction[]): Promise<number> {
  const supabase = await createClient();
  const byCity = new Map<string, Set<string>>();
  for (const t of normalized) {
    const c = canonicalCityName(t.cityName); const h = t.neighborhoodName;
    if (!c || !h) continue;
    if (!byCity.has(c)) byCity.set(c, new Set());
    byCity.get(c)!.add(h);
  }
  let created = 0;
  for (const [city, hoods] of byCity) {
    const { data: existing } = await supabase.from("geo_coverage_targets").select("neighborhood_name").eq("organization_id", orgId).eq("city_name", city);
    const have = new Set((existing ?? []).map((e) => e.neighborhood_name).filter(Boolean));
    const rows = [...hoods].filter((h) => !have.has(h)).slice(0, 40).map((h) => ({ organization_id: orgId, city_name: city, neighborhood_name: h, coverage_status: "completed", priority: 2 }));
    if (rows.length) { await supabase.from("geo_coverage_targets").insert(rows as never); created += rows.length; }
  }
  return created;
}

/** Rebuild building + street intel for every (street / building) seen in transactions. */
export async function recomputeDerivedIntelligence(): Promise<{ buildings: number; streets: number }> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const { data: txns } = await supabase.from("property_transactions").select("city_name,street,normalized_address").eq("organization_id", orgId).limit(5000);
  const streets = new Set<string>(); const buildings = new Set<string>();
  for (const t of txns ?? []) {
    if (t.city_name && t.street) streets.add(`${t.city_name}|${t.street}`);
    if (t.city_name && t.normalized_address) buildings.add(`${t.city_name}|${t.normalized_address}`);
  }
  let bc = 0, sc = 0;
  for (const key of [...streets].slice(0, 200)) { const [c, s] = key.split("|"); try { if (await generateStreetIntelligence(c, s)) sc++; } catch { /* skip */ } }
  for (const key of [...buildings].slice(0, 300)) { const [c, a] = key.split("|"); try { if (await generateBuildingIntelligence(c, a)) bc++; } catch { /* skip */ } }
  return { buildings: bc, streets: sc };
}

// ── Opportunity radar ────────────────────────────────────────────────────────
export async function detectTransactionOpportunity(input: ResearchSaveInput, preloadedPool?: TxnComparable[]): Promise<{ alertId: string | null; type: string; score: number }> {
  const { orgId } = await ctx();
  const { result, reportId, streetTrend12m } = await researchPropertyAgainstTransactions(input, true, preloadedPool);
  const radar = detectOpportunity(result, streetTrend12m);
  if (radar.opportunityType === "fair_market" || radar.opportunityType === "not_enough_data") return { alertId: null, type: radar.opportunityType, score: radar.opportunityScore };
  const alertId = await saveRadarAlert(orgId, input, result, radar, reportId);
  return { alertId, type: radar.opportunityType, score: radar.opportunityScore };
}

/** Persist one opportunity-radar alert (de-duped per property/external listing)
 *  + link it into the Knowledge Graph. Shared by single + batch recompute. */
async function saveRadarAlert(orgId: string, input: ResearchSaveInput, result: ResearchResult, radar: ReturnType<typeof detectOpportunity>, reportId: string | null): Promise<string | null> {
  const supabase = await createClient();
  // Avoid stacking duplicate open alerts for the same listing on recompute.
  if (input.propertyListingId) await supabase.from("transaction_opportunity_radar_alerts").update({ status: "superseded" } as never).eq("organization_id", orgId).eq("property_listing_id", input.propertyListingId).in("status", ["new", "reviewing"]);
  else if (input.externalListingId) await supabase.from("transaction_opportunity_radar_alerts").update({ status: "superseded" } as never).eq("organization_id", orgId).eq("external_listing_id", input.externalListingId).in("status", ["new", "reviewing"]);
  const { data } = await supabase.from("transaction_opportunity_radar_alerts").insert({
    organization_id: orgId, property_listing_id: input.propertyListingId ?? null, external_listing_id: input.externalListingId ?? null,
    acquisition_profile_id: input.acquisitionProfileId ?? null, research_report_id: reportId,
    city_name: input.cityName, neighborhood_name: input.neighborhoodName, address: input.normalizedAddress,
    asking_price: input.askingPrice, estimated_market_value: result.estimatedMarketValue, gap_from_market_percent: result.gapFromMarketPercent,
    opportunity_score: radar.opportunityScore, confidence_score: result.confidenceScore, opportunity_type: radar.opportunityType,
    reason_hebrew: radar.reasonHebrew, recommended_action_hebrew: radar.recommendedActionHebrew, status: "new",
  } as never).select("id").maybeSingle();
  if (data?.id && input.acquisitionProfileId) {
    await supabase.from("entity_relationships").insert({ org_id: orgId, source_entity_type: "transaction_radar", source_entity_id: data.id, target_entity_type: "acquisition", target_entity_id: input.acquisitionProfileId, relationship_type: "signals_opportunity", strength_score: Math.round(radar.opportunityScore), status: "active" } as never);
  }
  return data?.id ?? null;
}

// ── Pipeline research recompute (DEEP INTEGRATION FOUNDATION) ─────────────────
// For every active property + open external listing in the org, value it against
// the sold-price transaction pool and persist a research report (+ radar alert
// when it's an opportunity). This is the shared substrate the acquisition,
// property, seller, forecast and revenue brains read from. Deterministic; never
// invents data; bounded; failures are isolated per-listing.
export interface PipelineResearchResult {
  properties: number; externalListings: number; reports: number; alerts: number; skipped: number; needsConfig: boolean;
}

export async function recomputePipelineResearch(limitPerSide = 60): Promise<PipelineResearchResult> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  // Need at least some transactions, otherwise research is meaningless.
  const { count: txnCount } = await supabase.from("property_transactions").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  if (!txnCount) return { properties: 0, externalListings: 0, reports: 0, alerts: 0, skipped: 0, needsConfig: true };

  const poolByCity = new Map<string, TxnComparable[]>();
  const poolFor = async (city: string | null): Promise<TxnComparable[]> => {
    const key = canonicalCityName(city) ?? "";
    if (!key) return [];
    if (!poolByCity.has(key)) poolByCity.set(key, await loadPool(orgId, { city }));
    return poolByCity.get(key) ?? [];
  };

  let reports = 0, alerts = 0, skipped = 0, propCount = 0, extCount = 0;
  const runOne = async (input: ResearchSaveInput) => {
    const pool = await poolFor(input.cityName);
    if (!pool.length) { skipped++; return; }
    try {
      const r = await detectTransactionOpportunity(input, pool);
      reports++;
      if (r.alertId) alerts++;
    } catch { skipped++; }
  };

  // Active managed properties (exclude closed/dead states).
  const { data: props } = await supabase.from("properties")
    .select("id,city,neighborhood,location,building_number,rooms,size_sqm,price,status")
    .eq("org_id", orgId).not("city", "is", null)
    .not("status", "in", "(sold,rented,withdrawn,archived)")
    .order("updated_at", { ascending: false }).limit(limitPerSide);
  for (const p of props ?? []) {
    const loc = (p.location ?? {}) as { address?: string; neighborhood?: string };
    const addr = loc.address ?? null;
    const normalized = normalizeTransactionAddress({ address: addr, street: addr, streetNumber: p.building_number });
    await runOne({
      propertyListingId: p.id, cityName: p.city, neighborhoodName: normalizeNeighborhoodName(p.neighborhood ?? loc.neighborhood ?? null),
      normalizedAddress: normalized, street: normalizeStreetName(addr), rooms: p.rooms, area: p.size_sqm, askingPrice: p.price ?? null,
    });
    propCount++;
  }

  // Open external listings (not yet promoted / removed).
  const { data: ext } = await supabase.from("external_listings")
    .select("id,city,neighborhood,street,street_number,address,rooms,area_sqm,sqm,price,status,promoted_property_id,removed_at")
    .eq("org_id", orgId).not("city", "is", null).is("promoted_property_id", null).is("removed_at", null)
    .not("status", "in", "(rejected,archived,duplicate)")
    .order("opportunity_score", { ascending: false }).limit(limitPerSide);
  for (const e of ext ?? []) {
    const normalized = normalizeTransactionAddress({ address: e.address, street: e.street, streetNumber: e.street_number });
    await runOne({
      externalListingId: e.id, cityName: e.city, neighborhoodName: normalizeNeighborhoodName(e.neighborhood),
      normalizedAddress: normalized, street: normalizeStreetName(e.street ?? e.address), rooms: e.rooms, area: e.area_sqm ?? e.sqm, askingPrice: e.price,
    });
    extCount++;
  }
  return { properties: propCount, externalListings: extCount, reports, alerts, skipped, needsConfig: false };
}

/** Read the latest research report for a property listing (deep-integration read
 *  model used by the acquisition/property/seller/forecast/revenue brains). */
export async function latestResearchForProperties(orgId: string, propertyIds: string[]): Promise<Map<string, DB["property_research_reports"]["Row"]>> {
  const out = new Map<string, DB["property_research_reports"]["Row"]>();
  if (!propertyIds.length) return out;
  const supabase = await createClient();
  const { data } = await supabase.from("property_research_reports").select("*").eq("organization_id", orgId).in("property_listing_id", propertyIds).order("created_at", { ascending: false }).limit(1000);
  for (const r of (data ?? []) as DB["property_research_reports"]["Row"][]) {
    const pid = r.property_listing_id; if (pid && !out.has(pid)) out.set(pid, r);
  }
  return out;
}

/** Same as above but keyed by external listing id. */
export async function latestResearchForExternalListings(orgId: string, externalIds: string[]): Promise<Map<string, DB["property_research_reports"]["Row"]>> {
  const out = new Map<string, DB["property_research_reports"]["Row"]>();
  if (!externalIds.length) return out;
  const supabase = await createClient();
  const { data } = await supabase.from("property_research_reports").select("*").eq("organization_id", orgId).in("external_listing_id", externalIds).order("created_at", { ascending: false }).limit(1000);
  for (const r of (data ?? []) as DB["property_research_reports"]["Row"][]) {
    const eid = r.external_listing_id; if (eid && !out.has(eid)) out.set(eid, r);
  }
  return out;
}

export async function setRadarAlertStatus(alertId: string, status: string): Promise<void> {
  await ctx();
  const supabase = await createClient();
  await supabase.from("transaction_opportunity_radar_alerts").update({ status } as never).eq("id", alertId);
}

/** Create an acquisition task from a radar alert (reuses tasks table). */
export async function createAcquisitionTaskFromAlert(alertId: string): Promise<void> {
  const { orgId, userId } = await ctx();
  const supabase = await createClient();
  const { data: alert } = await supabase.from("transaction_opportunity_radar_alerts").select("*").eq("id", alertId).maybeSingle();
  if (!alert) return;
  await supabase.from("tasks").insert({
    org_id: orgId, title: `גיוס לפי עסקאות · ${alert.address ?? alert.city_name ?? "נכס"}`,
    description: alert.reason_hebrew, status: "todo", priority: "high", created_by: userId,
  } as never);
  await supabase.from("transaction_opportunity_radar_alerts").update({ status: "reviewing" } as never).eq("id", alertId);
}

// ── Read models ──────────────────────────────────────────────────────────────
export interface TransactionsFilters { city?: string; neighborhood?: string; street?: string; minRooms?: number; minArea?: number; minPpsqm?: number; propertyType?: string }

export interface TransactionsBoard {
  transactions: DB["property_transactions"]["Row"][];
  total: number;
  cities: string[];
  neighborhoods: string[];
  stats: { count: number; avgPpsqm: number | null; medianPpsqm: number | null; avgDeal: number | null };
  coverageConfigured: boolean;
  needsConfig: boolean;
  agentCity: string | null;
  apifyConfigured: boolean;
}

export async function getTransactionsBoard(filters: TransactionsFilters = {}): Promise<TransactionsBoard> {
  const { orgId, profile, organization } = await ctx();
  const supabase = await createClient();
  const market = resolveAgentMarket(profile, organization);
  // City is canonicalized identically on storage and here, so the profile
  // spelling ("קרית ביאליק") and the actor's ("קריית ביאליק") match as one.
  let q = supabase.from("property_transactions").select("*").eq("organization_id", orgId);
  if (filters.city) q = q.eq("city_name", canonicalCityName(filters.city) ?? "");
  else if (market.city) q = q.eq("city_name", market.city);
  if (filters.neighborhood) q = q.eq("neighborhood_name", normalizeNeighborhoodName(filters.neighborhood) ?? "");
  if (filters.street) q = q.eq("street", normalizeStreetName(filters.street) ?? "");
  if (filters.propertyType) q = q.eq("property_type", filters.propertyType);
  const { data } = await q.order("deal_date", { ascending: false }).limit(500);
  let txns = (data ?? []) as DB["property_transactions"]["Row"][];
  if (filters.minRooms) txns = txns.filter((t) => (t.rooms ?? 0) >= filters.minRooms!);
  if (filters.minArea) txns = txns.filter((t) => (t.area ?? 0) >= filters.minArea!);
  if (filters.minPpsqm) txns = txns.filter((t) => (t.price_per_sqm ?? 0) >= filters.minPpsqm!);

  const { count: total } = await supabase.from("property_transactions").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  const { data: facets } = await supabase.from("property_transactions").select("city_name,neighborhood_name").eq("organization_id", orgId).limit(2000);
  const cities = [...new Set((facets ?? []).map((f) => f.city_name).filter((x): x is string => !!x))].sort();
  const neighborhoods = [...new Set((facets ?? []).map((f) => f.neighborhood_name).filter((x): x is string => !!x))].sort();
  const s = priceStats(txns as unknown as TxnComparable[]);

  return {
    transactions: txns, total: total ?? 0, cities, neighborhoods,
    stats: { count: txns.length, avgPpsqm: s.avgPpsqm, medianPpsqm: s.medianPpsqm, avgDeal: s.avgDeal },
    coverageConfigured: !!market.city, needsConfig: !market.city, agentCity: market.city, apifyConfigured: isTransactionsApifyConfigured(),
  };
}

export interface CoverageBoard {
  targets: DB["geo_coverage_targets"]["Row"][];
  logs: DB["transaction_sync_logs"]["Row"][];
  agentCity: string | null;
  needsConfig: boolean;
  apifyConfigured: boolean;
}

export async function getCoverageBoard(): Promise<CoverageBoard> {
  const { orgId, profile, organization } = await ctx();
  const supabase = await createClient();
  const [tg, lg] = await Promise.all([
    supabase.from("geo_coverage_targets").select("*").eq("organization_id", orgId).order("priority", { ascending: true }).limit(200),
    supabase.from("transaction_sync_logs").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(30),
  ]);
  const market = resolveAgentMarket(profile, organization);
  return { targets: (tg.data ?? []) as DB["geo_coverage_targets"]["Row"][], logs: (lg.data ?? []) as DB["transaction_sync_logs"]["Row"][], agentCity: market.city, needsConfig: !market.city, apifyConfigured: isTransactionsApifyConfigured() };
}

export async function getStreetsBoard(): Promise<{ streets: DB["street_intelligence"]["Row"][] }> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const { data } = await supabase.from("street_intelligence").select("*").eq("organization_id", orgId).order("street_score", { ascending: false, nullsFirst: false }).limit(200);
  return { streets: (data ?? []) as DB["street_intelligence"]["Row"][] };
}

export interface RadarBoard { alerts: DB["transaction_opportunity_radar_alerts"]["Row"][]; counts: Record<string, number> }

export async function getRadarBoard(): Promise<RadarBoard> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const { data } = await supabase.from("transaction_opportunity_radar_alerts").select("*").eq("organization_id", orgId).neq("status", "closed").order("opportunity_score", { ascending: false }).limit(100);
  const alerts = (data ?? []) as DB["transaction_opportunity_radar_alerts"]["Row"][];
  const counts: Record<string, number> = {};
  for (const a of alerts) counts[a.opportunity_type] = (counts[a.opportunity_type] ?? 0) + 1;
  return { alerts, counts };
}

// ── Cron-safe org-level helpers ──────────────────────────────────────────────
export async function refreshRecentTransactionsForOrganization(orgId: string): Promise<{ organizationId: string; imported: number }> {
  const supabase = await createClient();
  const { data: targets } = await supabase.from("geo_coverage_targets").select("id,city_name,neighborhood_name,transactions_found").eq("organization_id", orgId).neq("coverage_status", "disabled").limit(40);
  let imported = 0;
  for (const t of targets ?? []) {
    try {
      if (!isTransactionsApifyConfigured()) break;
      const raws = await runTransactionsActor(buildTransactionsInput(t.city_name as string, t.neighborhood_name, "12"));
      const normalized = deduplicateTransactions(raws.map(normalizeTransaction).map((x) => ({ ...x, asset_id: x.assetId, city_name: x.cityName, normalized_address: x.normalizedAddress, deal_date: x.dealDate, deal_amount: x.dealAmount, area: x.area })));
      imported += (await persistTransactions(orgId, normalized)).imported;
    } catch { /* isolate */ }
  }
  return { organizationId: orgId, imported };
}

export async function organizationsWithCoverage(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("geo_coverage_targets").select("organization_id").neq("coverage_status", "disabled").limit(5000);
  return [...new Set((data ?? []).map((r) => r.organization_id))];
}
