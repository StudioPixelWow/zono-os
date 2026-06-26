// ============================================================================
// ZONO — Agency row→model mappers (Phase 26.0, server-side helpers).
// Pure transforms from DB rows to domain models. No IO.
// ============================================================================
import type {
  Agency, AgencyAgent, AgencyBranch, AgencyIdentityMatch, AgencyProfile,
  AgencyScore, AgencySignal, AgencyTimelineEvent,
} from "./types";

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function toAgency(r: Obj): Agency {
  return {
    id: r.id as string, organizationId: r.organization_id as string,
    name: r.name as string, normalizedName: r.normalized_name as string,
    legalName: (r.legal_name as string) ?? null, slug: r.slug as string,
    logoUrl: (r.logo_url as string) ?? null, website: (r.website as string) ?? null,
    description: (r.description as string) ?? null, foundedYear: (r.founded_year as number) ?? null,
    headquartersCity: (r.headquarters_city as string) ?? null, headquartersAddress: (r.headquarters_address as string) ?? null,
    googlePlaceId: (r.google_place_id as string) ?? null, phone: (r.phone as string) ?? null,
    email: (r.email as string) ?? null, facebookUrl: (r.facebook_url as string) ?? null,
    instagramUrl: (r.instagram_url as string) ?? null, linkedinUrl: (r.linkedin_url as string) ?? null,
    youtubeUrl: (r.youtube_url as string) ?? null, active: Boolean(r.active),
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

export function toBranch(r: Obj): AgencyBranch {
  return {
    id: r.id as string, agencyId: r.agency_id as string, city: (r.city as string) ?? null,
    neighborhood: (r.neighborhood as string) ?? null, address: (r.address as string) ?? null,
    phone: (r.phone as string) ?? null, email: (r.email as string) ?? null,
    latitude: (r.latitude as number) ?? null, longitude: (r.longitude as number) ?? null,
    createdAt: r.created_at as string,
  };
}

export function toAgent(r: Obj): AgencyAgent {
  return {
    id: r.id as string, agencyId: r.agency_id as string, agentId: (r.agent_id as string) ?? null,
    role: (r.role as string) ?? null, confidenceScore: (r.confidence_score as number) ?? null,
    detectionMethod: (r.detection_method as string) ?? null,
    firstDetectedAt: r.first_detected_at as string, lastVerifiedAt: (r.last_verified_at as string) ?? null,
  };
}

export function toIdentityMatch(r: Obj): AgencyIdentityMatch {
  return {
    id: r.id as string, agencyId: r.agency_id as string, source: r.source as string,
    sourceUrl: (r.source_url as string) ?? null, matchedName: (r.matched_name as string) ?? null,
    confidence: (r.confidence as number) ?? null, evidence: asObj(r.evidence), createdAt: r.created_at as string,
  };
}

export function toProfile(r: Obj): AgencyProfile {
  return {
    id: r.id as string, agencyId: r.agency_id as string,
    specialties: (r.specialties as string[]) ?? [], serviceAreas: (r.service_areas as string[]) ?? [],
    languages: (r.languages as string[]) ?? [], luxury: Boolean(r.luxury), commercial: Boolean(r.commercial),
    investments: Boolean(r.investments), rentals: Boolean(r.rentals), projects: Boolean(r.projects),
    notes: (r.notes as string) ?? null, createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

export function toScore(r: Obj): AgencyScore {
  const n = (k: string) => (r[k] as number) ?? null;
  return {
    id: r.id as string, agencyId: r.agency_id as string, marketStrength: n("market_strength"),
    growth: n("growth"), digital: n("digital"), luxury: n("luxury"), inventory: n("inventory"),
    coverage: n("coverage"), projects: n("projects"), reputation: n("reputation"), momentum: n("momentum"),
    overall: n("overall"), updatedAt: r.updated_at as string,
  };
}

export function toSignal(r: Obj): AgencySignal {
  return {
    id: r.id as string, agencyId: r.agency_id as string, signalType: r.signal_type as string,
    severity: (r.severity as string) ?? null, title: r.title as string,
    description: (r.description as string) ?? null, metadata: asObj(r.metadata), createdAt: r.created_at as string,
  };
}

export function toTimelineEvent(r: Obj): AgencyTimelineEvent {
  return {
    id: r.id as string, agencyId: r.agency_id as string, eventType: r.event_type as string,
    title: r.title as string, description: (r.description as string) ?? null,
    metadata: asObj(r.metadata), eventDate: r.event_date as string, createdAt: r.created_at as string,
  };
}
