// ============================================================================
// ZONO — Agency Knowledge Graph™ (Phase 26.3). Domain models + PURE helpers.
// ----------------------------------------------------------------------------
// CLIENT-SAFE: no server-only deps, no IO. The graph builder/repository/service
// (server-only) import these types and reuse the pure functions below so the
// same dedup / merge / footprint / event-detection logic is unit-testable
// without a database.
// ============================================================================

/** The ZONO business entities an agency can be connected to. */
export type AgencyEntityType =
  | "agent"
  | "property"
  | "seller"
  | "buyer"
  | "deal"
  | "city"
  | "neighborhood"
  | "street"
  | "project"
  | "developer"
  | "activity"
  | "listing";

/** How an agency relates to an entity. */
export type AgencyRelationshipType =
  | "agent_member"
  | "property_listing"
  | "property_sold"
  | "seller_contact"
  | "buyer_contact"
  | "deal_participant"
  | "developer_partner"
  | "project_marketer"
  | "area_activity"
  | "digital_presence"
  | "source_provider";

/** A persisted relationship row (domain model). */
export interface AgencyEntityRelationship {
  id: string;
  organizationId: string;
  agencyId: string;
  entityType: AgencyEntityType | string;
  entityId: string;
  relationshipType: AgencyRelationshipType | string;
  confidence: number; // 0..1
  source: string | null;
  evidence: Record<string, unknown>;
  firstDetectedAt: string;
  lastSeenAt: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A relationship the builder wants to create/update (pre-persistence). */
export interface RelationshipInput {
  agencyId: string;
  entityType: AgencyEntityType | string;
  entityId: string;
  relationshipType: AgencyRelationshipType | string;
  confidence?: number;
  source?: string | null;
  evidence?: Record<string, unknown>;
}

/** Aggregated geographic footprint for one agency. */
export interface AgencyAreaFootprint {
  cities: string[];
  neighborhoods: string[];
  streets: string[];
  activePropertiesCount: number;
  historicalPropertiesCount: number;
  dealCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  confidence: number; // 0..1, weighted average across area relationships
}

/** A would-be timeline event derived from a graph change. */
export interface GraphTimelineEvent {
  eventType: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
}

/** A would-be signal derived from a graph change. */
export interface GraphSignal {
  signalType: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
}

// ── Constants ────────────────────────────────────────────────────────────────
export const AGENCY_ENTITY_TYPES: AgencyEntityType[] = [
  "agent", "property", "seller", "buyer", "deal", "city",
  "neighborhood", "street", "project", "developer", "activity", "listing",
];
export const AREA_ENTITY_TYPES: AgencyEntityType[] = ["city", "neighborhood", "street"];

// Significant jump in relationship count that warrants a signal/event.
export const ACTIVITY_SPIKE_THRESHOLD = 5;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Normalize an area name to a stable key (lowercase, collapsed whitespace). */
export function areaKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Stable identity of a relationship. Mirrors the DB unique key
 * (agency_id, entity_type, entity_id, relationship_type) so the same logical
 * edge is never duplicated regardless of how often the builder runs.
 */
export function relationshipKey(
  r: Pick<RelationshipInput, "agencyId" | "entityType" | "entityId" | "relationshipType">,
): string {
  return [r.agencyId, r.entityType, r.entityId, r.relationshipType].join("::");
}

/** De-duplicate a batch of relationship inputs, keeping the highest confidence
 *  and merging evidence (later wins on conflicting keys). */
export function dedupeRelationshipInputs(inputs: RelationshipInput[]): RelationshipInput[] {
  const map = new Map<string, RelationshipInput>();
  for (const inc of inputs) {
    const key = relationshipKey(inc);
    const prev = map.get(key);
    if (!prev) { map.set(key, { ...inc, confidence: clamp01(inc.confidence ?? 0.5) }); continue; }
    map.set(key, {
      ...prev,
      confidence: clamp01(Math.max(prev.confidence ?? 0, inc.confidence ?? 0)),
      source: prev.source ?? inc.source ?? null,
      evidence: { ...(prev.evidence ?? {}), ...(inc.evidence ?? {}) },
    });
  }
  return [...map.values()];
}

/**
 * Compute the merged state of an existing relationship + a freshly-detected one.
 * Idempotent: confidence is the max of old/new, evidence is merged, last_seen
 * advances, active is re-set true. Returns the fields the repository should write.
 */
export function mergeRelationship(
  existing: Pick<AgencyEntityRelationship, "confidence" | "evidence"> | null,
  incoming: RelationshipInput,
  now: string,
): { confidence: number; source: string | null; evidence: Record<string, unknown>; lastSeenAt: string; active: boolean } {
  const incConf = clamp01(incoming.confidence ?? 0.5);
  if (!existing) {
    return {
      confidence: incConf,
      source: incoming.source ?? null,
      evidence: incoming.evidence ?? {},
      lastSeenAt: now,
      active: true,
    };
  }
  return {
    confidence: clamp01(Math.max(existing.confidence ?? 0, incConf)),
    source: incoming.source ?? null,
    evidence: { ...(existing.evidence ?? {}), ...(incoming.evidence ?? {}) },
    lastSeenAt: now,
    active: true,
  };
}

/** Aggregate active relationships into an area footprint for one agency. */
export function computeAreaFootprint(rels: AgencyEntityRelationship[]): AgencyAreaFootprint {
  const active = rels.filter((r) => r.active);
  const cities = new Set<string>();
  const neighborhoods = new Set<string>();
  const streets = new Set<string>();
  let activeProps = 0, histProps = 0, deals = 0;
  let confSum = 0, confCount = 0;
  let firstSeen: string | null = null;
  let lastSeen: string | null = null;

  const label = (r: AgencyEntityRelationship): string =>
    (typeof r.evidence?.label === "string" && r.evidence.label) || r.entityId;

  for (const r of active) {
    if (r.entityType === "city") cities.add(label(r));
    else if (r.entityType === "neighborhood") neighborhoods.add(label(r));
    else if (r.entityType === "street") streets.add(label(r));

    if (AREA_ENTITY_TYPES.includes(r.entityType as AgencyEntityType)) {
      confSum += r.confidence; confCount++;
    }
    if (r.relationshipType === "property_listing") activeProps++;
    if (r.relationshipType === "property_sold") histProps++;
    if (r.relationshipType === "deal_participant") deals++;

    if (!firstSeen || r.firstDetectedAt < firstSeen) firstSeen = r.firstDetectedAt;
    if (!lastSeen || r.lastSeenAt > lastSeen) lastSeen = r.lastSeenAt;
  }

  return {
    cities: [...cities].sort(),
    neighborhoods: [...neighborhoods].sort(),
    streets: [...streets].sort(),
    activePropertiesCount: activeProps,
    historicalPropertiesCount: histProps,
    dealCount: deals,
    firstSeen,
    lastSeen,
    confidence: confCount ? clamp01(confSum / confCount) : 0,
  };
}

/**
 * Detect timeline-worthy events by comparing the area/connection state BEFORE a
 * graph rebuild with the state AFTER. Returns only meaningful, non-noisy events.
 */
export function detectTimelineEvents(
  before: AgencyEntityRelationship[],
  after: AgencyEntityRelationship[],
): GraphTimelineEvent[] {
  const events: GraphTimelineEvent[] = [];
  const beforeKeys = new Set(before.filter((r) => r.active).map((r) => `${r.entityType}:${r.entityId}`));
  const afterActive = after.filter((r) => r.active);

  const beforeCities = new Set(before.filter((r) => r.active && r.entityType === "city").map((r) => r.entityId));
  const beforeNbhd = new Set(before.filter((r) => r.active && r.entityType === "neighborhood").map((r) => r.entityId));
  const beforeProps = before.filter((r) => r.active && r.relationshipType === "property_listing").length;

  const labelOf = (r: AgencyEntityRelationship): string =>
    (typeof r.evidence?.label === "string" && r.evidence.label) || r.entityId;

  for (const r of afterActive) {
    if (r.entityType === "city" && !beforeCities.has(r.entityId)) {
      events.push({ eventType: "area_entered_city", title: `כניסה לעיר חדשה: ${labelOf(r)}`, description: null, metadata: { city: labelOf(r) } });
    }
    if (r.entityType === "neighborhood" && !beforeNbhd.has(r.entityId)) {
      events.push({ eventType: "area_entered_neighborhood", title: `כניסה לשכונה חדשה: ${labelOf(r)}`, description: null, metadata: { neighborhood: labelOf(r) } });
    }
    if (r.relationshipType === "project_marketer" && !beforeKeys.has(`${r.entityType}:${r.entityId}`)) {
      events.push({ eventType: "project_connected", title: `חיבור לפרויקט: ${labelOf(r)}`, description: null, metadata: { project: labelOf(r) } });
    }
    if (r.relationshipType === "developer_partner" && !beforeKeys.has(`${r.entityType}:${r.entityId}`)) {
      events.push({ eventType: "developer_connected", title: `חיבור ליזם: ${labelOf(r)}`, description: null, metadata: { developer: labelOf(r) } });
    }
  }

  // First property in any area (transition 0 → >0).
  const afterProps = afterActive.filter((r) => r.relationshipType === "property_listing").length;
  if (beforeProps === 0 && afterProps > 0) {
    events.push({ eventType: "first_area_property", title: "הנכס הראשון של הסוכנות מופה לאזור", description: null, metadata: { properties: afterProps } });
  }

  return events;
}

/**
 * Detect signal-worthy changes. Mirrors detectTimelineEvents but emits the
 * higher-level "this changed a lot" signals the spec asks for.
 */
export function detectSignals(
  before: AgencyEntityRelationship[],
  after: AgencyEntityRelationship[],
): GraphSignal[] {
  const signals: GraphSignal[] = [];
  const beforeActive = before.filter((r) => r.active);
  const afterActive = after.filter((r) => r.active);

  const beforeCities = new Set(beforeActive.filter((r) => r.entityType === "city").map((r) => r.entityId));
  const afterCities = afterActive.filter((r) => r.entityType === "city");
  for (const c of afterCities) {
    if (!beforeCities.has(c.entityId)) {
      const label = (typeof c.evidence?.label === "string" && c.evidence.label) || c.entityId;
      signals.push({ signalType: "new_area_detected", severity: "info", title: `אזור פעילות חדש: ${label}`, description: null, metadata: { city: label } });
    }
  }

  const beforeProjects = new Set(beforeActive.filter((r) => r.relationshipType === "project_marketer").map((r) => r.entityId));
  const afterProjects = afterActive.filter((r) => r.relationshipType === "project_marketer");
  if (afterProjects.some((p) => !beforeProjects.has(p.entityId))) {
    signals.push({ signalType: "project_connection_detected", severity: "info", title: "זוהה חיבור חדש לפרויקט", description: null, metadata: {} });
  }

  const beforeDevelopers = new Set(beforeActive.filter((r) => r.relationshipType === "developer_partner").map((r) => r.entityId));
  const afterDevelopers = afterActive.filter((r) => r.relationshipType === "developer_partner");
  if (afterDevelopers.some((d) => !beforeDevelopers.has(d.entityId))) {
    signals.push({ signalType: "developer_connection_detected", severity: "info", title: "זוהה חיבור חדש ליזם", description: null, metadata: {} });
  }

  const beforeAgents = beforeActive.filter((r) => r.relationshipType === "agent_member").length;
  const afterAgents = afterActive.filter((r) => r.relationshipType === "agent_member").length;
  if (afterAgents - beforeAgents >= 2) {
    signals.push({ signalType: "agent_network_expanded", severity: "info", title: `רשת הסוכנים גדלה (+${afterAgents - beforeAgents})`, description: null, metadata: { added: afterAgents - beforeAgents } });
  }

  if (afterActive.length - beforeActive.length >= ACTIVITY_SPIKE_THRESHOLD) {
    signals.push({
      signalType: "agency_activity_spike",
      severity: "info",
      title: `עלייה משמעותית בפעילות הסוכנות (+${afterActive.length - beforeActive.length} קשרים)`,
      description: null,
      metadata: { delta: afterActive.length - beforeActive.length },
    });
  }

  return signals;
}
