/**
 * External listings service — real Apify sync, history, duplicates, promotion.
 * Server-only. Uses an injected Supabase client so the same logic serves both
 * the RLS user routes and the service-role nightly cron.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { logActivityEvent } from "@/lib/activity/service";
import type { Database } from "@/lib/supabase/types";
import {
  externalEnvStatus,
  getProvider,
  isApifyConfigured,
  type NormalizedExternalListing,
} from "./providers";
import { calculateExternalOpportunityScore, missingFields, qualityScores } from "./scoring";
import { detectForOrg } from "@/lib/broker/service";
import {
  buildAiFields,
  calculateExternalDealPotential,
  marketIntel,
  matchBuyersToListing,
  whyItMatters,
  type AiFields,
  type BuyerForMatch,
  type BuyerMatch,
  type ListingForDeal,
  type MarketIntel,
} from "./deal";

type DB = SupabaseClient<Database>;
// Guardrail: never scrape the whole country in one run. Cap localities per sync.
const MAX_CITIES_PER_SYNC = 20;

/**
 * Configurable import modes — replaces the fixed cap so a user can pull more
 * than 50 per city safely. Each mode bounds BOTH the per-city listing count and
 * the number of cities per run, keeping Apify cost/time predictable.
 */
export type SyncMode = "quick" | "standard" | "full" | "backfill";
export const SYNC_MODE_LIMITS: Record<SyncMode, { perCity: number; maxCities: number; label: string }> = {
  quick: { perCity: 50, maxCities: 10, label: "סנכרון מהיר" },
  standard: { perCity: 250, maxCities: 20, label: "סנכרון רגיל" },
  full: { perCity: 500, maxCities: 20, label: "סנכרון מלא לאזורי הפעילות" },
  backfill: { perCity: 1000, maxCities: 30, label: "סנכרון מתקדם (מנהל)" },
};
const DAY = 86_400_000;
const daysSince = (iso: string | null | undefined) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null);
const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export interface SyncSummary {
  success: boolean;
  organizationId: string;
  cities: string[];
  sources: string[];
  inserted: number;
  updated: number;
  errors: string[];
}

export interface SyncOptions {
  localityId?: string | null;
  sources?: string[];
  mode?: SyncMode;
}

async function activeLocalities(db: DB, orgId: string, localityId?: string | null): Promise<{ id: string; name: string }[]> {
  let q = db.from("organization_operating_localities").select("locality_id").eq("organization_id", orgId);
  if (localityId) q = q.eq("locality_id", localityId);
  const { data } = await q;
  const ids = (data ?? []).map((r) => r.locality_id);
  if (!ids.length) return [];
  const { data: locs } = await db.from("israel_localities").select("id,name_he").in("id", ids);
  return (locs ?? []).map((l) => ({ id: l.id, name: l.name_he }));
}

/** Upsert a batch of normalized listings; record price-change history. */
async function upsertListings(
  db: DB, orgId: string, source: string, listings: NormalizedExternalListing[], jobId: string,
): Promise<{ inserted: number; updated: number }> {
  if (!listings.length) return { inserted: 0, updated: 0 };
  const sourceIds = listings.map((l) => l.sourceId);
  const { data: existing } = await db
    .from("external_listings")
    .select("id,source_id,price,status")
    .eq("org_id", orgId).eq("source", source).in("source_id", sourceIds);
  const existingMap = new Map((existing ?? []).map((e) => [e.source_id, e]));

  // Area baseline (₪/m²) from this batch — drives price-vs-average opportunity.
  const sqmPrices = listings.filter((l) => l.price && l.sqm).map((l) => l.price! / l.sqm!);
  const avgSqm = sqmPrices.length ? sqmPrices.reduce((a, b) => a + b, 0) / sqmPrices.length : 0;

  const rows: Database["public"]["Tables"]["external_listings"]["Insert"][] = listings.map((n) => {
    const q = qualityScores(n);
    const sqmP = n.price && n.sqm ? n.price / n.sqm : null;
    const opp = calculateExternalOpportunityScore({
      priceVsAreaAvg: avgSqm > 0 && sqmP != null ? sqmP / avgSqm : null,
      completeness: q.data_completeness_score,
      privateOwner: n.hasAgent === false,
      duplicateConfidence: 0,
      buyerFit: false,
      localityActive: true,
      daysSincePublished: daysSince(n.publishedAt),
    });
    return ({
    org_id: orgId, source, source_id: n.sourceId, external_id: n.externalId ?? null,
    title: n.title ?? null, city: n.city ?? null, neighborhood: n.neighborhood ?? null,
    street: n.street ?? null, street_number: n.streetNumber ?? null, address: n.address ?? null,
    property_type: n.propertyType ?? null, deal_type: n.dealType ?? "sale",
    price: n.price ?? null, rooms: n.rooms ?? null, bathrooms: n.bathrooms ?? null, balconies: n.balconies ?? null,
    floor: n.floor ?? null, total_floors: n.totalFloors ?? null, sqm: n.sqm ?? null, area_sqm: n.areaSqm ?? null,
    parking: n.parking ?? null, elevator: n.elevator ?? null, secure_room: n.secureRoom ?? null,
    condition: n.condition ?? null, description: n.description ?? null,
    images: (n.images ?? []) as never, contact_name: n.contactName ?? null, contact_phone: n.contactPhone ?? null,
    contact_type: n.contactType ?? null, has_agent: n.hasAgent ?? null, listing_url: n.listingUrl ?? null,
    published_at: n.publishedAt ?? null, last_synced_at: new Date().toISOString(), status: "active",
    opportunity_score: opp,
    metadata: { raw_data: n.rawData ?? {}, quality: q } as never,
  }); });

  const { error } = await db.from("external_listings").upsert(rows as never, { onConflict: "org_id,source,source_id" });
  if (error) throw new Error(error.message);

  // Price-change history for previously-seen listings.
  const history: Database["public"]["Tables"]["external_listing_history"]["Insert"][] = [];
  let inserted = 0, updated = 0;
  for (const n of listings) {
    const prev = existingMap.get(n.sourceId);
    if (!prev) { inserted++; continue; }
    updated++;
    if (prev.price != null && n.price != null && prev.price !== n.price) {
      history.push({ org_id: orgId, listing_id: prev.id, change_type: "price_changed", old_value: { price: prev.price } as never, new_value: { price: n.price } as never });
    }
  }
  if (history.length) await db.from("external_listing_history").insert(history as never);
  void jobId;
  return { inserted, updated };
}

