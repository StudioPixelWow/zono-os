/**
 * Inventory Acquisition OS service — server-only. Builds one acquisition profile
 * per external listing from broker detection + buyer demand + market intelligence.
 * No auto-contact, no auto-promote, no scraping. Org-scoped (RLS).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { logActivityEvent } from "@/lib/activity/service";
import { promoteExternalListing } from "@/lib/external-listings/service";
import { matchBuyersToListing, type BuyerForMatch, type ListingForDeal } from "@/lib/external-listings/deal";
import { latestResearchForExternalListings } from "@/lib/transactions/service";
import type { Database } from "@/lib/supabase/types";
import {
  buildAcquisitionActions, buildAcquisitionAi, calculateAcquisitionScore, deriveAcquisitionStatus,
  generateOutreachScript, type AcquisitionInput, type OutreachScript,
} from "./engine";

type DB = Database["public"]["Tables"];
export type AcquisitionProfileRow = DB["inventory_acquisition_profiles"]["Row"];
const DAY = 86_400_000;
const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null);
const HUMAN_STATUSES = new Set(["contacted", "followup_scheduled", "not_relevant", "promoted_to_crm", "converted_to_seller", "lost"]);

async function requireProfile() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  return { user, profile };
}

const cityNorm = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : "");

export interface RecomputeSummary { profiles: number; qualified: number; needsReview: number }

export async function recomputeAcquisitionForOrg(): Promise<RecomputeSummary> {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const orgId = profile.org_id;

  const [listingsRes, buyersRes, intelRes, mktRes, histRes, existingRes] = await Promise.all([
    supabase.from("external_listings").select("id,city,price,rooms,sqm,has_agent,contact_name,contact_phone,listing_source_type,broker_detection_status,broker_confidence_score,opportunity_score,duplicate_confidence_score,last_synced_at,title")
      .eq("status", "active").is("promoted_property_id", null).limit(500),
    supabase.from("buyers").select("id,full_name,budget_min,budget_max,rooms_min,rooms_max,preferred_areas,readiness,has_preapproval"),
    supabase.from("buyer_intelligence_profiles").select("buyer_id,buyer_conversion_probability,buyer_readiness_score"),
    supabase.from("market_area_snapshots").select("locality_name,date,demand_score,supply_score,opportunity_score,avg_price_per_sqm").order("date", { ascending: false }).limit(500),
    supabase.from("external_listing_history").select("listing_id").eq("change_type", "price_changed").gte("created_at", new Date(Date.now() - 14 * DAY).toISOString()).limit(4000),
    supabase.from("inventory_acquisition_profiles").select("id,external_listing_id,acquisition_status"),
  ]);

  const listings = listingsRes.data ?? [];
  if (!listings.length) return { profiles: 0, qualified: 0, needsReview: 0 };

  // Sold-price transaction valuation (deep integration) — latest research report
  // per external listing, produced by recomputePipelineResearch(). Never invented.
  const research = await latestResearchForExternalListings(orgId, listings.map((l) => l.id));

  const intel = new Map((intelRes.data ?? []).map((b) => [b.buyer_id, b]));
  const buyers: BuyerForMatch[] = (buyersRes.data ?? []).map((b) => ({
    id: b.id, name: b.full_name, budgetMin: b.budget_min, budgetMax: b.budget_max,
    roomsMin: b.rooms_min, roomsMax: b.rooms_max, areas: b.preferred_areas ?? [],
    readiness: b.readiness ?? intel.get(b.id)?.buyer_readiness_score ?? null,
    hasPreapproval: b.has_preapproval ?? false, conversionProbability: intel.get(b.id)?.buyer_conversion_probability ?? null,
  }));

  const market = new Map<string, { demand: number; supply: number; opp: number; avgSqm: number | null }>();
  for (const m of mktRes.data ?? []) { const k = cityNorm(m.locality_name); if (!market.has(k)) market.set(k, { demand: m.demand_score, supply: m.supply_score, opp: m.opportunity_score, avgSqm: m.avg_price_per_sqm }); }
  const dropCount = new Map<string, number>();
  for (const h of histRes.data ?? []) dropCount.set(h.listing_id, (dropCount.get(h.listing_id) ?? 0) + 1);
  const existing = new Map((existingRes.data ?? []).map((p) => [p.external_listing_id, p]));

  const profileRows: DB["inventory_acquisition_profiles"]["Insert"][] = [];
  const summary: RecomputeSummary = { profiles: 0, qualified: 0, needsReview: 0 };
  const perListingActions = new Map<string, ReturnType<typeof buildAcquisitionActions>>();
  const reviewListings: { listingId: string; reviewType: string; title: string; reason: string; confidence: number }[] = [];

  for (const l of listings) {
    const forDeal: ListingForDeal = { id: l.id, title: l.title, city: l.city, neighborhood: null, price: l.price, sqm: l.sqm, rooms: l.rooms, hasAgent: l.has_agent, opportunityScore: l.opportunity_score };
    const matches = matchBuyersToListing(forDeal, buyers);
    const mk = market.get(cityNorm(l.city));
    const sqmP = l.price && l.sqm ? l.price / l.sqm : null;
    const belowAverage = !!(sqmP && mk?.avgSqm && sqmP <= mk.avgSqm * 0.9);

    const rr = research.get(l.id);
    const comps = Array.isArray(rr?.comparable_transactions) ? (rr!.comparable_transactions as unknown[]).length : 0;
    const input: AcquisitionInput = {
      listingSourceType: l.listing_source_type, brokerDetectionStatus: l.broker_detection_status,
      hasAgent: l.has_agent, hasPhone: !!l.contact_phone, hasName: !!l.contact_name,
      externalOpportunityScore: l.opportunity_score, belowAverage, priceDropCount: dropCount.get(l.id) ?? 0,
      duplicateConfidence: l.duplicate_confidence_score ?? 0, daysSinceSynced: daysSince(l.last_synced_at),
      matchingBuyers: matches.length, topBuyerReadiness: matches[0]?.closingProbability ?? 0,
      marketDemand: mk?.demand ?? 0, marketSupply: mk?.supply ?? 50, marketOpportunity: mk?.opp ?? 0, price: l.price,
      transactionGapPercent: rr?.gap_from_market_percent ?? null, transactionConfidence: rr?.confidence_score ?? 0, transactionComparables: comps,
    };
    const scores = calculateAcquisitionScore(input);
    const cityLabel = l.city ?? "";
    const ai = buildAcquisitionAi(input, scores, cityLabel);
    const derived = deriveAcquisitionStatus(input, scores);
    const prev = existing.get(l.id)?.acquisition_status;
    const status = prev && HUMAN_STATUSES.has(prev) ? prev : derived;

    if (status === "qualified") summary.qualified++;
    if (status === "needs_review") summary.needsReview++;

    profileRows.push({
      organization_id: orgId, external_listing_id: l.id,
      acquisition_score: scores.acquisition_score, private_seller_score: scores.private_seller_score,
      buyer_demand_score: scores.buyer_demand_score, price_opportunity_score: scores.price_opportunity_score,
      market_gap_score: scores.market_gap_score, contactability_score: scores.contactability_score,
      broker_competition_score: scores.broker_competition_score, double_side_potential_score: scores.double_side_potential_score,
      transaction_valuation_score: scores.transaction_valuation_score, transaction_gap_percent: rr?.gap_from_market_percent ?? null,
      transaction_confidence: rr?.confidence_score ?? 0, transaction_comparables: comps, research_report_id: rr?.id ?? null,
      acquisition_status: status, next_best_action: null, reason_summary: ai.reason,
      ai_summary: ai.ai_summary, ai_outreach_strategy: ai.ai_outreach_strategy, ai_risk_summary: ai.ai_risk_summary,
      metadata: { matchingBuyers: matches.length } as never, last_calculated_at: new Date().toISOString(),
    });
    const actions = buildAcquisitionActions(input, scores, cityLabel);
    perListingActions.set(l.id, actions);
    if (actions[0]) profileRows[profileRows.length - 1].next_best_action = actions[0].title;

    if (status === "needs_review") reviewListings.push({ listingId: l.id, reviewType: l.listing_source_type === "unknown" ? "broker_misclassified" : "duplicate_uncertain", title: `סיווג לא ודאי · ${cityLabel}`, reason: ai.reason, confidence: 60 });
    else if (scores.private_seller_score >= 80 && scores.acquisition_score >= 75) reviewListings.push({ listingId: l.id, reviewType: "high_value_private_seller", title: `בעלים פרטי איכותי · ${cityLabel}`, reason: ai.reason, confidence: 80 });
  }

  await supabase.from("inventory_acquisition_profiles").upsert(profileRows as never, { onConflict: "organization_id,external_listing_id" });
  summary.profiles = profileRows.length;

  // Re-select ids, then refresh actions + reviews.
  const { data: profs } = await supabase.from("inventory_acquisition_profiles").select("id,external_listing_id");
  const idByListing = new Map((profs ?? []).map((p) => [p.external_listing_id, p.id]));
  const profIds = (profs ?? []).map((p) => p.id);
  if (profIds.length) {
    await supabase.from("inventory_acquisition_actions").delete().in("acquisition_profile_id", profIds).eq("status", "open");
    const actionRows: DB["inventory_acquisition_actions"]["Insert"][] = [];
    for (const [listingId, actions] of perListingActions) {
      const pid = idByListing.get(listingId); if (!pid) continue;
      for (const a of actions.slice(0, 5)) actionRows.push({ organization_id: orgId, acquisition_profile_id: pid, external_listing_id: listingId, action_type: a.actionType, title: a.title, description: a.description, urgency_score: a.urgency, impact_score: a.impact, confidence_score: a.confidence, expected_outcome: a.expectedOutcome, status: "open" });
    }
    if (actionRows.length) await supabase.from("inventory_acquisition_actions").insert(actionRows as never);
  }
  // Reviews — refresh pending.
  const reviewListingIds = reviewListings.map((r) => r.listingId);
  if (reviewListingIds.length) await supabase.from("inventory_acquisition_reviews").delete().eq("status", "pending").in("external_listing_id", reviewListingIds);
  if (reviewListings.length) {
    await supabase.from("inventory_acquisition_reviews").insert(reviewListings.map((r) => ({ organization_id: orgId, external_listing_id: r.listingId, acquisition_profile_id: idByListing.get(r.listingId) ?? null, review_type: r.reviewType, title: r.title, reason: r.reason, confidence_score: r.confidence, status: "pending" })) as never);
  }
  return summary;
}

/** Ensure a single listing has an acquisition profile (does a full recompute). */
export async function openAcquisitionForListing(listingId: string): Promise<string> {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const { data: existing } = await supabase.from("inventory_acquisition_profiles").select("id").eq("external_listing_id", listingId).maybeSingle();
  if (existing?.id) return existing.id;
  // Seed a minimal profile then recompute the org so scores fill in.
  await supabase.from("inventory_acquisition_profiles").insert({ organization_id: profile.org_id, external_listing_id: listingId, acquisition_status: "new" } as never);
  await recomputeAcquisitionForOrg();
  const { data } = await supabase.from("inventory_acquisition_profiles").select("id").eq("external_listing_id", listingId).maybeSingle();
  return data?.id ?? "";
}

