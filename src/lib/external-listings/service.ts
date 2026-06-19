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
  getProvider,
  isApifyConfigured,
  type NormalizedExternalListing,
} from "./providers";
import { calculateExternalOpportunityScore, missingFields, qualityScores } from "./scoring";

type DB = SupabaseClient<Database>;
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

interface SyncOptions {
  localityId?: string | null;
  sources?: string[];
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

  const localities = await activeLocalities(db, orgId, opts.localityId);
  const summary: SyncSummary = { success: true, organizationId: orgId, cities: localities.map((l) => l.name), sources, inserted: 0, updated: 0, errors: [] };

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
        const raws = await provider.searchListings(loc.name);
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
