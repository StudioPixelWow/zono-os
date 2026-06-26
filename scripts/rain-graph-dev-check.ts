/**
 * LOCAL-DEV-ONLY check for RAIN Network graph logic (Phase 26.9). Pure layers
 * only (no DB, no React). Verifies: node importance scoring · edge strength ·
 * null-not-fake-zero · confidence buckets · graph assembly (dangling-edge drop,
 * duplicate prevention) · agency/territory/signal subgraph extraction ·
 * idempotent/deterministic scoring.
 *
 * Run: npx tsx scripts/rain-graph-dev-check.ts
 */
import {
  scoreAgencyNode, scoreAgentNode, scorePropertyNode, scoreTerritoryNode,
  scoreSignalNode, severityWeight, scoreEdgeStrength, confidenceFromDataPoints,
} from "../src/lib/rain/rainGraphScoring";
import { buildConfidence, assemble, subgraphFrom } from "../src/lib/rain/rainGraphAssembly";
import type { RainNode, RainEdge } from "../src/lib/rain/rainTypes";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function node(p: Partial<RainNode> & { id: string; nodeType: RainNode["nodeType"] }): RainNode {
  return {
    id: p.id, nodeType: p.nodeType, entityId: p.entityId ?? p.id, label: p.label ?? p.id,
    subtitle: null, city: p.city ?? null, neighborhood: null, street: null,
    importanceScore: p.importanceScore ?? null, confidence: p.confidence ?? "low", metadata: p.metadata ?? {},
  };
}
function edge(s: string, t: string, type: RainEdge["edgeType"]): RainEdge {
  return { id: `${s}-${t}-${type}`, sourceNodeId: s, targetNodeId: t, edgeType: type, strength: 50, confidence: "medium", evidence: {}, active: true };
}