// ── Read models ──────────────────────────────────────────────────────────────
export interface AcquisitionCard {
  profileId: string; listingId: string; title: string | null; city: string | null; price: number | null;
  rooms: number | null; sqm: number | null; source: string; sourceType: string; badge: string | null;
  images: string[]; listingUrl: string | null; brokerName: string | null;
  contactName: string | null; contactPhone: string | null;
  acquisitionScore: number; privateSellerScore: number; buyerDemandScore: number; priceOpportunityScore: number;
  doubleSide: number; status: string; nextBestAction: string | null; reason: string | null;
}

type ProfileWithListing = AcquisitionProfileRow & { external_listings: { title: string | null; city: string | null; price: number | null; rooms: number | null; sqm: number | null; source: string; listing_source_type: string; broker_detection_badge: string | null; images: unknown; listing_url: string | null; detected_broker_name: string | null; contact_name: string | null; contact_phone: string | null } | null };

export async function getAcquisitionBoard(): Promise<AcquisitionCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_acquisition_profiles")
    .select("*, external_listings!inner(title,city,price,rooms,sqm,source,listing_source_type,broker_detection_badge,images,listing_url,detected_broker_name,contact_name,contact_phone)")
    .order("acquisition_score", { ascending: false }).limit(300);
  return ((data ?? []) as unknown as ProfileWithListing[]).map((p) => {
    const l = p.external_listings;
    return {
      profileId: p.id, listingId: p.external_listing_id, title: l?.title ?? null, city: l?.city ?? null,
      price: l?.price ?? null, rooms: l?.rooms ?? null, sqm: l?.sqm ?? null, source: l?.source ?? "",
      sourceType: l?.listing_source_type ?? "unknown", badge: l?.broker_detection_badge ?? null,
      images: Array.isArray(l?.images) ? (l!.images as string[]) : [], listingUrl: l?.listing_url ?? null,
      brokerName: l?.detected_broker_name ?? null,
      contactName: l?.contact_name ?? null, contactPhone: l?.contact_phone ?? null,
      acquisitionScore: p.acquisition_score, privateSellerScore: p.private_seller_score,
      buyerDemandScore: p.buyer_demand_score, priceOpportunityScore: p.price_opportunity_score,
      doubleSide: p.double_side_potential_score, status: p.acquisition_status,
      nextBestAction: p.next_best_action, reason: p.reason_summary,
    };
  });
}

