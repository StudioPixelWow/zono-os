// ============================================================================
// 🏷️ Brokerage Brand & Branch Identity Engine™ — types (client-safe, pure). 26.4.19.
// ----------------------------------------------------------------------------
// A READ-ONLY hierarchy: Brand → Office/Branch → Broker. Branches of the same
// brand (RE/MAX Smart vs RE/MAX Vision) are INDEPENDENT offices and are NEVER
// merged. Two offices are only "possible duplicates" on STRONG identity evidence
// (same phone / website / address / coordinates) — never on brand or name alone,
// and never merged automatically. No discovery/AI/verification-rule changes.
// ============================================================================
export const BRAND_IDENTITY_VERSION = "26.4.19";

export interface OfficeIdentity {
  phone: string | null; domain: string | null; address: string | null;
  coords: string | null;   // "lat,lng" rounded, or null
}

export interface BrandResolution {
  brand: string | null;        // e.g. "RE/MAX", null for independents
  normalizedBrand: string;     // franchise key, or "independent"
  branch: string | null;       // e.g. "Smart", or the city for city-named branches
  displayName: string;         // officeDisplayName
}

export interface BrokerRef { id: string; name: string }

export interface BranchOffice {
  officeId: string;
  displayName: string;
  brand: string | null; branch: string | null;
  city: string | null;
  phone: string | null; website: string | null; address: string | null;
  confidence: number; verificationState: string;
  brokerCount: number; brokers: BrokerRef[];
  identity: OfficeIdentity;
  explain: { whyBrand: string; whySeparate: string; whyNotMerged: string };
}

export interface BrandNode {
  brand: string; normalizedBrand: string;
  branchCount: number; brokerCount: number;
  branches: BranchOffice[];
}

export interface PossibleDuplicate {
  officeAId: string; officeAName: string; officeBId: string; officeBName: string;
  sharedSignals: string[];       // e.g. ["same phone", "same website"]
  recommendation: string;        // always "review only — never auto-merged"
}

export interface BrandHierarchy {
  city: string | null; cityNormalized: string | null;
  brands: BrandNode[];
  independentOffices: BranchOffice[];
  possibleDuplicates: PossibleDuplicate[];
  totals: { brands: number; branches: number; independents: number; brokers: number; possibleDuplicates: number };
  notes: string[];
  version: string;
}
