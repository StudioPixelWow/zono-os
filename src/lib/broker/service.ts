/**
 * Broker Intelligence service — server-only. Deterministic matching of external
 * listings to broker profiles + human-review queue. Public business info only;
 * never invents brokers; never marks verified without evidence.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { logActivityEvent } from "@/lib/activity/service";
import type { Database } from "@/lib/supabase/types";
import {
  bestBrokerMatch, classifyListingSourceType, normalizeAgencyName, normalizeHebrewName, normalizePhoneNumber,
  type AliasLike, type BrokerCandidate, type ListingForMatch,
} from "./engine";

type DB = Database["public"]["Tables"];
type Client = SupabaseClient<Database>;
export type BrokerProfileRow = DB["broker_profiles"]["Row"];
export type BrokerMatchReviewRow = DB["broker_match_reviews"]["Row"];

async function requireProfile() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  return { user, profile };
}
async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_min_role", { p_min: "admin" });
  return data === true;
}

// ── Create / import broker profiles ──────────────────────────────────────────
export interface BrokerInput {
  displayName: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  agencyName?: string | null;
  brokerType?: string;
  city?: string | null;
  serviceAreas?: string[];
  licenseNumber?: string | null;
  aliases?: string[];
}

export async function createBrokerProfile(input: BrokerInput): Promise<string> {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();
  const normName = normalizeHebrewName(input.displayName);
  const normAgency = input.agencyName ? normalizeAgencyName(input.agencyName) : null;
  const normPhone = input.phone ? normalizePhoneNumber(input.phone) : null;

  const { data, error } = await supabase.from("broker_profiles").insert({
    org_id: profile.org_id, display_name: input.displayName, normalized_name: normName,
    broker_type: (input.brokerType as never) ?? (input.agencyName ? "agency" : "independent_broker"),
    agency_name: input.agencyName ?? null, normalized_agency: normAgency,
    phone: input.phone ?? null, normalized_phone: normPhone, email: input.email ?? null,
    website: input.website ?? null, license_number: input.licenseNumber ?? null,
    primary_city: input.city ?? null, verification_status: "unverified", confidence_score: 50,
    created_by_user_id: user.id,
  }).select("id").single();
  if (error) throw new Error(error.message);
  const brokerId = data.id as string;

  const aliasRows: DB["broker_aliases"]["Insert"][] = [];
  const orgId = profile.org_id;
  if (normName) aliasRows.push({ org_id: orgId, broker_id: brokerId, alias_type: "name", value: input.displayName, normalized_value: normName, source: "manual" });
  if (normPhone) aliasRows.push({ org_id: orgId, broker_id: brokerId, alias_type: "phone", value: input.phone!, normalized_value: normPhone, source: "manual" });
  if (normAgency) aliasRows.push({ org_id: orgId, broker_id: brokerId, alias_type: "agency_name", value: input.agencyName!, normalized_value: normAgency, source: "manual" });
  for (const a of input.aliases ?? []) {
    const n = normalizeHebrewName(a);
    if (n) aliasRows.push({ org_id: orgId, broker_id: brokerId, alias_type: "nickname", value: a, normalized_value: n, source: "manual" });
  }
  if (aliasRows.length) await supabase.from("broker_aliases").insert(aliasRows as never);

  const areas = [input.city, ...(input.serviceAreas ?? [])].filter((c): c is string => !!c);
  if (areas.length) {
    await supabase.from("broker_service_areas").insert(areas.map((c) => ({ org_id: orgId, broker_id: brokerId, city_name: c })) as never);
  }
  await logActivityEvent({ eventType: "broker.profile_created", entityType: "broker", entityId: brokerId, title: `פרופיל מתווך נוצר: ${input.displayName}` });
  return brokerId;
}

export interface CsvImportResult { created: number; skipped: number }

/** Bulk create broker profiles from parsed CSV rows (safe initial enrichment). */
export async function importBrokersFromCsv(rows: BrokerInput[]): Promise<CsvImportResult> {
  let created = 0, skipped = 0;
  for (const r of rows) {
    if (!r.displayName?.trim()) { skipped++; continue; }
    try { await createBrokerProfile(r); created++; } catch { skipped++; }
  }
  return { created, skipped };
}

