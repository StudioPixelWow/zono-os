// ============================================================================
// 🕸️ Relationship Graph — network analysis (pure). 27.9. Part 4.
// Most connected broker, most influential office, strongest/weak relationships,
// disconnected entities, hidden opportunities (2-hop shared neighbours), and an
// overall network-health score. Deterministic; evidence-only.
// ============================================================================
import { clamp } from "./edge";
import type { EntityGraph, NetworkAnalysis, RankedNode, HiddenOpportunity, GraphNode } from "./types";

const rank = (n: GraphNode): RankedNode => ({ id: n.id, name: n.name, type: n.type, degree: n.degree, weightedDegree: n.weightedDegree });

export function analyzeNetwork(graph: EntityGraph): NetworkAnalysis {
  const { nodes, edges } = graph;

  const brokers = nodes.filter((n) => n.type === "broker").sort((a, b) => b.degree - a.degree || b.weightedDegree - a.weightedDegree);
  const offices = nodes.filter((n) => n.type === "office").sort((a, b) => b.weightedDegree - a.weightedDegree || b.degree - a.degree);
  const disconnected = nodes.filter((n) => n.degree === 0);

  const strongest = [...edges].sort((a, b) => b.strength - a.strength).slice(0, 10);
  const weak = edges.filter((e) => e.strength < 40).sort((a, b) => a.strength - b.strength).slice(0, 10);

  // ── Hidden opportunities: entities sharing ≥2 neighbours but not directly linked.
  const adj = new Map<string, Set<string>>();
  const direct = new Set<string>();
  const nameOf = new Map<string, string>(nodes.map((n) => [n.id, n.name]));
  const typeOf = new Map<string, GraphNode["type"]>(nodes.map((n) => [n.id, n.type]));
  for (const e of edges) {
    (adj.get(e.from) ?? adj.set(e.from, new Set()).get(e.from)!).add(e.to);
    (adj.get(e.to) ?? adj.set(e.to, new Set()).get(e.to)!).add(e.from);
    direct.add(e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`);
  }
  const pairShared = new Map<string, number>();
  for (const [, neighbours] of adj) {
    const arr = [...neighbours];
    if (arr.length > 60) continue;                    // skip hubs to stay bounded
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const [a, b] = arr[i] < arr[j] ? [arr[i], arr[j]] : [arr[j], arr[i]];
      if (direct.has(`${a}|${b}`)) continue;
      pairShared.set(`${a}|${b}`, (pairShared.get(`${a}|${b}`) ?? 0) + 1);
    }
  }
  const hiddenOpportunities: HiddenOpportunity[] = [...pairShared.entries()]
    .filter(([, c]) => c >= 2)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 10)
    .map(([key, shared]) => {
      const [a, b] = key.split("|");
      const ta = typeOf.get(a), tb = typeOf.get(b);
      const suggestion = ta === "office" && tb === "office" ? "שיתוף פעולה/החלפת מלאי פוטנציאלי בין המשרדים"
        : (ta === "broker" && tb === "office") || (ta === "office" && tb === "broker") ? "הזדמנות גיוס — מתווך קרוב למשרד ללא העסקה"
        : "הכרות/הפניה פוטנציאלית";
      return { a, b, aName: nameOf.get(a) ?? a, bName: nameOf.get(b) ?? b, sharedNeighbors: shared, suggestion, evidence: [`${shared} קשרים משותפים`] };
    });

  // ── Network health ───────────────────────────────────────────────────────────
  const connectedRatio = nodes.length ? (nodes.length - disconnected.length) / nodes.length : 0;
  const avgStrength = edges.length ? edges.reduce((s, e) => s + e.strength, 0) / edges.length : 0;
  const verifiedRatio = edges.length ? edges.filter((e) => e.verification === "verified" || e.verification === "corroborated").length / edges.length : 0;
  const networkHealth = clamp(connectedRatio * 40 + (avgStrength / 100) * 35 + verifiedRatio * 25);

  return {
    mostConnectedBrokers: brokers.slice(0, 10).map(rank),
    mostInfluentialOffices: offices.slice(0, 10).map(rank),
    strongestRelationships: strongest,
    weakRelationships: weak,
    disconnectedEntities: disconnected.slice(0, 10).map(rank),
    hiddenOpportunities,
    networkHealth,
  };
}
