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
import { classifyPhone, phoneClassToMatch, phoneClassLabel, type PhoneClass, type PhoneKnowledge } from "./claim-phone-core";
import { countMatchingApprovals } from "./claim-write-core";
import { normalizeHebrewName } from "@/lib/broker/engine";
import { canonicalLocality } from "@/lib/geo/locality";
import { getOrgIntelligenceTerritory } from "@/lib/brokerage-data/territory";
import { normalizePhoneIL } from "@/lib/util/identity";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Phone comparison uses the CENTRAL Israeli normalizer (bare national form), so the
// claim anchor, dedup and directory matching all agree on what "same phone" means.
const digits = (s: string | null | undefined) => normalizePhoneIL(s);
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
/** All normalized forms of a name (plain fold + Hebrew canonical fold), non-empty. */
const nameForms = (s: string | null | undefined): string[] => {
  const out = new Set<string>();
  const a = norm(s); if (a) out.add(a);
  const b = norm(normalizeHebrewName(s)); if (b) out.add(b);
  return [...out];
};
const canonCity = (s: string | null | undefined): string | null => { const c = canonicalLocality(s); return c || null; };

export interface ClaimAnchor {
  orgId: string;
  agentIds: string[];      // stable brokerage_agents ids (verified source identity)
  officeIds: string[];
  normalizedNames: string[];
  phones: string[];
  emails: string[];        // the caller's own email(s) — a unique identity signal
  territoryCanon: string[];// canonical localities of the org's activity area
  ambiguous: boolean;      // the name matched agents across >1 city with no phone/email lock
  ready: boolean;          // an identity anchor exists at all
}

/**
 * Resolve the caller's source identity anchor from brokerage data (org-scoped).
 * The anchor is built from the REAL signed-up user's identity first (name, phone,
 * email, activity cities) — never from arbitrary competitor broker_profiles or an
 * unfiltered slice of the agent directory. brokerage_agents is small; we load the
 * bounded set and match on strong signals (phone/email/exact-name-in-territory).
 */
export async function getClaimAnchor(): Promise<ClaimAnchor | null> {
  const { profile, user } = await getSessionContext();
  if (!profile?.org_id) return null;
  const orgId = profile.org_id;
  const db: any = await createClient();
  const userId: string | null = (profile as any).id ?? user?.id ?? null;

  // ── 1. Identity from the REAL signed-up user (the primary, trusted anchor). ──
  const names = new Set<string>(); const phones = new Set<string>(); const emails = new Set<string>();
  for (const n of nameForms((profile as any).full_name)) names.add(n);
  { const d = digits((profile as any).phone); if (d) phones.add(d); }
  { const e = norm((profile as any).email); if (e.includes("@")) emails.add(e); }

  // Territory: the org's operating localities (canonical He/En) + the user's own cities.
  const territory = new Set<string>();
  try {
    const t = await getOrgIntelligenceTerritory(orgId);
    for (const n of t.canonicalNames) { const c = canonCity(n); if (c) territory.add(c); }
  } catch { /* territory optional */ }
  for (const c of [(profile as any).operating_city, (profile as any).primary_city]) { const cc = canonCity(c); if (cc) territory.add(cc); }

  // ── 2. SELF broker_profile(s) only — tied to this user, or matching the user's
  //       own name/phone/email. NEVER the org's competitor/publisher profiles. ──
  const { data: profs } = await db.from("broker_profiles")
    .select("id,display_name,normalized_name,phone,normalized_phone,email,primary_city,created_by_user_id,metadata")
    .eq("org_id", orgId).limit(500);
  for (const p of (profs ?? [])) {
    const pPhone = digits(p.normalized_phone || p.phone);
    const pEmail = norm(p.email);
    const isSelf = (userId && p.created_by_user_id === userId)
      || (p.metadata && (p.metadata as any).self === true)
      || (pPhone && phones.has(pPhone))
      || (pEmail && emails.has(pEmail))
      || nameForms(p.normalized_name).some((n) => names.has(n))
      || nameForms(p.display_name).some((n) => names.has(n));
    if (!isSelf) continue;
    for (const n of nameForms(p.display_name)) names.add(n);
    for (const n of nameForms(p.normalized_name)) names.add(n);
    if (pPhone) phones.add(pPhone);
    if (pEmail.includes("@")) emails.add(pEmail);
    { const cc = canonCity(p.primary_city); if (cc) territory.add(cc); }
  }

  const empty: ClaimAnchor = { orgId, agentIds: [], officeIds: [], normalizedNames: [...names], phones: [...phones], emails: [...emails], territoryCanon: [...territory], ambiguous: false, ready: false };
  if (!names.size && !phones.size && !emails.size) return empty;

  // ── 3. Stable source agent ids: match the bounded agent directory on STRONG
  //       signals. Phone/email are unique locks; an exact name counts only when it
  //       is also in the org's territory (kills same-name-different-city bleaks). ──
  const { data: agents } = await db.from("brokerage_agents")
    .select("id,office_id,normalized_name,full_name,primary_phone,whatsapp_phone,primary_email,city").limit(5000);
  const phoneHit = (a: any) => [digits(a.primary_phone), digits(a.whatsapp_phone)].some((d) => d && phones.has(d));
  const emailHit = (a: any) => { const e = norm(a.primary_email); return !!e && emails.has(e); };
  const nameHit = (a: any) => { const forms = [...nameForms(a.normalized_name), ...nameForms(a.full_name)]; return forms.some((f) => names.has(f)); };
  const cityHit = (a: any) => { const c = canonCity(a.city); return !!c && territory.has(c); };

  const strong: any[] = []; const nameOnly: any[] = [];
  for (const a of (agents ?? [])) {
    if (phoneHit(a) || emailHit(a)) strong.push(a);
    else if (nameHit(a) && (cityHit(a) || territory.size === 0)) nameOnly.push(a);
  }
  // Ambiguity: name-only matches spanning more than one distinct city, with no
  // phone/email lock — the identity is not certain. Prefer in-territory rows.
  const nameOnlyCities = new Set(nameOnly.map((a) => canonCity(a.city)).filter(Boolean));
  const ambiguous = strong.length === 0 && nameOnlyCities.size > 1;
  const chosen = strong.length ? strong
    : ambiguous ? nameOnly.filter((a) => cityHit(a))
    : nameOnly;

  const agentIds: string[] = []; const officeIds = new Set<string>();
  for (const a of chosen) {
    agentIds.push(a.id); if (a.office_id) officeIds.add(a.office_id);
    const ad = digits(a.primary_phone); if (ad) phones.add(ad);
  }
  return {
    orgId, agentIds, officeIds: [...officeIds],
    normalizedNames: [...names], phones: [...phones], emails: [...emails],
    territoryCanon: [...territory], ambiguous,
    ready: agentIds.length > 0 || names.size > 0 || phones.size > 0,
  };
}