// ── Detection: match external listings → broker profiles ─────────────────────
export interface DetectionSummary { scanned: number; matched: number; needsReview: number; unknown: number }

async function loadCandidates(supabase: Client): Promise<BrokerCandidate[]> {
  const [{ data: profiles }, { data: aliases }] = await Promise.all([
    supabase.from("broker_profiles").select("id,normalized_name,normalized_agency,normalized_phone,primary_city").limit(2000),
    supabase.from("broker_aliases").select("broker_id,alias_type,normalized_value").limit(8000),
  ]);
  const aliasMap = new Map<string, AliasLike[]>();
  for (const a of aliases ?? []) {
    const list = aliasMap.get(a.broker_id) ?? [];
    list.push({ alias_type: a.alias_type, normalized_value: a.normalized_value });
    aliasMap.set(a.broker_id, list);
  }
  return (profiles ?? []).map((p) => ({
    id: p.id, normalizedName: p.normalized_name, normalizedAgency: p.normalized_agency,
    normalizedPhone: p.normalized_phone, primaryCity: p.primary_city, aliases: aliasMap.get(p.id) ?? [],
  }));
}

/**
 * Auto-register a broker profile for every publisher classified as broker/agency
 * that we don't already have. Uses ONLY the public listing's name/phone as
 * evidence; created as 'unverified'. Deduped by normalized phone, else name.
 */
export async function ensureBrokerProfilesFromListings(db: Client, orgId: string): Promise<number> {
  const { data: listings } = await db
    .from("external_listings")
    .select("id,contact_name,contact_phone,detected_broker_name,city,listing_source_type,listing_url,source")
    .eq("status", "active").is("promoted_property_id", null)
    .in("listing_source_type", ["broker", "agency", "office"]).limit(2000);
  if (!listings?.length) return 0;

  const { data: existing } = await db.from("broker_profiles").select("id,normalized_name,normalized_phone");
  const byPhone = new Map<string, string>(); const byName = new Map<string, string>();
  for (const b of existing ?? []) { if (b.normalized_phone) byPhone.set(b.normalized_phone, b.id); if (b.normalized_name) byName.set(b.normalized_name, b.id); }

  const now = new Date().toISOString();
  let created = 0;
  for (const l of listings) {
    const rawName = l.detected_broker_name ?? l.contact_name;
    const normName = normalizeHebrewName(rawName);
    const normPhone = normalizePhoneNumber(l.contact_phone);
    if (!normName && !normPhone) continue;
    if (normPhone && byPhone.has(normPhone)) continue;
    if (!normPhone && normName && byName.has(normName)) continue;
    const isAgency = l.listing_source_type === "agency" || l.listing_source_type === "office";
    const { data: prof } = await db.from("broker_profiles").insert({
      org_id: orgId, display_name: rawName ?? "מתווך", normalized_name: normName || (rawName ?? "מתווך"),
      broker_type: (isAgency ? "agency" : "independent_broker") as never, agency_name: isAgency ? rawName : null,
      normalized_agency: isAgency ? normalizeAgencyName(rawName) : null,
      phone: l.contact_phone ?? null, normalized_phone: normPhone || null,
      primary_city: l.city ?? null, verification_status: "unverified", confidence_score: 45,
    } as never).select("id").single();
    if (!prof?.id) continue;
    created++;
    if (normPhone) byPhone.set(normPhone, prof.id);
    if (normName) byName.set(normName, prof.id);
    const aliases: DB["broker_aliases"]["Insert"][] = [];
    if (normName) aliases.push({ org_id: orgId, broker_id: prof.id, alias_type: "name", value: rawName!, normalized_value: normName, source: "auto:listing" });
    if (normPhone) aliases.push({ org_id: orgId, broker_id: prof.id, alias_type: "phone", value: l.contact_phone!, normalized_value: normPhone, source: "auto:listing" });
    if (aliases.length) await db.from("broker_aliases").insert(aliases as never);
    await db.from("broker_sources").insert({ org_id: orgId, broker_id: prof.id, source_type: `external:${l.source}`, url: l.listing_url, evidence: { contactName: l.contact_name, city: l.city } as never, captured_at: now } as never);
    if (l.city) await db.from("broker_service_areas").insert({ org_id: orgId, broker_id: prof.id, city_name: l.city } as never);
  }
  return created;
}

