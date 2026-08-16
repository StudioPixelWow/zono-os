// ============================================================================
// ZONO — Claim My Listings: candidate service (P10, server-only, READ-ONLY).
// Resolves the caller's verified SOURCE ANCHOR (brokerage_agents in the org's
// office(s) matching the broker identity) and surfaces external_listings the
// evidence engine associates with it — scored HIGH/MEDIUM/LOW with reasons.
// Reuses external_listings + brokerage_external_listing_links; NO migration, and
// NEVER writes/promotes here (claiming is a separate, human-confirmed action).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { scoreCandidate, isCandidate, type CandidateEvidence, type EvidenceVerdict } from "./claim-evidence-core";

/* eslint-disable @typescript-eslint/no-explicit-any */

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^972/, "0");
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export interface ClaimAnchor {
  orgId: string;
  agentIds: string[];      // stable brokerage_agents ids (verified source identity)
  officeIds: string[];
  normalizedNames: string[];
  phones: string[];
  ready: boolean;          // an identity anchor exists at all
}

/** Resolve the caller's source identity anchor from brokerage data (org-scoped). */
export async function getClaimAnchor(): Promise<ClaimAnchor | null> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return null;
  const db: any = await createClient();
  const empty: ClaimAnchor = { orgId: profile.org_id, agentIds: [], officeIds: [], normalizedNames: [], phones: [], ready: false };

  // Broker profile(s) for this org give the display name + phone; brokerage_agents in
  // the matching office give the stable source agent ids.
  const { data: profs } = await db.from("broker_profiles").select("display_name,normalized_name,phone,normalized_phone").eq("org_id", profile.org_id).limit(20);
  const names = new Set<string>(); const phones = new Set<string>();
  for (const p of (profs ?? [])) { if (p.normalized_name) names.add(norm(p.normalized_name)); if (p.display_name) names.add(norm(p.display_name)); const d = digits(p.normalized_phone || p.phone); if (d) phones.add(d); }
  // The agent's own ZONO phone is the strongest disambiguator.
  const ud = digits((profile as any).phone); if (ud) phones.add(ud);

  if (!names.size) return empty;
  // Stable source agent ids = brokerage_agents whose normalized_name matches an anchor name.
  const { data: agents } = await db.from("brokerage_agents").select("id,office_id,normalized_name,full_name,primary_phone").limit(50);
  const agentIds: string[] = []; const officeIds = new Set<string>();
  for (const a of (agents ?? [])) {
    const an = norm(a.normalized_name || a.full_name);
    if ([...names].some((n) => n && (an === n || (n.length > 4 && an.includes(n))))) {
      agentIds.push(a.id); if (a.office_id) officeIds.add(a.office_id);
      const ad = digits(a.primary_phone); if (ad) phones.add(ad);
    }
  }
  return { orgId: profile.org_id, agentIds, officeIds: [...officeIds], normalizedNames: [...names], phones: [...phones], ready: agentIds.length > 0 || names.size > 0 };
}

export interface ClaimCandidate {
  externalListingId: string;
  title: string | null; city: string | null; neighborhood: string | null; address: string | null;
  price: number | null; rooms: string | null; sqm: number | null; propertyType: string | null; dealType: string | null;
  imageCount: number; primaryImage: string | null; source: string | null; listingUrl: string | null;
  contactName: string | null; publishedAt: string | null; firstSeenAt: string | null;
  alreadyPromoted: boolean;
  verdict: EvidenceVerdict;
}

