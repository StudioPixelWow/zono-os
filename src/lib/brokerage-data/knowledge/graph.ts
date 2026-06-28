// ============================================================================
// ZONO Brokerage Knowledge — Graph builder (pure).
// Transforms relational brokerage data into a knowledge graph: every entity is
// a node, every relationship an edge. Pure & deterministic — the service feeds
// rows in, persists the result, and future graph queries run on top without a
// redesign. Node keys are stable identities so re-runs upsert cleanly.
// ============================================================================
import { normalizePhoneNumber, normalizeEmail, normalizeWebsite, normalizeCity } from "../normalize";
import type { GraphBuildResult, GraphNodeInput, GraphEdgeInput, GraphNodeType, GraphEdgeType } from "./types";

export interface GraphOfficeInput {
  id: string; name: string; city?: string | null; primaryPhone?: string | null; primaryEmail?: string | null;
  websiteUrl?: string | null; brandNetwork?: string | null; parentOfficeId?: string | null;
}
export interface GraphAgentInput {
  id: string; fullName: string; officeId?: string | null; city?: string | null;
  primaryPhone?: string | null; whatsappPhone?: string | null; primaryEmail?: string | null;
}
export interface GraphContactInput {
  entityType: "office" | "agent"; entityId: string; contactType: string; value: string;
}
export interface GraphLinkInput {
  externalListingId: string; agentId?: string | null; officeId?: string | null; city?: string | null;
}
export interface GraphSourceLinkInput { entityType: "office" | "agent"; entityId: string; sourceType: string }

const k = {
  office: (id: string) => `office:${id}`,
  agent: (id: string) => `agent:${id}`,
  phone: (v: string) => `phone:${v}`,
  email: (v: string) => `email:${v}`,
  website: (v: string) => `website:${v}`,
  social: (t: string, v: string) => `${t}:${v}`,
  city: (v: string) => `city:${v}`,
  listing: (id: string) => `listing:${id}`,
  source: (t: string) => `source:${t}`,
};

const SOCIAL_TYPES = new Set(["facebook", "instagram", "linkedin"]);