export interface AcquisitionDetail {
  profile: AcquisitionProfileRow;
  actions: DB["inventory_acquisition_actions"]["Row"][];
  buyerMatches: { buyerId: string; name: string; matchScore: number; closingProbability: number; commission: number; reasons: string[] }[];
  script: OutreachScript;
  listing: { id: string; title: string | null; city: string | null; price: number | null; rooms: number | null; sqm: number | null; listingUrl: string | null; contactName: string | null; sourceType: string };
}

export async function getAcquisitionDetail(profileId: string): Promise<AcquisitionDetail | null> {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("inventory_acquisition_profiles").select("*").eq("id", profileId).maybeSingle();
  if (!profile) return null;
  const [{ data: actions }, { data: l }, buyersRes, intelRes] = await Promise.all([
    supabase.from("inventory_acquisition_actions").select("*").eq("acquisition_profile_id", profileId).order("urgency_score", { ascending: false }),
    supabase.from("external_listings").select("id,title,city,neighborhood,price,rooms,sqm,has_agent,listing_url,contact_name,contact_phone,opportunity_score,listing_source_type").eq("id", profile.external_listing_id).maybeSingle(),
    supabase.from("buyers").select("id,full_name,budget_min,budget_max,rooms_min,rooms_max,preferred_areas,readiness,has_preapproval"),
    supabase.from("buyer_intelligence_profiles").select("buyer_id,buyer_conversion_probability,buyer_readiness_score"),
  ]);
  const intel = new Map((intelRes.data ?? []).map((b) => [b.buyer_id, b]));
  const buyers: BuyerForMatch[] = (buyersRes.data ?? []).map((b) => ({ id: b.id, name: b.full_name, budgetMin: b.budget_min, budgetMax: b.budget_max, roomsMin: b.rooms_min, roomsMax: b.rooms_max, areas: b.preferred_areas ?? [], readiness: b.readiness ?? intel.get(b.id)?.buyer_readiness_score ?? null, hasPreapproval: b.has_preapproval ?? false, conversionProbability: intel.get(b.id)?.buyer_conversion_probability ?? null }));
  const forDeal: ListingForDeal = l ? { id: l.id, title: l.title, city: l.city, neighborhood: l.neighborhood, price: l.price, sqm: l.sqm, rooms: l.rooms, hasAgent: l.has_agent, opportunityScore: l.opportunity_score } : { id: "", title: null, city: null, neighborhood: null, price: null, sqm: null, rooms: null, hasAgent: null, opportunityScore: 0 };
  const matches = matchBuyersToListing(forDeal, buyers).slice(0, 5);
  const script = generateOutreachScript({ city: l?.city ?? null, rooms: l?.rooms ?? null, sqm: l?.sqm ?? null, matchingBuyers: matches.length, belowAverage: profile.price_opportunity_score >= 60, ownerName: l?.contact_name ?? null });
  return {
    profile, actions: actions ?? [],
    buyerMatches: matches.map((m) => ({ buyerId: m.buyerId, name: m.name, matchScore: m.matchScore, closingProbability: m.closingProbability, commission: m.commissionOpportunity, reasons: m.reasons })),
    script,
    listing: { id: l?.id ?? profile.external_listing_id, title: l?.title ?? null, city: l?.city ?? null, price: l?.price ?? null, rooms: l?.rooms ?? null, sqm: l?.sqm ?? null, listingUrl: l?.listing_url ?? null, contactName: l?.contact_name ?? null, sourceType: l?.listing_source_type ?? "unknown" },
  };
}

