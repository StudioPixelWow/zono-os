// ============================================================================
// ZONO — Intelligence Explorer™ DTOs (client-safe). Presentation only.
// A thin, client-safe projection of EXISTING intelligence (broker board, agency
// intelligence cards, opportunity feed, external listings). No new fields are
// computed — every value is read straight from an existing repository/DTO.
// ============================================================================

export interface ExplorerBroker {
  id: string;
  name: string;
  office: string | null;
  city: string | null;
  confidence: number;        // broker_profiles.confidence_score
  listingsCount: number;     // broker_profiles.listings_count
  verification: string;      // verification_status
}

export interface ExplorerOffice {
  id: string;                // agencyId
  name: string;
  city: string | null;
  overall: number | null;    // performance index
  threat: number | null;
  momentum: number | null;
  growth: number | null;
  confidence: number | null; // dataConfidence
}

export interface ExplorerNeighborhood {
  id: string;                // "city|neighborhood"
  city: string;
  neighborhood: string;
  listings: number;          // count from existing external listings
  privateListings: number;   // has_agent === false
}

export interface ExplorerListing {
  id: string;
  title: string | null;
  city: string | null;
  neighborhood: string | null;
  price: number | null;
  dealType: string | null;
  hasAgent: boolean | null;
  opportunityScore: number;
  status: string;
  firstSeenAt: string | null;
}

export interface ExplorerOpportunity {
  label: string;
  city: string | null;
  neighborhood: string | null;
  reason: string;
}

export interface IntelligenceExplorerDTO {
  brokers: ExplorerBroker[];
  offices: ExplorerOffice[];
  neighborhoods: ExplorerNeighborhood[];
  listings: ExplorerListing[];
  opportunitySignals: ExplorerOpportunity[];
}
