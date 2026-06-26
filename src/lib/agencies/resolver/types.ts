// ============================================================================
// ZONO — Agency Identity Resolver (Phase 26.1). Types (client-safe).
// Resolves messy raw agency/broker text to an existing agency, scoring every
// candidate. Auto-creation of new agencies is layered on in Phase 26.2.
// ============================================================================
import type { Agency } from "../types";

export type CandidateStatus =
  | "pending" | "accepted" | "rejected" | "auto_created" | "needs_review" | "enriched";

export interface ResolutionInput {
  rawText: string;
  source?: string | null;     // e.g. "external_listing" | "broker" | "manual"
  sourceRef?: string | null;  // safe reference (e.g. listing id)
}

/** A scored match between raw text and a known agency. */
export interface AgencyMatch {
  agencyId: string;
  name: string;
  confidence: number;   // 0..1
  reasons: string[];
}

/** Result of resolving raw text against the org's known agencies + aliases. */
export interface ResolutionResult {
  rawText: string;
  normalizedName: string;
  bestMatch: AgencyMatch | null;
  candidates: AgencyMatch[];
  status: CandidateStatus;     // suggested status for the stored candidate
}

/** Minimal shape the pure ranker needs for each known agency. */
export interface KnownAgency {
  id: string;
  name: string;
  normalizedName: string;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  googlePlaceId?: string | null;
  aliases?: string[];          // normalized aliases
}

export function toKnownAgency(a: Agency, aliases: string[] = []): KnownAgency {
  return {
    id: a.id, name: a.name, normalizedName: a.normalizedName,
    website: a.website, phone: a.phone, email: a.email, googlePlaceId: a.googlePlaceId, aliases,
  };
}

export interface ResolutionCandidateRecord {
  id: string;
  rawText: string;
  normalizedName: string;
  source: string | null;
  sourceRef: string | null;
  status: CandidateStatus;
  confidence: number | null;
  matchedAgencyId: string | null;
  evidence: Record<string, unknown>;
  createdAt: string;
}