/** Duplicate detection foundation — compares listings within a city. */
async function detectDuplicates(db: DB, orgId: string, city: string): Promise<void> {
  const { data } = await db
    .from("external_listings")
    .select("id,source,street,street_number,rooms,sqm,floor,price,contact_phone")
    .eq("org_id", orgId).eq("city", city).eq("status", "active").limit(200);
  const rows = data ?? [];
  if (rows.length < 2) return;
  const dupRows: Database["public"]["Tables"]["external_listing_duplicates"]["Insert"][] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      let s = 0;
      if (a.street && b.street && a.street === b.street) s += 25;
      if (a.street_number && b.street_number && a.street_number === b.street_number) s += 15;
      if (a.rooms != null && a.rooms === b.rooms) s += 15;
      if (a.sqm != null && b.sqm != null && Math.abs(a.sqm - b.sqm) <= 3) s += 15;
      if (a.floor != null && a.floor === b.floor) s += 10;
      if (a.price != null && b.price != null && Math.abs(a.price - b.price) / Math.max(a.price, b.price) <= 0.05) s += 10;
      if (a.contact_phone && b.contact_phone && a.contact_phone === b.contact_phone) s += 20;
      if (s >= 60) dupRows.push({ org_id: orgId, listing_id: a.id, duplicate_of_listing_id: b.id, confidence_score: clampScore(s), reason: `התאמה ${s}%`, status: "suspected" });
    }
  }
  if (dupRows.length) {
    // Refresh suspected dups for this city's listings to avoid pile-up.
    await db.from("external_listing_duplicates").delete().eq("org_id", orgId).eq("status", "suspected").in("listing_id", rows.map((r) => r.id));
    await db.from("external_listing_duplicates").insert(dupRows as never);
  }
}