function main(): void {
  console.log("RAIN Network graph dev-check\n");

  // 1) Node scoring.
  console.log("Node scoring:");
  const ag = scoreAgencyNode({ overall: 80, threat: 60, momentum: 40, activeSignals: 5 });
  assert(ag.importance !== null && ag.importance! > 0 && ag.confidence === "high", "agency importance from real metrics → scored, high confidence");
  assert(scoreAgencyNode({}).importance === null && scoreAgencyNode({}).confidence === "low", "agency with no data → null importance + low confidence (never fake 0)");
  assert(scoreAgencyNode({ overall: 0 }).importance === 0, "a REAL 0 overall is kept as 0 (only absence → null)");
  assert(scoreAgentNode({ relatedProperties: 10, agencyRelationConfidence: 0.8 }).importance !== null, "agent importance from properties + relation confidence");
  assert(scorePropertyNode({ statusScore: 70, priceTier: 60 }).importance !== null, "property importance from status + price tier");
  assert(scoreTerritoryNode({ dominanceActivity: 75, agencyCount: 3, signals: 2 }).importance !== null, "territory importance from dominance + agencies + signals");
  assert(scoreSignalNode({ severityScore: severityWeight("critical"), importance: 90 }).importance !== null, "signal importance from severity + importance");
  assert(severityWeight("critical") === 100 && severityWeight(null) === null, "severity weight maps; unknown → null");

  // 2) Edge strength.
  console.log("\nEdge strength:");
  const es = scoreEdgeStrength({ relationshipConfidence: 0.9, supportingEvents: 8, recencyDays: 10, activityVolume: 6, territoryOverlap: 1 });
  assert(es.strength !== null && es.strength! > 0 && es.confidence === "high", "edge strength from rich inputs → scored, high confidence");
  assert(scoreEdgeStrength({}).strength === null && scoreEdgeStrength({}).confidence === "low", "edge with no inputs → null strength (never fake 0)");
  assert(scoreEdgeStrength({ recencyDays: 0 }).strength === 100, "freshest recency → 100");
  assert(scoreEdgeStrength({ recencyDays: 180 }).strength === 0, "stale recency (180d) → 0 (real, single data point)");

  // 3) Confidence buckets.
  console.log("\nConfidence buckets:");
  assert(confidenceFromDataPoints(3) === "high" && confidenceFromDataPoints(1) === "medium" && confidenceFromDataPoints(0) === "low", "data-point count → confidence bucket");

  // 4) Graph assembly + duplicate/dangling prevention.
  console.log("\nGraph assembly:");
  const nodes = [
    node({ id: "ag1", nodeType: "agency", metadata: { threat: 80 } }),
    node({ id: "ag2", nodeType: "agency", metadata: { threat: 20 } }),
    node({ id: "agent1", nodeType: "agent" }),
    node({ id: "city1", nodeType: "city" }),
    node({ id: "sig1", nodeType: "signal" }),
    node({ id: "prop1", nodeType: "property" }),
  ];
  const edges = [
    edge("agent1", "ag1", "belongs_to"),
    edge("ag1", "city1", "dominates"),
    edge("ag2", "city1", "dominates"),
    edge("ag1", "sig1", "triggered_signal"),
    edge("prop1", "city1", "located_in"),
    edge("ag1", "ghost", "competes_with"), // dangling — endpoint not in node set
  ];
  const g = assemble(nodes, edges);
  assert(g.edges.length === 5, "dangling edge (missing endpoint) is dropped");
  assert(g.stats.totalNodes === 6 && g.stats.agencies === 2 && g.stats.agents === 1, "stats: node + type counts");
  assert(g.stats.territories === 1 && g.stats.activeSignals === 1 && g.stats.properties === 1, "stats: territories/signals/properties");
  assert(g.stats.highThreatCompetitors === 1, "stats: high-threat competitors (threat ≥ 70)");

  // 5) Confidence summary.
  console.log("\nConfidence summary:");
  const withScores = [node({ id: "n1", nodeType: "agency", importanceScore: 80, confidence: "high" }), node({ id: "n2", nodeType: "agent", confidence: "low" })];
  const conf = buildConfidence(withScores);
  assert(conf.high === 1 && conf.low === 1 && conf.scoredNodes === 1 && conf.unscoredNodes === 1, "confidence summary counts scored vs unscored");

  // 6) Subgraph networks.
  console.log("\nSubgraph networks:");
  const agencyNet = subgraphFrom(nodes, edges, "ag1", 2);
  const ids = new Set(agencyNet.nodes.map((n) => n.id));
  assert(ids.has("ag1") && ids.has("agent1") && ids.has("city1") && ids.has("sig1"), "agency network reaches agent, territory, signal");
  assert(ids.has("ag2") && ids.has("prop1"), "agency network depth-2 reaches competitor + property via shared city");
  const depth1 = subgraphFrom(nodes, edges, "ag1", 1);
  assert(new Set(depth1.nodes.map((n) => n.id)).size < ids.size, "depth-1 network is smaller than depth-2");
  const territoryNet = subgraphFrom(nodes, edges, "city1", 1);
  const tids = new Set(territoryNet.nodes.map((n) => n.id));
  assert(tids.has("ag1") && tids.has("ag2") && tids.has("prop1"), "territory network reaches dominating agencies + located property");
  const signalNet = subgraphFrom(nodes, edges, "sig1", 1);
  assert(new Set(signalNet.nodes.map((n) => n.id)).has("ag1") && signalNet.nodes.length === 2, "signal network reaches its triggering agency only");
  assert(subgraphFrom(nodes, edges, "missing", 2).nodes.length === 0, "unknown center → empty subgraph (honest)");
  // duplicate prevention: a node visited via multiple paths appears once
  assert(agencyNet.nodes.length === new Set(agencyNet.nodes.map((n) => n.id)).size, "no duplicate nodes in subgraph");

  // 7) Idempotent / deterministic scoring.
  console.log("\nDeterminism:");
  assert(JSON.stringify(scoreAgencyNode({ overall: 80, threat: 60, momentum: 40, activeSignals: 5 })) === JSON.stringify(ag), "identical input → identical score (idempotent build)");

  console.log(`\n${failures === 0 ? "✅ ALL RAIN GRAPH CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
