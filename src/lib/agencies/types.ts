// ============================================================================
// ZONO — Agency Intelligence Foundation™ (Phase 26.0). Domain models.
// Client-safe TypeScript models for the agency entity and its satellites.
// Infrastructure only — no AI, no scraping.
// ============================================================================

export interface Agency {
  id: string;
  organizationId: string;
  name: string;
  normalizedName: string;
  legalName: string | null;
  slug: string;
  logoUrl: string | null;
  website: string | null;
  description: string | null;
  foundedYear: number | null;
  headquartersCity: string | null;
  headquartersAddress: string | null;
  googlePlaceId: string | null;
  phone: string | null;
  email: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  linkedinUrl: string | null;
  youtubeUrl: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyBranch {
  id: string;
  agencyId: string;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

export interface AgencyAgent {
  id: string;
  agencyId: string;
  agentId: string | null;
  role: string | null;
  confidenceScore: number | null;
  detectionMethod: string | null;
  firstDetectedAt: string;
  lastVerifiedAt: string | null;
}

export interface AgencyIdentityMatch {
  id: string;
  agencyId: string;
  source: string;
  sourceUrl: string | null;
  matchedName: string | null;
  confidence: number | null;
  evidence: Record<string, unknown>;
  createdAt: string;
}

export interface AgencyProfile {
  id: string;
  agencyId: string;
  specialties: string[];
  serviceAreas: string[];
  languages: string[];
  luxury: boolean;
  commercial: boolean;
  investments: boolean;
  rentals: boolean;
  projects: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyScore {
  id: string;
  agencyId: string;
  marketStrength: number | null;
  growth: number | null;
  digital: number | null;
  luxury: number | null;
  inventory: number | null;
  coverage: number | null;
  projects: number | null;
  reputation: number | null;
  momentum: number | null;
  overall: number | null;
  updatedAt: string;
}

export type AgencySignalSeverity = "info" | "warning" | "critical";

export interface AgencySignal {
  id: string;
  agencyId: string;
  signalType: string;
  severity: AgencySignalSeverity | string | null;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AgencyTimelineEvent {
  id: string;
  agencyId: string;
  eventType: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  eventDate: string;
  createdAt: string;
}

/** Input for creating an agency (org + audit fields resolved server-side). */
export interface CreateAgencyInput {
  name: string;
  legalName?: string | null;
  website?: string | null;
  description?: string | null;
  foundedYear?: number | null;
  headquartersCity?: string | null;
  headquartersAddress?: string | null;
  googlePlaceId?: string | null;
  phone?: string | null;
  email?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  linkedinUrl?: string | null;
  youtubeUrl?: string | null;
  logoUrl?: string | null;
  active?: boolean;
}

export type UpdateAgencyInput = Partial<CreateAgencyInput>;