/** Core sync — used by both the RLS user routes and the service-role cron. */
async function syncOrg(db: DB, orgId: string, opts: SyncOptions, actingUserId: string | null): Promise<SyncSummary> {
  const sources = opts.sources?.length ? opts.sources : ["yad2", "madlan"];
  const { data: job } = await db
    .from("import_jobs")
    .insert({ org_id: orgId, provider: sources.join("+"), status: "running", started_at: new Date().toISOString(), created_by: actingUserId, params: opts as never })
    .select("id").single();
  const jobId = job?.id as string;
  const log = (message: string, level = "info") => db.from("import_job_logs").insert({ org_id: orgId, job_id: jobId, message, level });

  const mode = opts.mode ?? "quick";
  const modeCfg = SYNC_MODE_LIMITS[mode] ?? SYNC_MODE_LIMITS.quick;
  const perCityLimit = modeCfg.perCity;
  const maxCities = Math.min(modeCfg.maxCities, MAX_CITIES_PER_SYNC === 20 ? modeCfg.maxCities : MAX_CITIES_PER_SYNC);

  const allLocalities = await activeLocalities(db, orgId, opts.localityId);
  // Guardrail: cap cities per sync run so we never scrape the whole country.
  const localities = allLocalities.slice(0, maxCities);
  const summary: SyncSummary = { success: true, organizationId: orgId, cities: localities.map((l) => l.name), sources, inserted: 0, updated: 0, errors: [] };

  await log(`מצב סנכרון: ${modeCfg.label} · עד ${perCityLimit} מודעות לעיר · עד ${maxCities} אזורים`);
  if (allLocalities.length > maxCities) {
    await log(`הוגבל ל-${maxCities} אזורים מתוך ${allLocalities.length} (מגן ייצור)`, "warn");
  }

  if (!localities.length) {
    await log("אין אזורי פעילות פעילים לארגון", "warn");
    await db.from("import_jobs").update({ status: "completed", finished_at: new Date().toISOString() }).eq("id", jobId);
    return summary;
  }
  if (!isApifyConfigured() && process.env.NODE_ENV === "production") {
    await log("APIFY_TOKEN חסר — ייבוא חיצוני אינו זמין", "error");
    await db.from("import_jobs").update({ status: "failed", error: "APIFY_TOKEN missing", finished_at: new Date().toISOString() }).eq("id", jobId);
    summary.success = false; summary.errors.push("APIFY_TOKEN missing");
    return summary;
  }

  let totalFound = 0;
  const logDebug = (message: string, metadata: Record<string, unknown>) =>
    db.from("import_job_logs").insert({ org_id: orgId, job_id: jobId, message, level: "debug", metadata: metadata as never });

  for (const loc of localities) {
    for (const source of sources) {
      const t0 = Date.now();
      try {
        const provider = getProvider(source);
        const raws = await provider.searchListings(loc.name, perCityLimit);
        const ms = Date.now() - t0;
        const listings = raws.map((r) => provider.normalizeListing(r));
        // Debug: first 5 raw + mapped items + missing fields, for admin inspection.
        await logDebug(`raw_sample · ${source} · ${loc.name}`, {
          source, city: loc.name, count: raws.length, durationMs: ms,
          sample: raws.slice(0, 5),
          mapped: listings.slice(0, 5),
          missing: listings[0] ? missingFields(listings[0]) : [],
        });
        totalFound += listings.length;
        const r = await upsertListings(db, orgId, source, listings, jobId);
        summary.inserted += r.inserted; summary.updated += r.updated;
        await log(`${source} · ${loc.name}: ${listings.length} פריטים ב-${ms}ms (${r.inserted} חדשים, ${r.updated} עודכנו)`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "שגיאה";
        summary.errors.push(`${source}/${loc.name}: ${msg}`);
        await log(`כשל ב-${source} · ${loc.name} (${Date.now() - t0}ms): ${msg}`, "error");
        // continue with the other source / city
      }
    }
    try { await detectDuplicates(db, orgId, loc.name); } catch { /* best-effort */ }
  }

  // Broker detection on the freshly-synced listings — best-effort, never breaks
  // the import, and never overwrites human-locked (approved/rejected) listings.
  try {
    const bd = await detectForOrg(db, orgId);
    await logDebug("broker_detection", { broker_detection_total: bd.scanned, broker_auto_matched: bd.matched, broker_needs_review: bd.needsReview, broker_unknown: bd.unknown });
    await log(`זיהוי מתווכים: ${bd.scanned} נסרקו · ${bd.matched} אוטומטי · ${bd.needsReview} לבדיקה · ${bd.unknown} לא ידוע`);
  } catch (e) {
    console.error("[broker] detection during sync failed:", e);
  }

  summary.success = summary.errors.length === 0;
  await db.from("import_jobs").update({ status: summary.errors.length ? "completed_with_errors" : "completed", total_found: totalFound, total_imported: summary.inserted, total_updated: summary.updated, error: summary.errors.length ? summary.errors.slice(0, 5).join("; ") : null, finished_at: new Date().toISOString() }).eq("id", jobId);
  return summary;
}

/** User-triggered import (RLS, session org). Used by the API routes. */
export async function runImport(opts: SyncOptions = {}): Promise<SyncSummary> {
  const { user, profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  const db = (await createClient()) as unknown as DB;
  return syncOrg(db, profile.org_id, opts, user?.id ?? null);
}

export interface ImportDiagnostics {
  job: { id: string; provider: string; status: string; total_found: number; total_imported: number; error: string | null; started_at: string | null; finished_at: string | null } | null;
  logs: { level: string; message: string; metadata: unknown; created_at: string }[];
  apifyConfigured: boolean;
}

/** Latest import job + logs (errors + raw debug samples) for the admin panel. */
export async function getImportDiagnostics(): Promise<ImportDiagnostics> {
  const { profile } = await getSessionContext();
  if (!profile) return { job: null, logs: [], apifyConfigured: isApifyConfigured() };
  const supabase = await createClient();
  const { data: jobs } = await supabase.from("import_jobs").select("id,provider,status,total_found,total_imported,error,started_at,finished_at").order("created_at", { ascending: false }).limit(1);
  const job = jobs?.[0] ?? null;
  if (!job) return { job: null, logs: [], apifyConfigured: isApifyConfigured() };
  const { data: logs } = await supabase.from("import_job_logs").select("level,message,metadata,created_at").eq("job_id", job.id).order("created_at", { ascending: true }).limit(60);
  return { job, logs: logs ?? [], apifyConfigured: isApifyConfigured() };
}

// ── Admin actor-verification debug tool (does NOT run a full sync) ────────────
export interface ProviderDebugReport {
  success: boolean;
  provider: string;
  actorId: string;
  runStatus: string;
  datasetItems: number;
  rawSample: Record<string, unknown> | null;
  normalizedSample: NormalizedExternalListing | null;
  missingFields: string[];
  error: string | null;
  env: ReturnType<typeof externalEnvStatus>;
}

/** Presence-only environment validation (never returns secret values). */
export function validateExternalEnv(): ReturnType<typeof externalEnvStatus> {
  return externalEnvStatus();
}

/**
 * Run ONE city against ONE provider with a tiny limit, for actor verification.
 * Never triggers the full sync. Persists the raw sample only when saveSample.
 */
export async function debugProvider(
  source: string, city: string, limit = 5, saveSample = false,
): Promise<ProviderDebugReport> {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  const provider = getProvider(source);
  const safeLimit = Math.max(1, Math.min(limit, 5)); // debug cap: never more than 5
  const r = await provider.debugRun(city, safeLimit);
  const normalizedSample = r.rawSample ? provider.normalizeListing(r.rawSample) : null;
  const missing = normalizedSample ? missingFields(normalizedSample) : [];

  if (saveSample && r.rawSample) {
    const db = await createClient();
    const { data: job } = await db
      .from("import_jobs")
      .insert({ org_id: profile.org_id, provider: `debug:${source}`, status: "completed", started_at: new Date().toISOString(), finished_at: new Date().toISOString(), total_found: r.datasetItems, total_imported: 0, created_by: profile.id, params: { city, limit: safeLimit, debug: true } as never })
      .select("id").single();
    if (job?.id) {
      await db.from("import_job_logs").insert({
        org_id: profile.org_id, job_id: job.id, level: "debug",
        message: `debug sample · ${source} · ${city} (${r.runStatus}, ${r.datasetItems} items)`,
        metadata: { actorId: r.actorId, runStatus: r.runStatus, rawSample: r.rawSample, normalizedSample, missingFields: missing } as never,
      });
    }
  }

  return {
    success: r.error == null,
    provider: source, actorId: r.actorId, runStatus: r.runStatus, datasetItems: r.datasetItems,
    rawSample: r.rawSample, normalizedSample, missingFields: missing, error: r.error,
    env: externalEnvStatus(),
  };
}

/** Cron-triggered sync for a specific org (service-role, trusted server). */
export async function syncExternalListingsForOrganization(organizationId: string, opts: SyncOptions = {}): Promise<SyncSummary> {
  const db = createServiceRoleClient() as unknown as DB;
  return syncOrg(db, organizationId, opts, null);
}

/** Orgs that have at least one active operating locality (for the cron loop). */
export async function organizationsWithActiveLocalities(): Promise<string[]> {
  const db = createServiceRoleClient() as unknown as DB;
  const { data } = await db.from("organization_operating_localities").select("organization_id");
  return [...new Set((data ?? []).map((r) => r.organization_id))];
}

// ── External Listing Deep View (intelligence only — never auto-promotes) ──────
type ExtRow = Database["public"]["Tables"]["external_listings"]["Row"];

export interface ExternalListingDetail {
  listing: ExtRow;
  market: MarketIntel;
  buyerMatches: BuyerMatch[];
  dealPotential: number;
  whyItMatters: string[];
  priceHistory: { changeType: string; oldValue: unknown; newValue: unknown; at: string }[];
  priceDropCount: number;
  similar: { id: string; title: string | null; price: number | null; sqm: number | null; rooms: number | null; source: string; opportunity_score: number; similarity: number }[];
  duplicate: boolean;
  localityActivity: number;
  ai: AiFields;
}

export async function getExternalListingDetail(listingId: string): Promise<ExternalListingDetail | null> {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  const supabase = await createClient();

  const { data: listing } = await supabase.from("external_listings").select("*").eq("id", listingId).maybeSingle();
  if (!listing) return null;

  const [cityRes, hoodRes, histRes, dupRes, buyersRes, buyerIntelRes] = await Promise.all([
    listing.city
      ? supabase.from("external_listings").select("id,title,price,sqm,rooms,source,opportunity_score,neighborhood").eq("city", listing.city).eq("status", "active").limit(200)
      : Promise.resolve({ data: [] as ExtRow[] }),
    listing.neighborhood
      ? supabase.from("external_listings").select("id,price,sqm").eq("neighborhood", listing.neighborhood).eq("status", "active").limit(200)
      : Promise.resolve({ data: [] as { id: string; price: number | null; sqm: number | null }[] }),
    supabase.from("external_listing_history").select("change_type,old_value,new_value,created_at").eq("listing_id", listingId).order("created_at", { ascending: false }).limit(20),
    supabase.from("external_listing_duplicates").select("id").eq("listing_id", listingId).eq("status", "suspected").limit(1),
    supabase.from("buyers").select("id,full_name,budget_min,budget_max,rooms_min,rooms_max,preferred_areas,readiness,has_preapproval"),
    supabase.from("buyer_intelligence_profiles").select("buyer_id,buyer_conversion_probability,buyer_readiness_score"),
  ]);

  const cityListings = (cityRes.data ?? []) as { id: string; price: number | null; sqm: number | null; title: string | null; rooms: number | null; source: string; opportunity_score: number; neighborhood: string | null }[];
  const hoodListings = listing.neighborhood
    ? (hoodRes.data ?? []) as { id: string; price: number | null; sqm: number | null }[]
    : cityListings.map((l) => ({ id: l.id, price: l.price, sqm: l.sqm }));

  const forDeal: ListingForDeal = {
    id: listing.id, title: listing.title, city: listing.city, neighborhood: listing.neighborhood,
    price: listing.price, sqm: listing.sqm, rooms: listing.rooms, hasAgent: listing.has_agent, opportunityScore: listing.opportunity_score,
  };

  const market = marketIntel(forDeal, cityListings, hoodListings);

  const intelMap = new Map((buyerIntelRes.data ?? []).map((b) => [b.buyer_id, b]));
  const buyers: BuyerForMatch[] = (buyersRes.data ?? []).map((b) => {
    const intel = intelMap.get(b.id);
    return {
      id: b.id, name: b.full_name, budgetMin: b.budget_min, budgetMax: b.budget_max,
      roomsMin: b.rooms_min, roomsMax: b.rooms_max, areas: b.preferred_areas ?? [],
      readiness: b.readiness ?? intel?.buyer_readiness_score ?? null,
      hasPreapproval: b.has_preapproval ?? false,
      conversionProbability: intel?.buyer_conversion_probability ?? null,
    };
  });
  const buyerMatches = matchBuyersToListing(forDeal, buyers);

  const priceHistory = (histRes.data ?? []).map((h) => ({ changeType: h.change_type, oldValue: h.old_value, newValue: h.new_value, at: h.created_at }));
  const priceDropCount = priceHistory.filter((h) => h.changeType === "price_changed").length;
  const duplicate = (dupRes.data ?? []).length > 0;

  const dealPotential = calculateExternalDealPotential({
    buyerMatches: buyerMatches.length,
    topBuyerReadiness: buyerMatches[0]?.closingProbability ?? 0,
    competitiveness: market.competitiveness,
    privateOwner: listing.has_agent === false,
    localityActivity: cityListings.length,
    priceDropped: priceDropCount > 0,
  });

  // Similarity 0..100 from price + sqm + rooms proximity (+ same-neighborhood bonus).
  const refSqm = listing.sqm ?? 0;
  const refRooms = Number(listing.rooms ?? 0);
  const refPrice = listing.price ?? 0;
  const near = (a: number, b: number, ref: number) => (ref > 0 ? Math.max(0, 1 - Math.abs(a - b) / ref) : a === b ? 1 : 0);
  const similar = cityListings
    .filter((l) => l.id !== listing.id)
    .map((l) => {
      const sqmSim = l.sqm != null && refSqm > 0 ? near(l.sqm, refSqm, refSqm) : 0.5;
      const priceSim = l.price != null && refPrice > 0 ? near(l.price, refPrice, refPrice) : 0.5;
      const roomsSim = l.rooms == null || refRooms === 0 ? 0.5 : Math.abs(Number(l.rooms) - refRooms) < 0.5 ? 1 : Math.abs(Number(l.rooms) - refRooms) <= 1 ? 0.6 : 0.2;
      const hoodBonus = listing.neighborhood && l.neighborhood && l.neighborhood === listing.neighborhood ? 0.05 : 0;
      const similarity = Math.max(0, Math.min(100, Math.round((sqmSim * 0.4 + priceSim * 0.4 + roomsSim * 0.2 + hoodBonus) * 100)));
      return { l, similarity };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 6)
    .map(({ l, similarity }) => ({ id: l.id, title: l.title, price: l.price, sqm: l.sqm, rooms: l.rooms, source: l.source, opportunity_score: l.opportunity_score, similarity }));

  const ai = buildAiFields({ listing: forDeal, market, buyerMatches, dealPotential, privateOwner: listing.has_agent === false, priceDropCount });

  return {
    listing, market, buyerMatches, dealPotential,
    whyItMatters: whyItMatters({ market, privateOwner: listing.has_agent === false, priceDropCount, buyerMatches: buyerMatches.length, duplicate }),
    priceHistory, priceDropCount, similar, duplicate, localityActivity: cityListings.length, ai,
  };
}

// ── Bounded buyer-match enrichment for Smart Cards ───────────────────────────
export interface ListingMatchSummary { count: number; top: number }

/**
 * Compute matching-buyer count + top-match % for many listings in one pass.
 * Loads buyers + intel ONCE and reuses the pure matcher — safe for a list page.
 */
export async function enrichListingsBuyerMatches(
  listings: { id: string; title: string | null; city: string | null; neighborhood: string | null; price: number | null; sqm: number | null; rooms: number | null; has_agent: boolean | null; opportunity_score: number }[],
): Promise<Record<string, ListingMatchSummary>> {
  const supabase = await createClient();
  const [buyersRes, intelRes] = await Promise.all([
    supabase.from("buyers").select("id,full_name,budget_min,budget_max,rooms_min,rooms_max,preferred_areas,readiness,has_preapproval"),
    supabase.from("buyer_intelligence_profiles").select("buyer_id,buyer_conversion_probability,buyer_readiness_score"),
  ]);
  const intelMap = new Map((intelRes.data ?? []).map((b) => [b.buyer_id, b]));
  const buyers: BuyerForMatch[] = (buyersRes.data ?? []).map((b) => {
    const intel = intelMap.get(b.id);
    return {
      id: b.id, name: b.full_name, budgetMin: b.budget_min, budgetMax: b.budget_max,
      roomsMin: b.rooms_min, roomsMax: b.rooms_max, areas: b.preferred_areas ?? [],
      readiness: b.readiness ?? intel?.buyer_readiness_score ?? null, hasPreapproval: b.has_preapproval ?? false,
      conversionProbability: intel?.buyer_conversion_probability ?? null,
    };
  });
  const out: Record<string, ListingMatchSummary> = {};
  for (const l of listings) {
    const forDeal: ListingForDeal = { id: l.id, title: l.title, city: l.city, neighborhood: l.neighborhood, price: l.price, sqm: l.sqm, rooms: l.rooms, hasAgent: l.has_agent, opportunityScore: l.opportunity_score };
    const matches = matchBuyersToListing(forDeal, buyers);
    out[l.id] = { count: matches.length, top: matches[0]?.matchScore ?? 0 };
  }
  return out;
}

// ── Lightweight hover preview (rich, non-table data) ─────────────────────────
export interface ListingPreview {
  id: string;
  title: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  price: number | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  totalFloors: number | null;
  pricePerSqm: number | null;
  condition: string | null;
  parking: boolean | null;
  storage: boolean | null;
  elevator: boolean | null;
  balconies: number | null;
  description: string | null;
  images: string[];
  sourceType: string;
  detectedBrokerName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  hasAgent: boolean | null;
  opportunityScore: number;
  publishedAt: string | null;
  daysOnMarket: number | null;
  listingUrl: string | null;
  /** Derived "important things to know" beyond the raw fields. */
  insights: string[];
}

/** Pull up to 3 image URLs out of the flexible `images` JSON column. */
function extractImageUrls(raw: unknown, max = 3): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (out.length >= max) break;
    if (typeof item === "string" && item.startsWith("http")) out.push(item);
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const url = o.url ?? o.src ?? o.image ?? o.href;
      if (typeof url === "string" && url.startsWith("http")) out.push(url);
    }
  }
  return out;
}

