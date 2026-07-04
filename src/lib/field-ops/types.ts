// ============================================================================
// 📱 ZONO Mobile Field Operations™ — types (client-safe). 41.0.
// The field operating system. Property Visit Mode + Meeting Mode compose the
// EXISTING property/seller/document reads into a mobile, one-hand view. No new
// engine, no schema. All creation routes to existing approval-gated actions.
// ============================================================================

export const FIELD_OPS_VERSION = "41.0";

export interface VisitChecklistItem { key: string; label: string; icon: string; group: "condition" | "surroundings" | "docs" }

// ── Lean inputs (mapped from the existing reads) ────────────────────────────
export interface PropertyLean {
  id: string; title: string; city: string | null; neighborhood: string | null; buildingNumber: string | null;
  price: number | null; rooms: number | null; size: number | null; type: string | null; status: string | null;
  image: string | null; aiDescription: string | null; zonoScore: number | null; lat: number | null; lng: number | null;
}
export interface SellerLean { name: string; phone: string | null }
export interface DocLean { id: string; title: string; url: string | null }

// ── Assembled Visit Mode ────────────────────────────────────────────────────
export interface VisitFacts {
  title: string; location: string; price: number | null; rooms: number | null; size: number | null;
  type: string | null; status: string | null; image: string | null; zonoScore: number | null;
}
export interface VisitContact { name: string; phone: string | null; whatsapp: string | null }

export interface VisitMode {
  version: string;
  propertyId: string;
  facts: VisitFacts;
  aiSummary: string | null;
  directionsUrl: string | null;
  contact: VisitContact | null;
  checklist: VisitChecklistItem[];
  documents: { id: string; title: string; url: string | null }[];
  href: string;              // full property page
  notes: string[];
}