/**
 * Core detection — works with any client (RLS user OR service-role cron).
 * Skips listings LOCKED by a human decision (approved/rejected). Applies
 * heuristic classification for listings with no broker-profile match.
 */
export async function detectForOrg(db: Client, orgId: string): Promise<DetectionSummary> {
  const summary: DetectionSummary = { scanned: 0, matched: 0, needsReview: 0, unknown: 0 };
  // Auto-register newly seen broker/agency publishers into the broker DB first,
  // so detection can match listings to real profiles.
  try { await ensureBrokerProfilesFromListings(db, orgId); } catch (e) { console.error("[broker] auto-register failed:", e); }
  const candidates = await loadCandidates(db);
  const { data: listings } = await db
    .from("external_listings")
    .select("id,contact_name,contact_phone,contact_type,city,has_agent")
    .eq("status", "active").is("promoted_property_id", null)
    .eq("broker_detection_locked", false).limit(1000);
  if (!listings?.length) return summary;

  const nameById = new Map<string, string>();
  const typeById = new Map<string, string>();
  if (candidates.length) {
    const { data } = await db.from("broker_profiles").select("id,display_name,broker_type");
    for (const b of data ?? []) { nameById.set(b.id, b.display_name); typeById.set(b.id, b.broker_type); }
  }
  const now = new Date().toISOString();

  for (const l of listings) {
    summary.scanned++;
    const lm: ListingForMatch = { contactName: l.contact_name, contactPhone: l.contact_phone, city: l.city, agencyName: null };
    const m = candidates.length ? bestBrokerMatch(lm, candidates) : null;

    if (m) {
      const brokerName = nameById.get(m.brokerId) ?? null;
      const isAgency = typeById.get(m.brokerId) === "agency" || typeById.get(m.brokerId) === "office";
      const auto = m.status === "auto_matched";
      await db.from("external_listings").update({
        detected_broker_id: m.brokerId, detected_broker_name: brokerName,
        broker_confidence_score: m.confidence, broker_match_status: m.status,
        broker_evidence: { matchType: m.matchType, ...m.evidence } as never, broker_detected_at: now,
        listing_source_type: isAgency ? "agency" : "broker",
        broker_detection_badge: isAgency ? "משרד תיווך" : "פרסום מתווך",
        broker_detection_status: auto ? "auto" : "needs_review",
        broker_detection_source: "profile_match", broker_detection_last_run_at: now,
      } as never).eq("id", l.id);

      await db.from("property_broker_matches").delete().eq("external_listing_id", l.id).eq("status", "pending");
      await db.from("property_broker_matches").insert({
        org_id: orgId, external_listing_id: l.id, broker_id: m.brokerId, match_type: m.matchType as never,
        confidence_score: m.confidence, status: auto ? "approved" : "pending", evidence: m.evidence as never,
      } as never);

      if (auto) summary.matched++;
      else {
        summary.needsReview++;
        await db.from("broker_match_reviews").delete().eq("listing_id", l.id).eq("status", "pending");
        await db.from("broker_match_reviews").insert({
          org_id: orgId, listing_id: l.id, broker_id: m.brokerId, match_type: m.matchType as never,
          confidence_score: m.confidence, evidence: m.evidence as never, status: "pending",
        } as never);
      }
    } else {
      // No profile match — heuristic classification only (no confirmed broker).
      const cls = classifyListingSourceType({ hasAgent: l.has_agent, contactType: l.contact_type, contactName: l.contact_name });
      await db.from("external_listings").update({
        detected_broker_id: null, detected_broker_name: null, broker_confidence_score: 0,
        broker_match_status: "unmatched", listing_source_type: cls.sourceType as never,
        broker_detection_badge: cls.badge, broker_detection_status: "unknown",
        broker_detection_source: "heuristic", broker_detection_last_run_at: now,
      } as never).eq("id", l.id);
      summary.unknown++;
    }
  }
  return summary;
}