export interface ClaimCandidate {
  externalListingId: string;
  title: string | null; city: string | null; neighborhood: string | null; address: string | null;
  price: number | null; rooms: string | null; sqm: number | null; propertyType: string | null; dealType: string | null;
  imageCount: number; primaryImage: string | null; source: string | null; listingUrl: string | null;
  contactName: string | null; publishedAt: string | null; firstSeenAt: string | null;
  alreadyPromoted: boolean;
  verdict: EvidenceVerdict;
  phoneClass: PhoneClass;
  phoneNote: string;
}

/** Map a listing + its link row to the pure evidence input. Phone handling uses
 *  the §13 classifier: a DIFFERENT phone is neutral (UNKNOWN/masked), never an
 *  automatic contradiction — only a phone proven to belong to another broker is. */
function toEvidence(anchor: ClaimAnchor, link: any, listing: any, know: PhoneKnowledge, priorConfirmed = 0): { ev: CandidateEvidence; phoneClass: PhoneClass } {
  const linkOrg = link?.organization_id ?? listing?.org_id ?? null;
  const sameOrg = linkOrg === anchor.orgId;
  const stableAgentIdMatch = Boolean(link?.agent_id && anchor.agentIds.includes(link.agent_id)) &&
    Array.isArray(link?.match_reasons) && link.match_reasons.some((r: string) => /טלפון זהה|derived_from_broker|id:/i.test(r));
  const listingName = norm(listing?.contact_name || link?.matched_name);
  const anchorHasName = anchor.normalizedNames.some((n) => n && listingName && (listingName === n));
  const anchorFirstOnly = !anchorHasName && anchor.normalizedNames.some((n) => n && listingName && n.split(" ")[0] && listingName.split(" ").includes(n.split(" ")[0]));
  const nameMatch: CandidateEvidence["nameMatch"] = anchorHasName ? "exact" : anchorFirstOnly ? "first_only" : (link?.matched_name ? "similar" : "none");
  const phoneClass = classifyPhone(listing?.contact_phone || link?.matched_phone, know);
  const phoneMatch = phoneClassToMatch(phoneClass);
  const officeMatch = Boolean(link?.office_id && anchor.officeIds.includes(link.office_id));
  // Real territory match: the listing's city must canonically be one of the org's
  // activity localities (He/En folded, so "Even Yehuda" == "אבן יהודה"). No more
  // hardcoded literal and no "any city counts" — an out-of-area listing is NOT
  // presented as "in your activity area".
  const listingCanon = canonCity(listing?.city);
  const cityMatch = Boolean(listingCanon) && anchor.territoryCanon.includes(listingCanon as string);
  return { ev: { sameOrg, stableAgentIdMatch, nameMatch, phoneMatch, officeMatch, cityMatch, priorConfirmedSameIdentity: priorConfirmed }, phoneClass };
}

