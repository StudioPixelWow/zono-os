// ============================================================================
// 🕸️ Relationship Graph — Chief-of-Staff reasoning (pure). 27.9. Part 6.
// Lets the Chief of Staff reason over relationships: "this broker collaborates
// frequently with Office X", "this seller already worked with Broker Y", "this
// office repeatedly exchanges listings with Office Z". Grounded in real edges;
// CoS is not modified — it consumes these answers read-only.
// ============================================================================
import type { EntityGraph, RelationshipEdge, RelationshipAnswer } from "./types";

const nameMap = (g: EntityGraph) => new Map(g.nodes.map((n) => [n.id, n.name]));
const confOf = (e: RelationshipEdge) => e.confidence;

export function buildRelationshipAnswers(graph: EntityGraph): RelationshipAnswer[] {
  const names = nameMap(graph);
  const out: RelationshipAnswer[] = [];
  const byType = (t: string) => graph.edges.filter((e) => e.type === t).sort((a, b) => b.strength - a.strength);

  // Broker ↔ office collaboration / employment.
  const bo = [...byType("collaborated").filter((e) => e.fromType === "broker" && e.toType === "office"), ...byType("works_at")][0]
    ?? byType("works_at")[0];
  if (bo) out.push({ statement: `${names.get(bo.from) ?? bo.from} עובד/משתף פעולה תדיר עם ${names.get(bo.to) ?? bo.to} (${bo.occurrences} אינטראקציות).`, evidence: bo.evidence, confidence: confOf(bo) });

  // Seller/buyer already worked with a broker.
  const sb = graph.edges.filter((e) => (e.fromType === "seller" || e.fromType === "buyer") && e.toType === "broker").sort((a, b) => b.strength - a.strength)[0]
    ?? byType("represents")[0];
  if (sb) out.push({ statement: `${names.get(sb.from) ?? sb.from} כבר עבד עם ${names.get(sb.to) ?? sb.to}.`, evidence: sb.evidence, confidence: confOf(sb) });

  // Office ↔ office listing exchange / competition.
  const oo = [...byType("collaborated").filter((e) => e.fromType === "office" && e.toType === "office"), ...byType("competed_with")][0];
  if (oo) out.push({ statement: `${names.get(oo.from) ?? oo.from} מחליף/מתחרה מלאי שוב ושוב עם ${names.get(oo.to) ?? oo.to} (${oo.occurrences} מקרים).`, evidence: oo.evidence, confidence: confOf(oo) });

  if (!out.length) out.push({ statement: "אין עדיין קשרים מספיקים כדי להסיק מסקנות.", evidence: [], confidence: 0 });
  return out;
}
