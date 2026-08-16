// ============================================================================
// ZONO — Claim My Listings: WRITE service (P10A, server-only).
// The real "שלי" action. Reuses the CANONICAL promote path
// (promoteExternalListing) — never a parallel property creator — then fills the
// gap it leaves: imports the listing's real photos into property_media, and
// persists the claim decision in broker_match_reviews. Server-authoritative:
//   • org/owner come from the session, never the client.
//   • evidence is RE-scored here (cross-org excluded, guardrails enforced).
//   • LOW / office-only / contradiction requires explicit human confirmation.
//   • idempotent: repeated claims resolve to ONE canonical property, 0 dup media.
// No migration — reuses existing tables only.
// ============================================================================
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { logActivityEvent } from "@/lib/activity/service";
import { promoteExternalListing } from "@/lib/external-listings/service";
import { getClaimCandidateById } from "./claim-candidate-service";
import { planClaim, snoozeUntil, type SnoozeWindow } from "./claim-decision-core";
import { assertClaimAllowed, mapListingImagesToMedia, buildClaimReviewRecord } from "./claim-write-core";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ClaimResult {
  ok: boolean;
  status: "claimed" | "refused";
  propertyId?: string;
  created?: boolean;              // true = new property, false = reused (dedupe)
  mediaImported?: number;         // rows written this call (0 if already present)
  requiresConfirmation?: boolean; // set on refusal when a human OK would unblock
  reason: string;
}

/** Resolve the canonical property for a listing via the idempotent reuse ladder,
 *  creating one through the canonical promote path only when nothing exists. */
async function resolveCanonicalProperty(
  listing: any, orgId: string, listingId: string,
): Promise<{ propertyId: string; created: boolean; reason: string }> {
  const svc: any = createServiceRoleClient();

  // Look for an internal property already imported from this exact source id.
  let existingBySourceId: string | null = null;
  if (listing.source_id) {
    const { data } = await svc.from("properties").select("id")
      .eq("org_id", orgId).eq("source_listing_id", listing.source_id).limit(1).maybeSingle();
    existingBySourceId = data?.id ?? null;
  }
  // A sibling in the same duplicate group that was already promoted.
  let duplicateGroupPromotedId: string | null = null;
  if (listing.duplicate_group_id) {
    const { data } = await svc.from("external_listings").select("promoted_property_id")
      .eq("duplicate_group_id", listing.duplicate_group_id).not("promoted_property_id", "is", null).limit(1).maybeSingle();
    duplicateGroupPromotedId = data?.promoted_property_id ?? null;
  }

  const plan = planClaim({
    listingPromotedPropertyId: listing.promoted_property_id ?? null,
    listingPrimaryPropertyId: listing.primary_property_id ?? null,
    existingBySourceId, duplicateGroupPromotedId,
  });

  if (plan.action === "reuse") {
    // Ensure this listing is linked to the reused property (idempotent).
    await svc.from("external_listings")
      .update({ promoted_property_id: plan.propertyId, primary_property_id: plan.propertyId, status: "promoted" })
      .eq("id", listingId).is("promoted_property_id", null);
    return { propertyId: plan.propertyId, created: false, reason: plan.reason };
  }
  // Nothing to reuse → canonical promote (creates a draft property, enforcement-aware).
  const propertyId = await promoteExternalListing(listingId);
  return { propertyId, created: true, reason: "promoted_via_canonical_service" };
}

/** Import the listing's real photos into property_media — only if none exist yet
 *  (idempotent). Uses service role (property_media follows the same write policy
 *  as properties). Returns the number of rows written. */
async function importListingMedia(orgId: string, propertyId: string, listing: any): Promise<number> {
  const svc: any = createServiceRoleClient();
  const { count } = await svc.from("property_media").select("id", { count: "exact", head: true }).eq("property_id", propertyId);
  if ((count ?? 0) > 0) return 0; // already imported — never duplicate media
  const rows = mapListingImagesToMedia(orgId, propertyId, listing.images, listing.title ?? null);
  if (!rows.length) return 0;
  const { error } = await svc.from("property_media").insert(rows as never);
  if (error) { console.error("[claim] media import failed:", error.message); return 0; }
  return rows.length;
}

/**
 * Claim an external listing as the caller's own property. THE production action.
 * @param listingId external_listings.id
 * @param opts.confirmLowConfidence explicit human confirmation for a weak candidate
 */
