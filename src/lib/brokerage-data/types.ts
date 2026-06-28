// ============================================================================
// ZONO Core Data — Brokerage Data types (client-safe DTOs).
// Mirrors supabase/migrations/20260803120000_brokerage_data.sql. National/shared
// data with an owner-vs-city-scoped access model. No org_id on the entity rows
// (they are national); access is enforced in RLS via allowed cities.
// ============================================================================

export type OfficeType = "independent" | "franchise" | "branch" | "unknown";
export type OfficeStatus =
  | "active" | "unverified" | "candidate" | "inactive" | "not_found_recently" | "conflict";
export type AgentStatus = "verified" | "unverified" | "candidate" | "conflict" | "inactive";
export type EntityType = "office" | "agent";
export type ContactType =
  | "phone" | "email" | "whatsapp" | "website" | "facebook" | "instagram" | "linkedin";
export type SourceType =
  | "google" | "yad2" | "madlan" | "website" | "facebook" | "easy" | "b144" | "manual" | "other";
export type RefreshRunType = "full_country" | "city" | "region" | "source" | "office" | "agent";
export type RefreshStatus = "pending" | "running" | "completed" | "failed" | "partial";
export type ChangeType = "created" | "updated" | "enriched" | "conflict" | "merged" | "marked_inactive";
export type MatchType =
  | "listing_to_agent" | "listing_to_office" | "agent_to_office" | "duplicate_agent" | "duplicate_office";
export type MatchStatus = "auto_approved" | "pending_review" | "rejected" | "merged";
export type ConflictStatus = "open" | "resolved" | "ignored";
export type LinkStatus = "auto_linked" | "pending_review" | "confirmed" | "rejected" | "candidate";

// Organization access model (added to public.organizations).
export type OrgRoleType = "zono_owner" | "brokerage_office" | "agent";

export interface BrokerageOffice {
  id: string;
  name: string;
  normalizedName: string | null;
  ownerName: string | null;
  managerName: string | null;
  registrationNumber: string | null;
  brandNetwork: string | null;
  officeType: OfficeType;
  status: OfficeStatus;
  city: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  websiteUrl: string | null;
  googlePlaceId: string | null;
  googleRating: number | null;
  googleReviewsCount: number | null;
  confidenceScore: number;
  dataQualityScore: number;
  notes: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastVerifiedAt: string | null;
}

export interface BrokerageAgent {
  id: string;
  officeId: string | null;
  fullName: string;
  normalizedName: string | null;
  licenseNumber: string | null;
  roleTitle: string | null;
  status: AgentStatus;
  city: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  whatsappPhone: string | null;
  specialties: string[];
  confidenceScore: number;
  dataQualityScore: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastVerifiedAt: string | null;
}

export interface BrokerageContactPoint {
  id: string;
  entityType: EntityType;
  entityId: string;
  contactType: ContactType;
  value: string;
  normalizedValue: string | null;
  isPrimary: boolean;
  status: string;
  confidenceScore: number;
}

export interface BrokerageOfficeLocation {
  id: string;
  officeId: string;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  houseNumber: string | null;
  fullAddress: string | null;
  lat: number | null;
  lng: number | null;
  confidenceScore: number;
  status: string;
}

export interface BrokerageRefreshRun {
  id: string;
  runType: RefreshRunType;
  status: RefreshStatus;
  parameters: Record<string, unknown>;
  startedAt: string | null;
  finishedAt: string | null;
  officesFound: number;
  agentsFound: number;
  newOffices: number;
  newAgents: number;
  updatedRecords: number;
  conflictsCreated: number;
  errorsCount: number;
  createdAt: string;
}

export interface BrokerageDataConflict {
  id: string;
  conflictType: string;
  entityAType: string | null;
  entityAId: string | null;
  entityBType: string | null;
  entityBId: string | null;
  fieldName: string | null;
  valueA: string | null;
  valueB: string | null;
  confidenceA: number | null;
  confidenceB: number | null;
  aiRecommendation: string | null;
  status: ConflictStatus;
  createdAt: string;
}

export interface BrokerageIdentityMatch {
  id: string;
  matchType: MatchType;
  sourceEntityType: string;
  sourceEntityId: string;
  targetEntityType: string;
  targetEntityId: string | null;
  confidenceScore: number;
  matchReasons: string[];
  status: MatchStatus;
  createdAt: string;
}

export interface BrokerageDataSource {
  id: string;
  name: string;
  sourceType: SourceType;
  baseUrl: string | null;
  isActive: boolean;
  reliabilityScore: number;
  lastRunAt: string | null;
}

export interface BrokerageExternalListingLink {
  id: string;
  externalListingId: string;
  agentId: string | null;
  officeId: string | null;
  city: string | null;
  matchedPhone: string | null;
  matchedName: string | null;
  matchedSource: string | null;
  confidenceScore: number;
  matchReasons: string[];
  status: LinkStatus;
  createdAt: string;
}

// ── Access model ────────────────────────────────────────────────────────────
export interface BrokerageAccess {
  isOwner: boolean;          // zono_owner — full national access
  allowedCities: string[];   // brokerage_office/agent — city-scoped
  roleType: OrgRoleType;
}

// ── Command-center DTO (composed for the UI) ────────────────────────────────
export interface BrokerageDataStats {
  offices: number;
  agents: number;
  verifiedOffices: number;
  verifiedAgents: number;
  candidates: number;        // offices+agents in candidate status
  openConflicts: number;
  pendingMatches: number;
  linkedListings: number;
}
