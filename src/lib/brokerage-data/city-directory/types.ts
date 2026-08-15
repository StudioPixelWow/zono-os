// ============================================================================
// 🗂️ Madlan City Directory — ingestion contract (pure, client-safe types).
// ----------------------------------------------------------------------------
// SOURCE CORRECTION (P9.2): the office universe is SEEDED from the Madlan city
// DIRECTORY ("מאגר המתווכים" / מדד המתווכים) — who EXISTS and who Madlan
// ASSOCIATES with whom — NOT inferred from listing phones. These types are the
// normalized shape every sanctioned directory provider must emit, independent
// of the concrete Apify actor. Only fields the source genuinely exposes are
// populated; everything is optional so the adapter never fabricates.
// ============================================================================

/** A brokerage office as the directory source states it. */
export interface DirectoryOffice {
  /** Stable source identifier (e.g. Madlan `re_office_e5Sykr4FNL9`). Drives
   *  idempotent upsert when present. */
  sourceEntityId: string | null;
  displayName: string;
  normalizedName: string;
  profileUrl: string | null;
  city: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  brandNetwork: string | null;
  /** Raw, non-secret source hints preserved for provenance (no page payloads). */
  sourceMetadata: Record<string, unknown> | null;
}

/** A broker/agent as the directory source states it. */
export interface DirectoryAgent {
  sourceEntityId: string | null;
  displayName: string;
  normalizedName: string;
  profileUrl: string | null;
  city: string | null;
  phone: string | null;
  role: string | null;
  /** The office the SOURCE associates this agent with (source id), or null when
   *  the directory exposes no relationship — NEVER inferred here. */
  officeSourceEntityId: string | null;
  sourceMetadata: Record<string, unknown> | null;
}

/** An explicit agent→office relationship AS THE SOURCE STATES IT (not eternal). */
export interface DirectoryRelationship {
  agentSourceEntityId: string | null;
  agentNormalizedName: string;
  officeSourceEntityId: string | null;
  officeNormalizedName: string;
  source: string;
  observedAt: string;
}

export interface DirectoryPagination {
  pagesFetched: number;
  exhausted: boolean;
  totalReported: number | null;
}

/** Why a directory fetch produced nothing — surfaced honestly to the operator. */
export type DirectoryProviderStatus =
  | "success"
  | "partial"
  | "provider_not_configured" // no sanctioned directory actor wired (env unset)
  | "provider_blocked"        // sanctioned access genuinely impossible
  | "error";

/** Normalized output of `provider.fetchCityDirectory(locality)`. */
export interface CityDirectoryFetch {
  source: string;
  locality: string;
  status: DirectoryProviderStatus;
  offices: DirectoryOffice[];
  agents: DirectoryAgent[];
  relationships: DirectoryRelationship[];
  pagination: DirectoryPagination;
  observedAt: string;
  /** Operator-facing reason when status is not "success". Never a secret. */
  reason: string | null;
}

/** The sanctioned directory provider contract (mirrors the listings provider
 *  abstraction: a configured() gate + a bounded, never-throwing fetch). */
export interface CityDirectoryProvider {
  readonly source: string;
  /** True only when a real, sanctioned directory actor is wired. */
  isConfigured(): boolean;
  /** Non-throwing: always resolves to a CityDirectoryFetch (status carries the
   *  failure mode). Bounded — must never hang the caller. */
  fetchCityDirectory(locality: string): Promise<CityDirectoryFetch>;
}

/** Result of persisting a city directory into System-B (idempotent). */
export interface CityDirectorySeedResult {
  locality: string;
  source: string;
  status: DirectoryProviderStatus;
  reason: string | null;
  observedAt: string;
  durationMs: number;
  // Discovery counts (what the SOURCE exposed)
  officesDiscovered: number;
  agentsDiscovered: number;
  relationshipsDiscovered: number;
  agentsWithoutOffice: number;
  // Persistence counts (what changed in System-B)
  officesInserted: number;
  officesUpdated: number;
  agentsInserted: number;
  agentsUpdated: number;
  relationshipsPersisted: number;
  officesDuplicatesMerged: number;
  agentsDuplicatesMerged: number;
  // Source pagination / exhaustion
  pagesFetched: number;
  sourceExhausted: boolean;
  errors: string[];
  notes: string[];
}

/** Combined status payload for the Office Intelligence UI (run + activity). */
export interface CityDirectoryStatus {
  run: import("./observability").DirectoryRunStatus | null;
  activity: DirectoryActivitySnapshot;
}

/** Directory-presence vs ZONO-observed-activity — MANDATORY separation. These
 *  are DIFFERENT metrics: an office can exist in the directory with 0 observed
 *  listings, and that is honest. */
export interface DirectoryActivitySnapshot {
  locality: string;
  computedAt: string;
  // Directory presence (who EXISTS per the source)
  directoryOffices: number;
  directoryAgents: number;
  directoryRelationships: number;
  agentsUnresolved: number;
  // ZONO-observed activity (who is CURRENTLY marketing)
  observedActiveOffices: number;
  observedActiveAgents: number;
  observedListings: number;
  directorySource: string | null;
  directoryLastVerifiedAt: string | null;
}
