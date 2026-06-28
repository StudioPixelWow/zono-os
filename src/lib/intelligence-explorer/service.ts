// ============================================================================
// ZONO — Intelligence Explorer™ service (server-only). Presentation only.
// ----------------------------------------------------------------------------
// Composes EXISTING repositories/DTOs into one client-safe Explorer payload in a
// SINGLE load — the broker board, the agency intelligence cards, the opportunity
// feed and the external listings. It does not query anything those repositories
// don't already query, and it computes no new intelligence (neighborhood cards
// are plain counts of existing listings). RLS is preserved by the underlying
// reads. The client does all search / filter / sort in-memory over this payload.
// ============================================================================
import "server-only";
import { getBrokerBoard } from "@/lib/broker/service";
import { searchAgencyIntelligence, getAgencyOpportunityFeed } from "@/lib/agencies/api/agencyIntelligenceApi";
import { currentSessionOrgId } from "@/lib/agencies/api/agencyIntelligenceApiPermissions";
import { externalListingRepository } from "@/lib/external-listings/repository";
import type {
  IntelligenceExplorerDTO, ExplorerBroker, ExplorerOffice, ExplorerNeighborhood, ExplorerListing, ExplorerOpportunity,
} from "./types";

export async function getIntelligenceExplorer(): Promise<IntelligenceExplorerDTO> {
  const orgId = await currentSessionOrgId();
  const [board, offices, oppFeed, listings] = await Promise.all([
    getBrokerBoard().catch((e) => { console.error("[explorer] brokers failed:", e); return null; }),
    orgId ? searchAgencyIntelligence(orgId, { limit: 150, sortBy: "overall" }).catch((e) => { console.error("[explorer] offices failed:", e); return []; }) : Promise.resolve([]),
    orgId ? getAgencyOpportunityFeed(orgId, { limit: 60 }).catch((e) => { console.error("[explorer] opp feed failed:", e); return null; }) : Promise.resolve(null),
    externalListingRepository.listForOrg(2000).catch((e) => { console.error("[explorer] listings failed:", e); return []; }),
  ]);

  const brokers: ExplorerBroker[] = (board?.profiles ?? []).map((p) => ({
    id: p.id, name: p.display_name, office: p.agency_name, city: p.primary_city,
    confidence: p.confidence_score, listingsCount: p.listings_count, verification: p.verification_status,
  }));

  const officeCards: ExplorerOffice[] = offices.map((o) => ({
    id: o.agencyId, name: o.displayName ?? o.name, city: o.city,
    overall: o.overall, threat: o.threat, momentum: o.momentum, growth: o.growth, confidence: o.dataConfidence,
  }));

  const listingRows: ExplorerListing[] = listings.map((l) => ({
    id: l.id, title: l.title, city: l.city, neighborhood: l.neighborhood, price: l.price == null ? null : Number(l.price),
    dealType: l.deal_type, hasAgent: l.has_agent, opportunityScore: l.opportunity_score, status: l.status, firstSeenAt: l.first_seen_at,
  }));

  // Neighborhood cards — plain counts over the already-fetched listings (no recompute).
  const nbMap = new Map<string, ExplorerNeighborhood>();
  for (const l of listings) {
    if (!l.neighborhood) continue;
    const city = l.city ?? "";
    const key = `${city}|${l.neighborhood}`;
    const e = nbMap.get(key) ?? { id: key, city, neighborhood: l.neighborhood, listings: 0, privateListings: 0 };
    e.listings++;
    if (l.has_agent === false) e.privateListings++;
    nbMap.set(key, e);
  }
  const neighborhoods = [...nbMap.values()].sort((a, b) => b.listings - a.listings);

  const opportunitySignals: ExplorerOpportunity[] = (oppFeed?.opportunities ?? []).map((o) => ({
    label: o.label, city: o.city, neighborhood: o.neighborhood, reason: o.reason,
  }));

  return { brokers, offices: officeCards, neighborhoods, listings: listingRows, opportunitySignals };
}
