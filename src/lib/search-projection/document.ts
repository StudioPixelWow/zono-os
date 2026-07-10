// ============================================================================
// 📄 ZONO OS 2.0 — Stage 4 · Search projection · document builder (PURE).
// Turns an entity row (fetched by the indexer as select *) into a canonical
// search_documents row — using ONLY broadly-safe fields (title, city, status,
// public identifiers, normalized phone). NEVER pulls private notes, raw legal
// text, tokens, secrets, or sensitive contact detail. Reads fields defensively
// (field-name fallbacks) so it tolerates schema variation without guessing.
// Returns null when no SAFE title can be produced (caller skips + reports it).
// Pure + deterministic + offline-testable.
// ============================================================================
import { buildNormalizedText, buildKeywords } from "./normalize";

export interface SearchDocument {
  organization_id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  subtitle: string | null;
  normalized_text: string;
  keywords: string[];
  route: string;
  owner_user_id: string | null;
  visibility: string;
  metadata: Record<string, unknown>;
  source_updated_at: string | null;
  event_id: string | null;
}

type Row = Record<string, unknown>;

interface EntityConfig {
  /** Real route to open the entity (per-id where a detail page exists, else area). */
  route: (id: string) => string;
  /** Ordered title field fallbacks. First non-empty wins; none → skip. */
  title: string[];
  /** Fields joined (with · ) into the subtitle + haystack. */
  subtitle: string[];
  /** Extra safe fields folded into the haystack/keywords (not shown). */
  safeText?: string[];
  /** Phone field fallbacks (normalized into the haystack/keywords). */
  phones?: string[];
  /** Owner user-id field fallbacks. */
  owner?: string[];
  /** source_updated_at field fallbacks. */
  updatedAt?: string[];
  /** Safe metadata fields to carry (status/city etc). */
  meta?: string[];
  visibility?: string;
}

// Per-entity config. Routes use per-id detail pages where they exist, otherwise
// the entity's list/area page (still a real route).
export const SEARCH_CONFIG: Record<string, EntityConfig> = {
  property: {
    route: (id) => `/properties/${id}`,
    title: ["title", "name", "address", "full_address", "street_address"],
    subtitle: ["city", "neighborhood", "status"],
    safeText: ["property_type", "street", "asset_type"],
    owner: ["owner_id", "agent_id", "owner_user_id", "assigned_agent_id"],
    updatedAt: ["updated_at", "created_at"],
    meta: ["status", "city", "property_type"],
  },
  external_listing: {
    route: (id) => `/external-listings/${id}`,
    title: ["title", "address", "name"],
    subtitle: ["city", "neighborhood", "source"],
    safeText: ["property_type", "street"],
    updatedAt: ["first_seen_at", "updated_at", "created_at"],
    meta: ["source", "city"],
  },
  buyer: {
    route: (id) => `/buyers/${id}`,
    title: ["full_name", "name"],
    subtitle: ["city", "status", "stage"],
    phones: ["phone", "phone_number"],
    owner: ["owner_id", "agent_id", "assigned_agent_id"],
    updatedAt: ["updated_at", "created_at"],
    meta: ["status", "stage"],
  },
  seller: {
    route: (id) => `/sellers/${id}`,
    title: ["full_name", "name"],
    subtitle: ["city", "status"],
    phones: ["phone", "phone_number"],
    owner: ["owner_id", "agent_id", "assigned_agent_id"],
    updatedAt: ["updated_at", "created_at"],
    meta: ["status"],
  },
  lead: {
    route: (id) => `/leads/${id}`,
    title: ["full_name", "name"],
    subtitle: ["source", "stage"],
    phones: ["phone", "phone_number"],
    owner: ["owner_id", "assigned_agent_id", "agent_id"],
    updatedAt: ["updated_at", "created_at"],
    meta: ["source", "stage"],
  },
  deal: {
    route: () => `/deals`,
    title: ["title", "name"],
    subtitle: ["stage", "status"],
    updatedAt: ["updated_at", "created_at"],
    meta: ["stage", "status"],
  },
  meeting: {
    route: () => `/calendar`,
    title: ["title", "subject"],
    subtitle: ["status", "location"],
    updatedAt: ["updated_at", "start_at", "created_at"],
    meta: ["status"],
  },
  task: {
    route: () => `/today`,
    title: ["title", "name"],
    subtitle: ["status", "priority"],
    updatedAt: ["updated_at", "created_at"],
    meta: ["status"],
  },
  journey: {
    route: () => `/journeys`,
    title: ["title", "name"],
    subtitle: ["stage", "status"],
    updatedAt: ["updated_at", "created_at"],
    meta: ["stage"],
  },
  document: {
    route: () => `/documents`,
    title: ["title", "name", "file_name", "template_name"],
    subtitle: ["status", "type", "document_type"],
    updatedAt: ["updated_at", "created_at"],
    meta: ["status", "type"],
  },
  agent: {
    route: () => `/settings`,
    title: ["full_name", "name"],
    subtitle: ["role", "primary_city"],
    updatedAt: ["updated_at", "created_at"],
    meta: ["role"],
  },
};

/** All entity types the projection knows how to build. */
export const SEARCHABLE_ENTITY_TYPES = Object.keys(SEARCH_CONFIG);

function pick(row: Row, keys: string[] | undefined): string | null {
  if (!keys) return null;
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickAll(row: Row, keys: string[] | undefined): string[] {
  if (!keys) return [];
  const out: string[] = [];
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    else if (typeof v === "number" && Number.isFinite(v)) out.push(String(v));
  }
  return out;
}

/**
 * Build a canonical search document from an entity row, or null when there is
 * no SAFE title (the caller skips + reports it — we never fabricate a title).
 */
export function buildSearchDocument(
  entityType: string,
  entityId: string,
  orgId: string,
  row: Row,
  eventId: string | null = null,
): SearchDocument | null {
  const cfg = SEARCH_CONFIG[entityType];
  if (!cfg || !orgId || !entityId) return null;
  const title = pick(row, cfg.title);
  if (!title) return null; // no safe title → skip

  const subtitleParts = pickAll(row, cfg.subtitle);
  const subtitle = subtitleParts.length ? subtitleParts.join(" · ") : null;
  const safeParts = [title, ...subtitleParts, ...pickAll(row, cfg.safeText)];
  const phones = pickAll(row, cfg.phones);

  const metadata: Record<string, unknown> = {};
  for (const m of cfg.meta ?? []) { const v = pick(row, [m]); if (v) metadata[m] = v; }

  return {
    organization_id: orgId,
    entity_type: entityType,
    entity_id: entityId,
    title,
    subtitle,
    normalized_text: buildNormalizedText(safeParts, phones),
    keywords: buildKeywords(safeParts, phones),
    route: cfg.route(entityId),
    owner_user_id: pick(row, cfg.owner),
    visibility: cfg.visibility ?? "internal",
    metadata,
    source_updated_at: pick(row, cfg.updatedAt),
    event_id: eventId,
  };
}