/** Build the full graph (deduplicated nodes + edges) from relational inputs. */
export function buildGraph(input: {
  offices: GraphOfficeInput[]; agents: GraphAgentInput[];
  contacts?: GraphContactInput[]; links?: GraphLinkInput[]; sourceLinks?: GraphSourceLinkInput[];
}): GraphBuildResult {
  const nodes = new Map<string, GraphNodeInput>();
  const edges = new Map<string, GraphEdgeInput>();
  const addNode = (n: GraphNodeInput) => { if (!nodes.has(n.nodeKey)) nodes.set(n.nodeKey, n); };
  const addEdge = (e: GraphEdgeInput) => {
    if (!nodes.has(e.srcKey) || !nodes.has(e.dstKey)) return;
    const id = `${e.srcKey}|${e.edgeType}|${e.dstKey}`;
    if (!edges.has(id)) edges.set(id, { weight: 1, confidence: 0, ...e });
  };
  const node = (nodeKey: string, nodeType: GraphNodeType, label: string, extra: Partial<GraphNodeInput> = {}) =>
    addNode({ nodeKey, nodeType, label, entityId: null, value: null, city: null, ...extra });

  // Offices + their cities, websites, phones, emails, networks, parents.
  for (const o of input.offices) {
    node(k.office(o.id), "office", o.name, { entityId: o.id, city: o.city ?? null });
    if (o.city) { const c = normalizeCity(o.city); if (c) { node(k.city(c), "city", o.city, { value: c, city: o.city }); addEdge({ srcKey: k.office(o.id), dstKey: k.city(c), edgeType: "ACTIVE_IN", confidence: 70 }); } }
    const ph = normalizePhoneNumber(o.primaryPhone); if (ph) { node(k.phone(ph), "phone", ph, { value: ph }); addEdge({ srcKey: k.office(o.id), dstKey: k.phone(ph), edgeType: "USED_PHONE", confidence: 80 }); }
    const em = normalizeEmail(o.primaryEmail); if (em) { node(k.email(em), "email", em, { value: em }); addEdge({ srcKey: k.office(o.id), dstKey: k.email(em), edgeType: "HAS_EMAIL", confidence: 70 }); }
    const ws = normalizeWebsite(o.websiteUrl); if (ws) { node(k.website(ws), "website", ws, { value: ws }); addEdge({ srcKey: k.office(o.id), dstKey: k.website(ws), edgeType: "HAS_WEBSITE", confidence: 75 }); }
    if (o.parentOfficeId) addEdge({ srcKey: k.office(o.id), dstKey: k.office(o.parentOfficeId), edgeType: "BELONGS_TO", confidence: 80 });
  }

  // Agents → office (WORKS_FOR), city, phones, emails.
  for (const a of input.agents) {
    node(k.agent(a.id), "agent", a.fullName, { entityId: a.id, city: a.city ?? null });
    if (a.officeId && nodes.has(k.office(a.officeId))) addEdge({ srcKey: k.agent(a.id), dstKey: k.office(a.officeId), edgeType: "WORKS_FOR", confidence: 85 });
    if (a.city) { const c = normalizeCity(a.city); if (c) { node(k.city(c), "city", a.city, { value: c, city: a.city }); addEdge({ srcKey: k.agent(a.id), dstKey: k.city(c), edgeType: "ACTIVE_IN", confidence: 65 }); } }
    for (const p of [a.primaryPhone, a.whatsappPhone]) { const ph = normalizePhoneNumber(p); if (ph) { node(k.phone(ph), "phone", ph, { value: ph }); addEdge({ srcKey: k.agent(a.id), dstKey: k.phone(ph), edgeType: "USED_PHONE", confidence: 80 }); } }
    const em = normalizeEmail(a.primaryEmail); if (em) { node(k.email(em), "email", em, { value: em }); addEdge({ srcKey: k.agent(a.id), dstKey: k.email(em), edgeType: "HAS_EMAIL", confidence: 65 }); }
  }

  // Extra contact points (social etc.).
  for (const c of input.contacts ?? []) {
    const t = c.contactType.toLowerCase();
    const src = c.entityType === "office" ? k.office(c.entityId) : k.agent(c.entityId);
    if (!nodes.has(src)) continue;
    if (SOCIAL_TYPES.has(t)) { const key = k.social(t, c.value.toLowerCase()); node(key, t as GraphNodeType, c.value, { value: c.value.toLowerCase() }); addEdge({ srcKey: src, dstKey: key, edgeType: "HAS_SOCIAL", confidence: 50 }); }
    else if (t === "website") { const ws = normalizeWebsite(c.value); if (ws) { node(k.website(ws), "website", ws, { value: ws }); addEdge({ srcKey: src, dstKey: k.website(ws), edgeType: "HAS_WEBSITE", confidence: 70 }); } }
  }

  // External listings → published-by agent / belongs-to office.
  for (const l of input.links ?? []) {
    node(k.listing(l.externalListingId), "listing", "מודעה חיצונית", { value: l.externalListingId, city: l.city ?? null });
    if (l.agentId && nodes.has(k.agent(l.agentId))) addEdge({ srcKey: k.listing(l.externalListingId), dstKey: k.agent(l.agentId), edgeType: "PUBLISHED_BY", confidence: 80 });
    if (l.officeId && nodes.has(k.office(l.officeId))) addEdge({ srcKey: k.listing(l.externalListingId), dstKey: k.office(l.officeId), edgeType: "BELONGS_TO", confidence: 75 });
  }

  // Source provenance.
  for (const s of input.sourceLinks ?? []) {
    const src = s.entityType === "office" ? k.office(s.entityId) : k.agent(s.entityId);
    if (!nodes.has(src)) continue;
    node(k.source(s.sourceType), "source", s.sourceType, { value: s.sourceType });
    addEdge({ srcKey: src, dstKey: k.source(s.sourceType), edgeType: "FOUND_ON_SOURCE", confidence: 60 });
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

const _edgeTypes: GraphEdgeType[] = ["WORKS_FOR", "ACTIVE_IN", "PUBLISHED_BY", "BELONGS_TO", "USED_PHONE", "HAS_WEBSITE", "FOUND_ON_SOURCE", "MARKETED_BY", "CHANGED_OFFICE", "COMPETES_WITH", "HAS_EMAIL", "HAS_SOCIAL"];
export const GRAPH_EDGE_TYPES = _edgeTypes;