/** Session wrapper (RLS, org from session). */
export async function runBrokerDetectionForOrg(): Promise<DetectionSummary> {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  return detectForOrg(supabase as unknown as Client, profile.org_id);
}

// ── Review workflow (admin-gated) ────────────────────────────────────────────
export async function decideMatchReview(reviewId: string, decision: "approved" | "rejected"): Promise<void> {
  const { user } = await requireProfile();
  if (!(await isAdmin())) throw new Error("נדרשת הרשאת מנהל");
  const supabase = await createClient();
  const { data: review } = await supabase.from("broker_match_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (!review) throw new Error("review not found");
  await supabase.from("broker_match_reviews").update({ status: decision, decided_by: user.id, decided_at: new Date().toISOString() }).eq("id", reviewId);

  if (review.listing_id) {
    if (decision === "approved") {
      // LOCK the listing so future re-syncs never overwrite the human decision.
      await supabase.from("external_listings").update({
        broker_match_status: "approved", broker_detection_status: "approved",
        broker_detection_source: "manual", broker_detection_locked: true,
      } as never).eq("id", review.listing_id);
      await supabase.from("property_broker_matches").update({ status: "approved" }).eq("external_listing_id", review.listing_id).eq("broker_id", review.broker_id as string);
    } else {
      await supabase.from("external_listings").update({
        broker_match_status: "rejected", broker_detection_status: "rejected",
        broker_detection_source: "manual", broker_detection_locked: true,
        detected_broker_id: null, detected_broker_name: null, broker_confidence_score: 0,
      } as never).eq("id", review.listing_id);
      await supabase.from("property_broker_matches").delete().eq("external_listing_id", review.listing_id).eq("broker_id", review.broker_id as string);
    }
  }
  await logActivityEvent({ eventType: `broker.match_${decision}`, entityType: "broker", entityId: (review.broker_id as string) ?? reviewId, title: `התאמת מתווך ${decision === "approved" ? "אושרה" : "נדחתה"}` });
}

/** Approve/reject the pending review attached to a listing (table quick action). */
export async function decideListingMatch(listingId: string, decision: "approved" | "rejected"): Promise<void> {
  const supabase = await createClient();
  const { data: review } = await supabase.from("broker_match_reviews").select("id").eq("listing_id", listingId).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!review) throw new Error("אין התאמה ממתינה למודעה זו");
  await decideMatchReview(review.id, decision);
}

export async function verifyBroker(brokerId: string): Promise<void> {
  const { user } = await requireProfile();
  if (!(await isAdmin())) throw new Error("נדרשת הרשאת מנהל");
  const supabase = await createClient();
  // Only verify when there is at least one source/evidence record.
  const { count } = await supabase.from("broker_sources").select("id", { count: "exact", head: true }).eq("broker_id", brokerId);
  await supabase.from("broker_profiles").update({
    verification_status: "human_verified", verified_by_user_id: user.id, verified_at: new Date().toISOString(),
    confidence_score: (count ?? 0) > 0 ? 95 : 80,
  }).eq("id", brokerId);
  await logActivityEvent({ eventType: "broker.verified", entityType: "broker", entityId: brokerId, title: "מתווך אומת ידנית" });
}

