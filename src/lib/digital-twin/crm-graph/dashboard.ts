// ============================================================================
// 🔗 CRM Relationship Graph Integration — dashboard + Chief-of-Staff view (pure).
// 28.4. Strongest buyer/property matches, seller/property links, seller/
// valuation links, duplicate/related leads, relationship gaps and conversion
// paths — plus the CoS understanding of CRM relationships. Evidence-only.
// ============================================================================
import type { EntityGraph, RelationshipEdge, NetworkAnalysis } from "@/lib/relationship-graph";

export interface EdgeView { from: string; fromName: string; to: string; toName: string; type: string; strength: number; verification: string; evidence: string[] }
export interface ConversionPath { lead: string; via: string; steps: string[]; strength: number }
export interface CrmGap { id: string; name: string; type: string; note: string }
export interface CrmDashboard {
  totals: { nodes: number; edges: number; conversions: number; buyerPropertyLinks: number; sellerPropertyLinks: number; duplicates: number; gaps: number };
  strongestBuyerPropertyMatches: EdgeView[];
  sellerPropertyLinks: EdgeView[];
  sellerValuationLinks: EdgeView[];
  duplicateLeads: EdgeView[];
  conversionPaths: ConversionPath[];
  brokerOwnership: { broker: string; count: number; entities: string[] }[];
  relationshipGaps: CrmGap[];
  chiefOfStaffStatements: string[];
  networkHealth: number;
}

const CRM_TYPES = new Set(["buyer", "seller", "lead"]);

export function buildCrmDashboard(graph: EntityGraph, network: NetworkAnalysis): CrmDashboard {
  const nameOf = new Map(graph.nodes.map((n) => [n.id, n.name]));
  const typeOf = new Map(graph.nodes.map((n) => [n.id, n.type]));
  const nm = (id: string) => nameOf.get(id) ?? id;

  const view = (e: RelationshipEdge): EdgeView => ({ from: e.from, fromName: nm(e.from), to: e.to, toName: nm(e.to), type: e.type, strength: e.strength, verification: e.verification, evidence: e.evidence });
  const byType = (t: string) => graph.edges.filter((e) => e.type === t);

  const buyerProp = byType("interested_in").filter((e) => e.fromType === "buyer").sort((a, b) => b.strength - a.strength);
  const sellerProp = byType("owns").filter((e) => e.fromType === "seller").sort((a, b) => b.strength - a.strength);
  const sellerVal = byType("valued_by").sort((a, b) => b.strength - a.strength);
  const dupes = byType("duplicate_of");
  const converts = byType("converted_to");

  // Conversion paths: lead → buyer/seller → (property / valuation).
  const conversionPaths: ConversionPath[] = converts.map((c) => {
    const target = c.to;
    const followups = graph.edges.filter((e) => e.from === target && ["interested_in", "owns", "valued_by"].includes(e.type));
    const steps = [`ליד ${nm(c.from)}`, `${typeOf.get(target) === "buyer" ? "קונה" : "מוכר"} ${nm(target)}`, ...followups.slice(0, 1).map((f) => `${nm(f.to)}`)];
    return { lead: nm(c.from), via: typeOf.get(target) ?? "", steps, strength: c.strength };
  }).sort((a, b) => b.strength - a.strength);

  // Broker ownership.
  const ownerMap = new Map<string, Set<string>>();
  for (const e of byType("managed_by")) (ownerMap.get(e.to) ?? ownerMap.set(e.to, new Set()).get(e.to)!).add(e.from);
  const brokerOwnership = [...ownerMap.entries()].map(([broker, ents]) => ({ broker: nm(broker), count: ents.size, entities: [...ents].map(nm).slice(0, 6) })).sort((a, b) => b.count - a.count);

  // Relationship gaps — CRM entities with no live edges.
  const relationshipGaps: CrmGap[] = graph.nodes
    .filter((n) => CRM_TYPES.has(String(n.type)) && n.degree === 0)
    .slice(0, 12)
    .map((n) => ({ id: n.id, name: n.name, type: String(n.type), note: "אין קשרים חיים — חבר לנכס/מתווך/משימה" }));

  // Chief-of-Staff statements.
  const cos: string[] = [];
  const convBuyers = converts.filter((e) => e.toType === "buyer").length;
  const convSellers = converts.filter((e) => e.toType === "seller").length;
  if (convBuyers || convSellers) cos.push(`${convBuyers} לידים הומרו לקונים ו-${convSellers} למוכרים.`);
  if (buyerProp.length) cos.push(`הקונה "${nm(buyerProp[0].from)}" מקושר לנכס "${nm(buyerProp[0].to)}" (עוצמה ${buyerProp[0].strength}).`);
  if (sellerVal.length) cos.push(`המוכר "${nm(sellerVal[0].from)}" מקושר להערכת שווי.`);
  if (brokerOwnership.length) cos.push(`המתווך "${brokerOwnership[0].broker}" מנהל ${brokerOwnership[0].count} קשרי CRM.`);
  if (dupes.length) cos.push(`${dupes.length} זוגות לידים כפולים זוהו.`);
  if (!cos.length) cos.push("אין עדיין קשרי CRM — צור לידים/קונים/מוכרים והתאמות.");

  return {
    totals: { nodes: graph.counts.nodes, edges: graph.counts.edges, conversions: converts.length, buyerPropertyLinks: buyerProp.length, sellerPropertyLinks: sellerProp.length, duplicates: dupes.length, gaps: relationshipGaps.length },
    strongestBuyerPropertyMatches: buyerProp.slice(0, 10).map(view),
    sellerPropertyLinks: sellerProp.slice(0, 10).map(view),
    sellerValuationLinks: sellerVal.slice(0, 10).map(view),
    duplicateLeads: dupes.slice(0, 10).map(view),
    conversionPaths: conversionPaths.slice(0, 10),
    brokerOwnership: brokerOwnership.slice(0, 8),
    relationshipGaps,
    chiefOfStaffStatements: cos,
    networkHealth: network.networkHealth,
  };
}