/** Map a listing + its link row to the pure evidence input. */
function toEvidence(anchor: ClaimAnchor, link: any, listing: any): CandidateEvidence {
  const linkOrg = link?.organization_id ?? listing?.org_id ?? null;
  const sameOrg = linkOrg === anchor.orgId;
  const stableAgentIdMatch = Boolean(link?.agent_id && anchor.agentIds.includes(link.agent_id)) &&
    Array.isArray(link?.match_reasons) && link.match_reasons.some((r: string) => /טלפון זהה|derived_from_broker|id:/i.test(r));
  const listingName = norm(listing?.contact_name || link?.matched_name);
  const anchorHasName = anchor.normalizedNames.some((n) => n && listingName && (listingName === n));
  const anchorFirstOnly = !anchorHasName && anchor.normalizedNames.some((n) => n && listingName && n.split(" ")[0] && listingName.split(" ").includes(n.split(" ")[0]));
  const nameMatch: CandidateEvidence["nameMatch"] = anchorHasName ? "exact" : anchorFirstOnly ? "first_only" : (link?.matched_name ? "similar" : "none");
  const listingPhone = digits(listing?.contact_phone || link?.matched_phone);
  const phoneMatch: CandidateEvidence["phoneMatch"] = !listingPhone ? "unknown" : anchor.phones.includes(listingPhone) ? "exact" : (anchor.phones.length ? "contradict" : "unknown");
  const officeMatch = Boolean(link?.office_id && anchor.officeIds.includes(link.office_id));
  const cityMatch = norm(listing?.city) === "rehovot" || Boolean(listing?.city);
  return { sameOrg, stableAgentIdMatch, nameMatch, phoneMatch, officeMatch, cityMatch, priorConfirmedSameIdentity: 0 };
}

const firstImage = (images: unknown): string | null => {
  if (Array.isArray(images) && images.length) { const f = images[0]; return typeof f === "string" ? f : (f && typeof f === "object" && "url" in (f as any) ? (f as any).url : null); }
  return null;
};

/** The caller's real claim candidates, scored + explained. Read-only. */
export async function getClaimCandidates(limit = 30): Promise<{ anchor: ClaimAnchor | null; candidates: ClaimCandidate[] }> {
  const anchor = await getClaimAnchor();
  if (!anchor || !anchor.ready) return { anchor, candidates: [] };
  const db: any = await createClient();

  // Listings linked to the anchor's stable agent ids (the strongest source signal).
  const { data: links } = await db.from("brokerage_external_listing_links")
    .select("external_listing_id,organization_id,agent_id,office_id,matched_name,matched_phone,match_reasons,confidence_score")
    .in("agent_id", (anchor.agentIds.length ? anchor.agentIds : ["00000000-0000-0000-0000-000000000000"]))
    .eq("organization_id", anchor.orgId).limit(200);
  const linkRows = (links ?? []) as any[];
  const listingIds = [...new Set(linkRows.map((l) => l.external_listing_id).filter(Boolean))];
  if (!listingIds.length) return { anchor, candidates: [] };

  const { data: listings } = await db.from("external_listings")
    .select("id,org_id,title,city,neighborhood,address,price,rooms,sqm,property_type,deal_type,contact_name,contact_phone,source,listing_url,images,published_at,first_seen_at,promoted_property_id,status")
    .in("id", listingIds).neq("status", "removed").limit(200);
  const byId = new Map<string, any>((listings ?? []).map((r: any) => [r.id, r]));

  const out: ClaimCandidate[] = [];
  const seenListing = new Set<string>();
  for (const link of linkRows) {
    const listing: any = byId.get(link.external_listing_id);
    if (!listing || seenListing.has(listing.id)) continue;
    const verdict = scoreCandidate(toEvidence(anchor, link, listing));
    if (!isCandidate(verdict)) continue;
    seenListing.add(listing.id);
    out.push({
      externalListingId: listing.id, title: listing.title, city: listing.city, neighborhood: listing.neighborhood,
      address: listing.address, price: listing.price, rooms: listing.rooms, sqm: listing.sqm,
      propertyType: listing.property_type, dealType: listing.deal_type, source: listing.source, listingUrl: listing.listing_url,
      contactName: listing.contact_name, publishedAt: listing.published_at, firstSeenAt: listing.first_seen_at,
      imageCount: Array.isArray(listing.images) ? listing.images.length : 0, primaryImage: firstImage(listing.images),
      alreadyPromoted: Boolean(listing.promoted_property_id), verdict,
    });
    if (out.length >= limit) break;
  }
  // HIGH → MEDIUM → LOW ordering.
  const rank = { high: 0, medium: 1, low: 2 } as const;
  out.sort((a, b) => rank[a.verdict.confidence ?? "low"] - rank[b.verdict.confidence ?? "low"]);
  return { anchor, candidates: out };
}