/**
 * Fast preview for hover cards — surfaces information that is NOT already in the
 * row (images, description, amenities) plus a few derived insights. RLS-scoped.
 * Kept to a small number of queries so it stays snappy on hover.
 */
export async function getListingPreview(listingId: string): Promise<ListingPreview | null> {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  const supabase = await createClient();

  const { data: l } = await supabase
    .from("external_listings")
    .select("id,title,city,neighborhood,address,street,street_number,price,rooms,sqm,area_sqm,floor,total_floors,condition,parking,storage,elevator,balconies,description,images,listing_source_type,detected_broker_name,contact_name,contact_phone,has_agent,opportunity_score,published_at,first_seen_at,listing_url")
    .eq("id", listingId)
    .maybeSingle();
  if (!l) return null;

  const sqm = l.sqm ?? l.area_sqm ?? null;
  const pricePerSqm = l.price && sqm ? Math.round(l.price / sqm) : null;

  // City average ₪/m² (small, capped) + recent price-drop check — for insights.
  const [cityRes, dropRes] = await Promise.all([
    l.city ? supabase.from("external_listings").select("price,sqm,area_sqm").eq("city", l.city).eq("status", "active").limit(200) : Promise.resolve({ data: [] as { price: number | null; sqm: number | null; area_sqm: number | null }[] }),
    supabase.from("external_listing_history").select("change_type").eq("listing_id", listingId).eq("change_type", "price_changed").limit(1),
  ]);

  let cityAvgPpsqm = 0; let n = 0;
  for (const c of cityRes.data ?? []) {
    const s = c.sqm ?? c.area_sqm ?? null;
    if (c.price && s) { cityAvgPpsqm += c.price / s; n++; }
  }
  cityAvgPpsqm = n ? Math.round(cityAvgPpsqm / n) : 0;

  const daysOnMarket = (() => {
    const base = l.published_at ?? l.first_seen_at;
    if (!base) return null;
    return Math.max(0, Math.floor((Date.now() - new Date(base).getTime()) / 86_400_000));
  })();

  const addr = l.address ?? ([l.street, l.street_number].filter(Boolean).join(" ") || null);

  const insights: string[] = [];
  if (pricePerSqm && cityAvgPpsqm > 0) {
    const diff = Math.round(((pricePerSqm - cityAvgPpsqm) / cityAvgPpsqm) * 100);
    if (diff <= -8) insights.push(`מתחת לממוצע האזור ב-${Math.abs(diff)}% (₪${pricePerSqm.toLocaleString()}/מ״ר מול ₪${cityAvgPpsqm.toLocaleString()})`);
    else if (diff >= 8) insights.push(`מעל ממוצע האזור ב-${diff}%`);
    else insights.push(`מתומחר סביב ממוצע האזור (₪${cityAvgPpsqm.toLocaleString()}/מ״ר)`);
  }
  if ((dropRes.data ?? []).length > 0) insights.push("הורד המחיר לאחרונה");
  if (l.has_agent === false || l.listing_source_type === "private_seller") insights.push("בעלים פרטי — פוטנציאל בלעדיות");
  if (daysOnMarket != null) {
    if (daysOnMarket >= 60) insights.push(`${daysOnMarket} ימים בשוק — ייתכן מוכר גמיש`);
    else if (daysOnMarket <= 3) insights.push("חדש בשוק");
  }
  const amenities = [l.parking ? "חניה" : null, l.elevator ? "מעלית" : null, l.storage ? "מחסן" : null, l.balconies ? `${l.balconies} מרפסות` : null].filter(Boolean) as string[];
  if (amenities.length) insights.push(amenities.join(" · "));
  if (l.opportunity_score >= 70) insights.push(`ציון הזדמנות גבוה (${l.opportunity_score})`);

  return {
    id: l.id, title: l.title, city: l.city, neighborhood: l.neighborhood, address: addr,
    price: l.price, rooms: l.rooms, sqm, floor: l.floor, totalFloors: l.total_floors, pricePerSqm,
    condition: l.condition, parking: l.parking, storage: l.storage, elevator: l.elevator, balconies: l.balconies,
    description: l.description, images: extractImageUrls(l.images),
    sourceType: l.listing_source_type, detectedBrokerName: l.detected_broker_name,
    contactName: l.contact_name, contactPhone: l.contact_phone, hasAgent: l.has_agent,
    opportunityScore: l.opportunity_score, publishedAt: l.published_at, daysOnMarket, listingUrl: l.listing_url,
    insights: insights.slice(0, 5),
  };
}

