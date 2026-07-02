// ============================================================================
// 🕸️ Relationship Graph — relationship discovery (pure). 27.9. Part 5.
// Derives relationships from EXISTING evidence only (listing links, agent→office
// records, mission history). Never invents a relationship — every one cites the
// evidence it came from. Structural inputs (no engine coupling).
// ============================================================================
import type { RawRelation, EntityType } from "./types";

export interface LinkRel { agentId: string | null; officeId: string | null; listingId: string | null; city: string | null; source: string | null; at: string | null }
export interface AgentRel { id: string; officeId: string | null; city: string | null }
export interface MissionRel { id: string; entityId: string | null; entityType: string; missionType: string; sourceDecision: string | null; status: string; createdAt: string; completedAt: string | null }

const rel = (from: string, to: string, fromType: EntityType, toType: EntityType, type: string, at: string | null, source: string, evidence: string): RawRelation =>
  ({ from, to, fromType, toType, type, at, source, evidence });
const ordered = (a: string, b: string): [string, string] => (a <= b ? [a, b] : [b, a]);

/** Relations from listing links: represents / owns / works_at / listing↔market. */
export function relationsFromLinks(links: LinkRel[]): RawRelation[] {
  const out: RawRelation[] = [];
  const byListing = new Map<string, Set<string>>();          // listing → distinct agents (collaboration)
  const officesInCity = new Map<string, Set<string>>();       // city → distinct offices (competition)

  for (const l of links) {
    const src = l.source ?? "listing_link";
    if (l.agentId && l.listingId) out.push(rel(l.agentId, l.listingId, "broker", "listing", "represents", l.at, src, `מודעה ${l.listingId.slice(0, 8)}`));
    if (l.officeId && l.listingId) out.push(rel(l.officeId, l.listingId, "office", "listing", "owns", l.at, src, `מודעה ${l.listingId.slice(0, 8)}`));
    if (l.listingId && l.city) out.push(rel(l.listingId, `city:${l.city}`, "listing", "market", "related_to", l.at, src, `עיר ${l.city}`));
    if (l.agentId && l.officeId) out.push(rel(l.agentId, l.officeId, "broker", "office", "works_at", l.at, src, `מודעה משותפת ${l.listingId?.slice(0, 8) ?? ""}`));
    if (l.listingId && l.agentId) (byListing.get(l.listingId) ?? byListing.set(l.listingId, new Set()).get(l.listingId)!).add(l.agentId);
    if (l.city && l.officeId) (officesInCity.get(l.city) ?? officesInCity.set(l.city, new Set()).get(l.city)!).add(l.officeId);
  }

  // Broker ↔ broker collaboration (same listing, ≥2 agents).
  for (const [listingId, agents] of byListing) {
    const arr = [...agents];
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const [a, b] = ordered(arr[i], arr[j]);
      out.push(rel(a, b, "broker", "broker", "collaborated", null, "shared_listing", `מודעה משותפת ${listingId.slice(0, 8)}`));
    }
  }

  // Office ↔ office competition (same city).
  for (const [city, offices] of officesInCity) {
    const arr = [...offices];
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const [a, b] = ordered(arr[i], arr[j]);
      out.push(rel(a, b, "office", "office", "competed_with", null, "shared_city", `עיר משותפת ${city}`));
    }
  }

  return out;
}

/** Authoritative broker→office employment from the agent record. */
export function relationsFromAgents(agents: AgentRel[]): RawRelation[] {
  const out: RawRelation[] = [];
  for (const a of agents) if (a.officeId) out.push(rel(a.id, a.officeId, "broker", "office", "works_at", null, "agent_record", "רשומת מתווך"));
  return out;
}

/** Entity↔mission↔decision relations from mission history. */
export function relationsFromMissions(missions: MissionRel[]): RawRelation[] {
  const out: RawRelation[] = [];
  for (const m of missions) {
    if (m.entityId) {
      out.push(rel(m.entityId, m.id, m.entityType, "mission", "assigned_to", m.createdAt, "mission", `משימה ${m.missionType}`));
      if (m.status === "DONE") out.push(rel(m.entityId, m.id, m.entityType, "mission", "completed", m.completedAt ?? m.createdAt, "mission", `הושלמה ${m.missionType}`));
    }
    if (m.sourceDecision) out.push(rel(m.id, `decision:${m.sourceDecision}`, "mission", "decision", "created", m.createdAt, "mission", `מהחלטה`));
  }
  return out;
}
