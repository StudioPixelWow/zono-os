// ============================================================================
// 📦 Office Inventory — types (client-safe, pure). Phase 26.5.
// Rolls up every listing that belongs to an office — directly OR through its
// brokers — with per-listing attribution + conflict flags. No fabrication.
// ============================================================================
import type { AttributionKind } from "./attribution";

export const OFFICE_INVENTORY_VERSION = "26.5";

export interface InventoryListing {
  listingId: string; title: string | null;
  city: string | null; neighborhood: string | null; propertyType: string | null;
  price: number | null; pricePerSqm: number | null;
  source: string | null; listingUrl: string | null; active: boolean;
  brokerId: string | null; brokerName: string | null;
  attribution: { kind: AttributionKind; reason: string; derived: boolean; conflict: boolean; conflictNote: string | null };
}

export interface CountBy { key: string; count: number }
export interface BrokerInventory { brokerId: string; brokerName: string; active: number; total: number }

export interface OfficeInventory {
  officeId: string; officeName: string; brand: string | null; branch: string | null; city: string | null;
  totals: {
    active: number; inactive: number; total: number;
    direct: number; derivedThroughBrokers: number; conflicts: number;
    brokers: number; activeBrokers: number;
  };
  byCity: CountBy[]; byNeighborhood: CountBy[]; byType: CountBy[]; byPriceBand: CountBy[]; byBroker: BrokerInventory[];
  listings: InventoryListing[];          // capped display set
  conflicts: { listingId: string; note: string }[];
  lastActivityAt: string | null;
  empty: boolean;
  version: string;
}

export interface BackfillResult {
  brokersWithOffice: number;
  linksInspected: number;
  linksUpdated: number;                  // derived office_id written to null links
  conflicts: number;                     // link.office_id differs from broker.office_id
  skipped: number;
  conflictSamples: { listingId: string; brokerOfficeId: string; linkOfficeId: string }[];
  notes: string[];
  version: string;
}
