// ============================================================================
// 🌐 ZONO — Universal Knowledge Graph — offline self-check (pure). PHASE 51.0.
// Spec QA: buyer-property-seller chain, lead-conversation-workflow, property-
// street-territory, campaign-comment-lead, broker-office-market, duplicate edge,
// stale edge, missing evidence. Runs with node/tsx (no DB). Reuses buildGraph.
// ============================================================================
import { buildGraph, type NodeSeed } from "@/lib/relationship-graph/graph";
import type { RawRelation } from "@/lib/relationship-graph/types";
import { edgesOf, neighborsOf, pathBetween, relationshipSummary, buildContextPack } from "./query";
import { relationsFromEntityRelationshipRows, type EntityRelationshipRow } from "./discovery";

const rel = (from: string, fromType: string, to: string, toType: string, type: string, o: { at?: string | null; evidence?: string; source?: string } = {}): RawRelation =>
  ({ from, to, fromType, toType, type, at: o.at ?? "2026-07-01T00:00:00.000Z", source: o.source ?? "entity_relationships", evidence: o.evidence ?? `${fromType} ${type} ${toType}` });

function graphOf(relations: RawRelation[], seeds: NodeSeed[] = []) { return buildGraph(seeds, relations); }

export interface Check { name: string; pass: boolean }
export interface SelfCheck { ok: boolean; total: number; passed: number; checks: Check[] }

export function runSelfCheck(): SelfCheck {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });

  // 1. Buyer → Property → Seller chain.
  const g1 = graphOf([
    rel("b1", "buyer", "p1", "property", "interested_in"),
    rel("s1", "seller", "p1", "property", "owns"),
  ], [{ id: "b1", type: "buyer", name: "דנה" }, { id: "p1", type: "property", name: "דירה" }, { id: "s1", type: "seller", name: "יוסי" }]);
  add("buyer-property-seller: path exists", pathBetween(g1, "b1", "s1").length === 3);
  add("buyer-property-seller: property has 2 connections", relationshipSummary(g1, "p1").totalConnections === 2);

  // 2. Lead → Conversation → Workflow.
  const g2 = graphOf([
    rel("l1", "lead", "c1", "conversation", "related_to"),
    rel("c1", "conversation", "w1", "workflow", "related_to"),
  ]);
  add("lead-conversation-workflow: path exists", pathBetween(g2, "l1", "w1").length === 3);

  // 3. Property → Street → Territory.
  const g3 = graphOf([
    rel("p1", "property", "st1", "street", "related_to"),
    rel("st1", "street", "t1", "territory", "related_to"),
  ]);
  add("property-street-territory: neighbors + path", neighborsOf(g3, "st1").length === 2 && pathBetween(g3, "p1", "t1").length === 3);

  // 4. Campaign → FacebookComment → Lead.
  const g4 = graphOf([
    rel("cm1", "campaign", "fc1", "facebook_comment", "created"),
    rel("fc1", "facebook_comment", "l1", "lead", "referred"),
  ]);
  add("campaign-comment-lead: path exists", pathBetween(g4, "cm1", "l1").length === 3);

  // 5. Broker → Office → Market.
  const g5 = graphOf([
    rel("br1", "broker", "of1", "office", "works_at"),
    rel("of1", "office", "mk1", "market", "competed_with"),
  ]);
  add("broker-office-market: path exists", pathBetween(g5, "br1", "mk1").length === 3);

  // 6. Duplicate edge → aggregated into ONE edge with occurrences 2.
  const g6 = graphOf([
    rel("b1", "buyer", "p1", "property", "interested_in"),
    rel("b1", "buyer", "p1", "property", "interested_in"),
  ]);
  const e6 = edgesOf(g6, "b1");
  add("duplicate edge: one aggregated edge", e6.length === 1);
  add("duplicate edge: occurrences = 2", e6[0]?.occurrences === 2 && e6[0]?.verification === "corroborated");

  // 7. Stale edge → freshnessLevel expired, lower strength.
  const oldIso = new Date(Date.now() - 220 * 86400000).toISOString();
  const g7 = graphOf([rel("b1", "buyer", "p1", "property", "interested_in", { at: oldIso })]);
  add("stale edge: expired freshness", edgesOf(g7, "b1")[0]?.freshnessLevel === "expired");

  // 8. Missing evidence → edge kept but verification single_source, no evidence strings.
  const g8 = graphOf([rel("b1", "buyer", "p1", "property", "interested_in", { evidence: "" })]);
  const e8 = edgesOf(g8, "b1")[0];
  add("missing evidence: edge kept, no evidence, single_source", !!e8 && e8.evidence.length === 0 && e8.verification === "single_source");

  // 9. Discovery mapping from persisted rows.
  const rows: EntityRelationshipRow[] = [
    { source_entity_type: "buyer", source_entity_id: "b1", target_entity_type: "property_listing", target_entity_id: "p1", relationship_type: "interested_in", strength_score: 80, metadata: { source_name: "דנה", target_name: "דירה" }, created_at: null, updated_at: "2026-07-01T00:00:00.000Z", status: "active" },
    { source_entity_type: "whatsapp_conversation", source_entity_id: "c1", target_entity_type: "buyer", target_entity_id: "b1", relationship_type: "related_to", strength_score: 50, metadata: {}, created_at: "2026-06-01T00:00:00.000Z", updated_at: null, status: "inactive" },
  ];
  const { relations, seeds } = relationsFromEntityRelationshipRows(rows);
  add("discovery: normalizes kinds + drops inactive", relations.length === 1 && relations[0].toType === "property" && seeds.some((s) => s.name === "דנה"));

  // 10. Context pack lines are evidence-backed + non-fabricating on empty.
  const pack = buildContextPack(g1, "p1", "דירה");
  add("context pack: has lines for connected entity", pack.lines.length === 2 && pack.totalConnections === 2);
  add("context pack: empty entity → no fabricated lines", buildContextPack(g1, "ghost").lines.length === 0);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