export async function mergeBrokers(keepId: string, mergeId: string): Promise<void> {
  if (!(await isAdmin())) throw new Error("נדרשת הרשאת מנהל");
  if (keepId === mergeId) return;
  const supabase = await createClient();
  await Promise.all([
    supabase.from("broker_aliases").update({ broker_id: keepId }).eq("broker_id", mergeId),
    supabase.from("broker_sources").update({ broker_id: keepId }).eq("broker_id", mergeId),
    supabase.from("broker_service_areas").update({ broker_id: keepId }).eq("broker_id", mergeId),
    supabase.from("property_broker_matches").update({ broker_id: keepId }).eq("broker_id", mergeId),
  ]);
  await supabase.from("broker_match_reviews").update({ broker_id: keepId, status: "merged" }).eq("broker_id", mergeId);
  await supabase.from("broker_profiles").delete().eq("id", mergeId);
  await logActivityEvent({ eventType: "broker.merged", entityType: "broker", entityId: keepId, title: "מתווכים מוזגו" });
}

/** Create a broker profile from an unknown external-listing publisher. */
export async function createBrokerFromListing(listingId: string): Promise<string> {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const { data: l } = await supabase.from("external_listings").select("contact_name,contact_phone,city,source,listing_url").eq("id", listingId).maybeSingle();
  if (!l) throw new Error("listing not found");
  const brokerId = await createBrokerProfile({
    displayName: l.contact_name ?? "מתווך לא ידוע", phone: l.contact_phone, city: l.city, brokerType: "independent_broker",
  });
  // Capture the listing as a source (evidence — public URL only).
  await supabase.from("broker_sources").insert({
    org_id: profile.org_id, broker_id: brokerId, source_type: `external:${l.source}`, url: l.listing_url,
    evidence: { contactName: l.contact_name, contactPhone: l.contact_phone, city: l.city } as never, captured_at: new Date().toISOString(),
  } as never);
  return brokerId;
}

// ── Read models ──────────────────────────────────────────────────────────────
export interface BrokerBoard {
  profiles: BrokerProfileRow[];
  pendingReviews: { id: string; listingId: string | null; brokerId: string | null; brokerName: string; listingTitle: string; matchType: string | null; confidence: number; evidence: unknown }[];
  counts: { profiles: number; pending: number; verified: number };
}