// ── Seller acquisition mode (turn external opportunity into future inventory) ─
/** Create a seller-acquisition task with outreach script + checklist. */
export async function createAcquisitionTask(listingId: string): Promise<string> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  const { data: l } = await supabase.from("external_listings").select("*").eq("id", listingId).maybeSingle();
  if (!l) throw new Error("listing not found");

  const where = [l.neighborhood, l.city].filter(Boolean).join(", ") || "—";
  const priceTxt = l.price ? `${l.price.toLocaleString("he-IL")} ₪` : "ללא מחיר";
  const privateOwner = l.has_agent === false;
  const title = `גיוס נכס: ${l.title ?? "מודעה חיצונית"}${l.city ? ` · ${l.city}` : ""}`;

  const script = privateOwner
    ? `שלום, מצאתי את המודעה שלך (${where}, ${priceTxt}). אני סוכן/ת באזור עם קונים פעילים שמחפשים בדיוק כזה נכס. אשמח להציג איך חשיפה מקצועית וליווי יכולים למכור מהר ובמחיר טוב יותר — מתי נוח לדבר?`
    : `בדוק שיתוף פעולה עם המפרסם (${l.contact_name ?? "מתווך"}) או הצגת קונה רלוונטי. אין להציג כנכס בבלעדיות המשרד.`;

  const checklist = [
    "אימות פרטי הנכס מול המקור",
    privateOwner ? "יצירת קשר עם הבעלים והצעת ייצוג" : "בדיקת שיתוף פעולה עם המפרסם",
    "הצגת קונים פוטנציאליים תואמים",
    "בדיקת בלעדיות / תנאי שיתוף",
    "תיעוד והעברה ל-CRM אם מתקדם",
  ];
  const description = [
    `מקור: ${l.source} · מידע ציבורי בלבד (לא נכס בבלעדיות המשרד).`,
    l.listing_url ? `קישור: ${l.listing_url}` : "",
    `המלצת פנייה: ${privateOwner ? "בעלים פרטי — הזדמנות גיוס בלעדיות" : "מתווך — שיתוף פעולה/קונה"}.`,
    `תסריט שיחה: ${script}`,
    `צ׳קליסט גיוס: ${checklist.map((c, i) => `${i + 1}. ${c}`).join(" | ")}`,
  ].filter(Boolean).join("\n");

  const { data, error } = await supabase.from("tasks").insert({
    org_id: profile.org_id, created_by: user.id, assignee_id: user.id,
    title, description, status: "todo", priority: privateOwner ? "high" : "medium",
    entity_type: "external_listing", entity_id: l.id, intelligence_source: "external_listings",
  }).select("id").single();
  if (error) throw new Error(error.message);

  await logActivityEvent({ eventType: "task.created", entityType: "external_listing", entityId: l.id, title });
  return data.id as string;
}