/** Identity learning (P10B §19): count the caller's PRIOR APPROVED claims tied to
 *  the same source identity (anchor agent ids). The evidence engine promotes an
 *  established identity (≥3 prior confirmations) toward HIGH — so approved claims
 *  actually strengthen future candidates. Read-only; org-scoped. */
async function getPriorConfirmedCount(db: any, anchor: ClaimAnchor): Promise<number> {
  if (!anchor.agentIds.length) return 0;
  try {
    // Pull approved AND rejected here so the PURE predicate does the filtering —
    // guarantees rejected/name-only reviews never strengthen the anchor.
    const { data } = await db.from("broker_match_reviews")
      .select("evidence,status").eq("org_id", anchor.orgId).limit(500);
    return countMatchingApprovals((data ?? []) as any[], anchor.agentIds);
  } catch { return 0; }
}

/** Build phone knowledge for the anchor: the caller's own numbers are personal;
 *  verified phones of OTHER agents in the org are the only "other broker" set. */
async function buildPhoneKnowledge(db: any, anchor: ClaimAnchor): Promise<PhoneKnowledge> {
  const otherBrokerPhones: string[] = [];
  try {
    const { data: others } = await db.from("brokerage_agents").select("id,primary_phone").limit(200);
    for (const a of (others ?? [])) {
      if (anchor.agentIds.includes(a.id)) continue;
      const d = digits(a.primary_phone);
      if (d && !anchor.phones.includes(d)) otherBrokerPhones.push(d);
    }
  } catch { /* directory optional — absence just means no negative phone signal */ }
  return { personalPhones: anchor.phones, officePhones: [], sourcePhones: [], otherBrokerPhones, relayHint: null };
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

  const know = await buildPhoneKnowledge(db, anchor);
  const priorConfirmed = await getPriorConfirmedCount(db, anchor);

  // Source A — stable links by the anchor's verified agent ids (strongest signal).
  const linkByListing = new Map<string, any>();
  if (anchor.agentIds.length) {
    const { data: links } = await db.from("brokerage_external_listing_links")
      .select("external_listing_id,organization_id,agent_id,office_id,matched_name,matched_phone,match_reasons,confidence_score")
      .in("agent_id", anchor.agentIds).eq("organization_id", anchor.orgId).limit(500);
    for (const l of (links ?? [])) if (l.external_listing_id) linkByListing.set(l.external_listing_id, l);
  }

  // Source B — the org's OWN scraped listings whose detected/advertised identity
  // matches the anchor. This BRIDGES the two matcher systems: candidates surface
  // from broker detection (detected_broker_name / contact_name / contact_phone)
  // even when no explicit brokerage_external_listing_links row exists yet. Bounded
  // to the org's own inventory (RLS + org filter), matched in memory on strong forms.
  const nameSet = new Set(anchor.normalizedNames); const phoneSet = new Set(anchor.phones);
  const identityListingIds = new Set<string>();
  if (nameSet.size || phoneSet.size) {
    const { data: owned } = await db.from("external_listings")
      .select("id,contact_name,detected_broker_name,contact_phone")
      .eq("org_id", anchor.orgId).eq("has_agent", true).neq("status", "removed").limit(3000);
    for (const r of (owned ?? [])) {
      const nHit = [...nameForms(r.contact_name), ...nameForms(r.detected_broker_name)].some((f) => nameSet.has(f));
      const pd = digits(r.contact_phone);
      const pHit = !!pd && phoneSet.has(pd);
      if (nHit || pHit) identityListingIds.add(r.id);
    }
  }

  const allIds = [...new Set([...linkByListing.keys(), ...identityListingIds])];
  if (!allIds.length) return { anchor, candidates: [] };

  const { data: listings } = await db.from("external_listings")
    .select("id,org_id,title,city,neighborhood,address,price,rooms,sqm,property_type,deal_type,contact_name,contact_phone,source,listing_url,images,published_at,first_seen_at,promoted_property_id,status")
    .in("id", allIds).neq("status", "removed").limit(500);

  const out: ClaimCandidate[] = [];
  for (const listing of ((listings ?? []) as any[])) {
    const link = linkByListing.get(listing.id) ?? {};
    const { ev, phoneClass } = toEvidence(anchor, link, listing, know, priorConfirmed);
    const verdict = scoreCandidate(ev);
    if (!isCandidate(verdict)) continue;
    out.push({
      externalListingId: listing.id, title: listing.title, city: listing.city, neighborhood: listing.neighborhood,
      address: listing.address, price: listing.price, rooms: listing.rooms, sqm: listing.sqm,
      propertyType: listing.property_type, dealType: listing.deal_type, source: listing.source, listingUrl: listing.listing_url,
      contactName: listing.contact_name, publishedAt: listing.published_at, firstSeenAt: listing.first_seen_at,
      imageCount: Array.isArray(listing.images) ? listing.images.length : 0, primaryImage: firstImage(listing.images),
      alreadyPromoted: Boolean(listing.promoted_property_id), verdict, phoneClass, phoneNote: phoneClassLabel(phoneClass),
    });
  }
  // HIGH → MEDIUM → LOW ordering, then bound to the requested limit.
  const rank = { high: 0, medium: 1, low: 2 } as const;
  out.sort((a, b) => rank[a.verdict.confidence ?? "low"] - rank[b.verdict.confidence ?? "low"]);
  out.splice(limit);

  // P10C §7 — internal notification (batched, deduped to ≤1/24h, best-effort,
  // NON-blocking). Detection is on-read; this surfaces it in the notification
  // center + header badge without any external delivery or hourly spam.
  try {
    const { user } = await getSessionContext();
    if (user?.id && out.length > 0) {
      const high = out.filter((c) => c.verdict.confidence === "high").length;
      const { notifyClaimCandidates } = await import("./claim-notifications");
      await notifyClaimCandidates(anchor.orgId, user.id, { high, total: out.length });
    }
  } catch { /* never block the read on a notification */ }

  return { anchor, candidates: out };
}

