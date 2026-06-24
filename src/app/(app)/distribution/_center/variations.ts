// ============================================================================
// ZONO — Distribution Center shared types for the campaign builder.
// The old in-memory variation generator was REMOVED in Phase 10.1: AI variations
// are now generated server-side and PERSISTED to distribution_variations, and the
// UI reads them back from Supabase (the database is the single source of truth).
// This file now only holds the lightweight types the builder still needs.
// ============================================================================

export interface PropertyLite {
  id: string;
  title: string;
  city: string | null;
  neighborhood: string | null;
  type: string | null;
  price: number | null;
  rooms: number | null;
  sqm: number | null;
  imageUrl: string | null;
}

export type AudienceKey = "families" | "investors" | "young" | "luxury" | "commercial" | "sellers";
export const AUDIENCE_LABEL: Record<AudienceKey, string> = {
  families: "משפחות",
  investors: "משקיעים",
  young: "זוגות צעירים",
  luxury: "קהל יוקרה",
  commercial: "מסחרי / עסקי",
  sellers: "גיוס מוכרים",
};