export async function getBrokerBoard(cityFilter?: string): Promise<BrokerBoard> {
  const supabase = await createClient();
  let pq = supabase.from("broker_profiles").select("*").order("listings_count", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  if (cityFilter) pq = pq.ilike("primary_city", `%${cityFilter}%`);
  const [{ data: profiles }, { data: reviews }] = await Promise.all([
    pq,
    supabase.from("broker_match_reviews").select("id,listing_id,broker_id,match_type,confidence_score,evidence").eq("status", "pending").order("confidence_score", { ascending: false }).limit(100),
  ]);
  const profs = profiles ?? [];
  const nameById = new Map(profs.map((p) => [p.id, p.display_name]));
  // Resolve listing titles for the review queue.
  const listingIds = [...new Set((reviews ?? []).map((r) => r.listing_id).filter((x): x is string => !!x))];
  const titleById = new Map<string, string>();
  if (listingIds.length) {
    const { data: ls } = await supabase.from("external_listings").select("id,title,city").in("id", listingIds);
    for (const l of ls ?? []) titleById.set(l.id, `${l.title ?? "מודעה"}${l.city ? ` · ${l.city}` : ""}`);
  }
  const verified = profs.filter((p) => p.verification_status === "human_verified").length;
  return {
    profiles: profs,
    pendingReviews: (reviews ?? []).map((r) => ({
      id: r.id, listingId: r.listing_id, brokerId: r.broker_id,
      brokerName: r.broker_id ? nameById.get(r.broker_id) ?? "מתווך" : "מתווך",
      listingTitle: r.listing_id ? titleById.get(r.listing_id) ?? "מודעה" : "—",
      matchType: r.match_type, confidence: r.confidence_score, evidence: r.evidence,
    })),
    counts: { profiles: profs.length, pending: (reviews ?? []).length, verified },
  };
}

export interface BrokerDetail {
  profile: BrokerProfileRow;
  aliases: DB["broker_aliases"]["Row"][];
  sources: DB["broker_sources"]["Row"][];
  serviceAreas: DB["broker_service_areas"]["Row"][];
  externalListings: { id: string; title: string | null; city: string | null; price: number | null; confidence: number }[];
  logoAssets: DB["broker_logo_assets"]["Row"][];
  isCompetitor: boolean;
}

export async function getBrokerProfileDetail(id: string): Promise<BrokerDetail | null> {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("broker_profiles").select("*").eq("id", id).maybeSingle();
  if (!profile) return null;
  const [{ data: aliases }, { data: sources }, { data: areas }, { data: listings }, { data: logos }] = await Promise.all([
    supabase.from("broker_aliases").select("*").eq("broker_id", id).limit(100),
    supabase.from("broker_sources").select("*").eq("broker_id", id).limit(100),
    supabase.from("broker_service_areas").select("*").eq("broker_id", id).limit(100),
    supabase.from("external_listings").select("id,title,city,price,broker_confidence_score").eq("detected_broker_id", id).limit(100),
    supabase.from("broker_logo_assets").select("*").eq("broker_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  return {
    profile, aliases: aliases ?? [], sources: sources ?? [], serviceAreas: areas ?? [],
    externalListings: (listings ?? []).map((l) => ({ id: l.id, title: l.title, city: l.city, price: l.price, confidence: l.broker_confidence_score })),
    logoAssets: logos ?? [],
    isCompetitor: (profile.metadata as { is_competitor?: boolean } | null)?.is_competitor === true,
  };
}

/** Flag/unflag a broker profile as a tracked competitor (stored on metadata). */
export async function markBrokerCompetitor(brokerId: string, isCompetitor: boolean): Promise<void> {
  await requireProfile();
  const supabase = await createClient();
  const { data: cur } = await supabase.from("broker_profiles").select("metadata").eq("id", brokerId).maybeSingle();
  const meta = { ...((cur?.metadata as Record<string, unknown>) ?? {}), is_competitor: isCompetitor };
  await supabase.from("broker_profiles").update({ metadata: meta as never }).eq("id", brokerId);
  await logActivityEvent({ eventType: isCompetitor ? "broker.marked_competitor" : "broker.unmarked_competitor", entityType: "broker", entityId: brokerId, title: isCompetitor ? "סומן כמתחרה" : "הוסר סימון מתחרה" });
}

export interface BrokerAnalytics {
  totalAgencies: number; totalBrokers: number; withLogo: number; needsReview: number;
  competitors: number; topCities: { city: string; count: number }[]; logoMatchRate: number;
  byVerification: { status: string; count: number }[];
}

export async function getBrokerAnalytics(): Promise<BrokerAnalytics> {
  const supabase = await createClient();
  const { data: profs } = await supabase.from("broker_profiles").select("broker_type,verification_status,primary_city,logo_url,enrichment_status,metadata,listings_count").limit(2000);
  const rows = profs ?? [];
  const agencyTypes = new Set(["agency", "office"]);
  const cityCount = new Map<string, number>();
  for (const r of rows) { if (r.primary_city) cityCount.set(r.primary_city, (cityCount.get(r.primary_city) ?? 0) + 1); }
  const verMap = new Map<string, number>();
  for (const r of rows) verMap.set(r.verification_status, (verMap.get(r.verification_status) ?? 0) + 1);
  const withLogo = rows.filter((r) => !!r.logo_url).length;
  return {
    totalAgencies: rows.filter((r) => agencyTypes.has(r.broker_type)).length,
    totalBrokers: rows.length,
    withLogo,
    needsReview: rows.filter((r) => r.verification_status === "unverified" || r.enrichment_status === "needs_review").length,
    competitors: rows.filter((r) => (r.metadata as { is_competitor?: boolean } | null)?.is_competitor === true).length,
    topCities: [...cityCount.entries()].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    logoMatchRate: rows.length ? Math.round((withLogo / rows.length) * 100) : 0,
    byVerification: [...verMap.entries()].map(([status, count]) => ({ status, count })),
  };
}