// ── Promotion (unchanged behaviour: never automatic) ─────────────────────────
export async function promoteExternalListing(listingId: string): Promise<string> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  const { data: listing } = await supabase.from("external_listings").select("*").eq("id", listingId).maybeSingle();
  if (!listing) throw new Error("listing not found");
  if (listing.promoted_property_id) return listing.promoted_property_id;

  const { data, error } = await supabase
    .from("properties")
    .insert({
      org_id: profile.org_id, owner_id: user.id, uploaded_by_user_id: user.id,
      title: listing.title ?? "נכס חיצוני",
      type: (listing.property_type as Database["public"]["Tables"]["properties"]["Row"]["type"]) ?? "apartment",
      listing_kind: listing.deal_type === "rent" ? "rent" : "sale", status: "draft",
      price: listing.price ?? 0, rooms: listing.rooms ?? null, size_sqm: listing.sqm ?? null, city: listing.city ?? null,
      description: listing.description ?? null,
      property_origin: "external_imported", source_type: "external", external_source: listing.source,
      ownership_scope: "shared", exclusivity_scope: "external_unknown", listing_rights: "public_information_only",
      is_internal_inventory: false, is_external_inventory: true,
      source_listing_id: listing.source_id, source_listing_url: listing.listing_url, source_last_synced_at: listing.last_synced_at,
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  await supabase.from("external_listings").update({ promoted_property_id: data.id, status: "promoted", primary_property_id: data.id }).eq("id", listingId);
  await logActivityEvent({ eventType: "property.created", entityType: "property", entityId: data.id, title: `נכס חיצוני קודם ל-CRM (${listing.source})` });
  return data.id;
}

// ── Analysis dataset (AI-ready, no AI call) ──────────────────────────────────
export interface MarketAnalysis {
  localities: { city: string; count: number; avgPrice: number; avgSqmPrice: number; belowAverage: number }[];
  bySource: Record<string, number>;
  priceDrops: number;
  duplicateCandidates: number;
  summaryText: string;
}

export async function buildMarketAnalysis(): Promise<MarketAnalysis> {
  const supabase = await createClient();
  const [listingsRes, dropsRes, dupRes] = await Promise.all([
    supabase.from("external_listings").select("source,city,price,sqm").neq("status", "removed").limit(2000),
    supabase.from("external_listing_history").select("id", { count: "exact", head: true }).eq("change_type", "price_changed"),
    supabase.from("external_listing_duplicates").select("id", { count: "exact", head: true }).eq("status", "suspected"),
  ]);
  const rows = listingsRes.data ?? [];
  const bySource: Record<string, number> = {};
  const byCity = new Map<string, { count: number; priceSum: number; priceN: number; sqmPrices: number[] }>();
  for (const r of rows) {
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
    const c = r.city ?? "—";
    const e = byCity.get(c) ?? { count: 0, priceSum: 0, priceN: 0, sqmPrices: [] };
    e.count++;
    if (r.price) { e.priceSum += r.price; e.priceN++; }
    if (r.price && r.sqm) e.sqmPrices.push(r.price / r.sqm);
    byCity.set(c, e);
  }
  const localities = [...byCity.entries()].map(([city, e]) => {
    const avgPrice = e.priceN ? Math.round(e.priceSum / e.priceN) : 0;
    const avgSqm = e.sqmPrices.length ? Math.round(e.sqmPrices.reduce((a, b) => a + b, 0) / e.sqmPrices.length) : 0;
    const belowAverage = e.sqmPrices.filter((p) => avgSqm > 0 && p < avgSqm * 0.9).length;
    return { city, count: e.count, avgPrice, avgSqmPrice: avgSqm, belowAverage };
  }).sort((a, b) => b.count - a.count);

  const summaryText = [
    `סך מודעות חיצוניות: ${rows.length}.`,
    `לפי מקור: ${Object.entries(bySource).map(([s, n]) => `${s}=${n}`).join(", ") || "—"}.`,
    `ירידות מחיר שתועדו: ${dropsRes.count ?? 0}. חשד לכפילויות: ${dupRes.count ?? 0}.`,
    ...localities.slice(0, 8).map((l) => `${l.city}: ${l.count} מודעות, מחיר ממוצע ${l.avgPrice.toLocaleString("he-IL")}₪, ${l.avgSqmPrice.toLocaleString("he-IL")}₪/מ״ר, ${l.belowAverage} מתחת לממוצע.`),
  ].join("\n");

  return { localities, bySource, priceDrops: dropsRes.count ?? 0, duplicateCandidates: dupRes.count ?? 0, summaryText };
}