export async function claimExternalListing(
  listingId: string, opts: { confirmLowConfidence?: boolean } = {},
): Promise<ClaimResult> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, status: "refused", reason: "not_authenticated" };
  const orgId = profile.org_id;

  // Server-authoritative recheck — cross-org excluded, guardrails enforced HERE.
  const scored = await getClaimCandidateById(listingId);
  if (!scored) return { ok: false, status: "refused", reason: "not_a_candidate_for_this_org" };
  const { candidate } = scored;

  const gate = assertClaimAllowed(candidate.verdict, opts);
  if (!gate.allowed) {
    // CLAIM_FAILED_SAFE — safe refusal, nothing written (best-effort, non-blocking).
    try {
      const { notifyClaimFailedSafe } = await import("./claim-notifications");
      await notifyClaimFailedSafe(orgId, user.id, "הראיות חלשות — נדרש אישור מפורש. לא בוצע שינוי.");
    } catch { /* ignore */ }
    return { ok: false, status: "refused", requiresConfirmation: gate.requiresConfirmation, reason: gate.reason };
  }

  // Load the full listing row for reuse resolution + media.
  const db: any = await createClient();
  const { data: listing } = await db.from("external_listings")
    .select("id,org_id,title,images,source_id,promoted_property_id,primary_property_id,duplicate_group_id")
    .eq("id", listingId).maybeSingle();
  if (!listing) return { ok: false, status: "refused", reason: "listing_not_found" };

  const { propertyId, created } = await resolveCanonicalProperty(listing, orgId, listingId);
  const mediaImported = await importListingMedia(orgId, propertyId, listing);

  // Persist the claim decision (reuse broker_match_reviews; broker_id nullable —
  // the source agent ids live in evidence to avoid an FK on a non-broker_profiles id).
  const svc: any = createServiceRoleClient();
  const record = buildClaimReviewRecord({
    orgId, listingId, brokerId: null, verdict: candidate.verdict,
    outcome: "claimed", decidedBy: user.id, decidedAtIso: new Date().toISOString(), gate,
  });
  (record.evidence as any).anchorAgentIds = scored.anchor.agentIds;
  (record.evidence as any).phoneClass = candidate.phoneClass;
  (record.evidence as any).propertyId = propertyId;
  await svc.from("broker_match_reviews").insert(record as never);

  await logActivityEvent({
    eventType: "property.claimed", entityType: "property", entityId: propertyId,
    title: `נכס סומן "שלי" מתוך מודעה חיצונית (${candidate.source ?? "external"})`,
  });
  try {
    const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
    await emitBusinessEvent({ type: DOMAIN_EVENTS.propertyCreated, entityType: "property", entityId: propertyId, payload: { origin: "claimed_external", source: candidate.source, listingId } });
  } catch (e) { console.error("[claim] emit failed:", e); }
  // CLAIM_SUCCEEDED — internal notification (best-effort, non-blocking).
  try {
    const { notifyClaimSucceeded } = await import("./claim-notifications");
    await notifyClaimSucceeded(orgId, user.id, { propertyId, title: candidate.title });
  } catch { /* ignore */ }

  return { ok: true, status: "claimed", propertyId, created, mediaImported, reason: gate.reason };
}

// ── Reject / snooze (persist decision only — no property write) ───────────────
export async function rejectClaimCandidate(listingId: string): Promise<{ ok: boolean; reason: string }> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, reason: "not_authenticated" };
  const scored = await getClaimCandidateById(listingId);
  if (!scored) return { ok: false, reason: "not_a_candidate_for_this_org" };
  const svc: any = createServiceRoleClient();
  const record = buildClaimReviewRecord({
    orgId: profile.org_id, listingId, brokerId: null, verdict: scored.candidate.verdict,
    outcome: "rejected", decidedBy: user.id, decidedAtIso: new Date().toISOString(),
    gate: { allowed: true, requiresConfirmation: false, reason: "reject" },
  });
  await svc.from("broker_match_reviews").insert(record as never);
  return { ok: true, reason: "rejected" };
}

export async function snoozeClaimCandidate(listingId: string, window: SnoozeWindow = "tomorrow"): Promise<{ ok: boolean; reason: string; until?: number }> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, reason: "not_authenticated" };
  const scored = await getClaimCandidateById(listingId);
  if (!scored) return { ok: false, reason: "not_a_candidate_for_this_org" };
  const until = snoozeUntil(Date.now(), window);
  const record = buildClaimReviewRecord({
    orgId: profile.org_id, listingId, brokerId: null, verdict: scored.candidate.verdict,
    outcome: "snoozed", decidedBy: user.id, decidedAtIso: null,
    gate: { allowed: true, requiresConfirmation: false, reason: "snooze" },
  });
  (record.evidence as any).snoozeUntil = new Date(until).toISOString();
  const svc: any = createServiceRoleClient();
  await svc.from("broker_match_reviews").insert(record as never);
  return { ok: true, reason: "snoozed", until };
}