// ── Mutations ────────────────────────────────────────────────────────────────
export async function setAcquisitionStatus(profileId: string, status: string): Promise<void> {
  await requireProfile();
  const supabase = await createClient();
  await supabase.from("inventory_acquisition_profiles").update({ acquisition_status: status }).eq("id", profileId);
}

export async function createAcquisitionTask(profileId: string): Promise<string> {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();
  const { data: p } = await supabase.from("inventory_acquisition_profiles").select("external_listing_id,reason_summary").eq("id", profileId).maybeSingle();
  if (!p) throw new Error("profile not found");
  const { data: l } = await supabase.from("external_listings").select("title,city,contact_name,contact_phone,listing_url,listing_source_type").eq("id", p.external_listing_id).maybeSingle();
  const where = l?.city ?? "";
  const isPrivate = l?.listing_source_type === "private_seller";
  const title = isPrivate ? `צור קשר עם בעלים פרטי${where ? ` ב${where}` : ""}` : `בדוק גיוס נכס${where ? ` ב${where}` : ""}`;
  const description = [`נכס: ${l?.title ?? "מודעה חיצונית"}`, l?.contact_phone ? `טלפון: ${l.contact_phone}` : "", l?.listing_url ? `קישור: ${l.listing_url}` : "", p.reason_summary ? `סיבה: ${p.reason_summary}` : ""].filter(Boolean).join("\n");
  const { data: task, error } = await supabase.from("tasks").insert({ org_id: profile.org_id, created_by: user.id, assignee_id: user.id, title, description, status: "todo", priority: isPrivate ? "high" : "medium", entity_type: "external_listing", entity_id: p.external_listing_id, intelligence_source: "inventory_acquisition" } as never).select("id").single();
  if (error) throw new Error(error.message);
  await supabase.from("inventory_acquisition_profiles").update({ acquisition_status: "contacted" }).eq("id", profileId);
  await logActivityEvent({ eventType: "inventory_acquisition.task_created", entityType: "external_listing", entityId: p.external_listing_id, title });
  return task.id as string;
}