/** Re-score ONE listing for the caller's anchor (server-authoritative recheck at
 *  claim time). Returns null if the caller has no anchor or the listing isn't a
 *  candidate for them (cross-org / unrelated) — the write path must then refuse. */
export async function getClaimCandidateById(listingId: string): Promise<{ anchor: ClaimAnchor; candidate: ClaimCandidate } | null> {
  const anchor = await getClaimAnchor();
  if (!anchor || !anchor.ready) return null;
  const db: any = await createClient();
  const { data: listing } = await db.from("external_listings")
    .select("id,org_id,title,city,neighborhood,address,price,rooms,sqm,property_type,deal_type,contact_name,contact_phone,source,source_id,listing_url,images,published_at,first_seen_at,promoted_property_id,primary_property_id,duplicate_group_id,status")
    .eq("id", listingId).maybeSingle();
  if (!listing) return null;
  const { data: link } = await db.from("brokerage_external_listing_links")
    .select("external_listing_id,organization_id,agent_id,office_id,matched_name,matched_phone,match_reasons,confidence_score")
    .eq("external_listing_id", listingId).eq("organization_id", anchor.orgId).maybeSingle();
  const know = await buildPhoneKnowledge(db, anchor);
  const priorConfirmed = await getPriorConfirmedCount(db, anchor);
  const { ev, phoneClass } = toEvidence(anchor, link ?? {}, listing, know, priorConfirmed);
  const verdict = scoreCandidate(ev);
  if (!isCandidate(verdict)) return null; // cross-org / not this caller's listing
  const candidate: ClaimCandidate = {
    externalListingId: listing.id, title: listing.title, city: listing.city, neighborhood: listing.neighborhood,
    address: listing.address, price: listing.price, rooms: listing.rooms, sqm: listing.sqm,
    propertyType: listing.property_type, dealType: listing.deal_type, source: listing.source, listingUrl: listing.listing_url,
    contactName: listing.contact_name, publishedAt: listing.published_at, firstSeenAt: listing.first_seen_at,
    imageCount: Array.isArray(listing.images) ? listing.images.length : 0, primaryImage: firstImage(listing.images),
    alreadyPromoted: Boolean(listing.promoted_property_id), verdict, phoneClass, phoneNote: phoneClassLabel(phoneClass),
  };
  return { anchor, candidate };
}