export async function promoteFromAcquisition(profileId: string): Promise<string> {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const { data: p } = await supabase.from("inventory_acquisition_profiles").select("external_listing_id").eq("id", profileId).maybeSingle();
  if (!p) throw new Error("profile not found");
  const propertyId = await promoteExternalListing(p.external_listing_id); // existing rules: external, public_information_only, NOT exclusive/office
  await supabase.from("inventory_acquisition_profiles").update({ acquisition_status: "promoted_to_crm" }).eq("id", profileId);
  await logActivityEvent({ eventType: "inventory_acquisition.promoted", entityType: "property", entityId: propertyId, title: "הזדמנות גיוס קודמה ל-CRM" });
  void profile;
  return propertyId;
}

// ── Command-center counts ────────────────────────────────────────────────────
export interface AcquisitionCommandCenter {
  total: number; highPriority: number; privateSellers: number; buyerDemand: number; doubleSide: number; contacted: number;
}
export async function getAcquisitionCommandCenter(): Promise<AcquisitionCommandCenter> {
  const supabase = await createClient();
  const { data } = await supabase.from("inventory_acquisition_profiles").select("acquisition_score,private_seller_score,buyer_demand_score,double_side_potential_score,acquisition_status").limit(2000);
  const rows = data ?? [];
  return {
    total: rows.length,
    highPriority: rows.filter((r) => r.acquisition_score >= 65).length,
    privateSellers: rows.filter((r) => r.private_seller_score >= 80).length,
    buyerDemand: rows.filter((r) => r.buyer_demand_score >= 40).length,
    doubleSide: rows.filter((r) => r.double_side_potential_score >= 70).length,
    contacted: rows.filter((r) => r.acquisition_status === "contacted" || r.acquisition_status === "followup_scheduled").length,
  };
}
