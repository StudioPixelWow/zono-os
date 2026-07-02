// ============================================================================
// 🕸️ Relationship Graph — Decision influence (pure). 27.9. Part 7.
// Relationship strength influences recommendation confidence: strong verified
// relationships increase it, weak relationships lower it. Advisory adapter —
// the Decision Engine itself is not modified; a consumer applies the delta.
// ============================================================================
import { clamp } from "./edge";
import type { EntityGraph, RelationshipEdge, RelationshipInfluence, VerificationLevel } from "./types";

const VER_WEIGHT: Record<VerificationLevel, number> = { verified: 1, corroborated: 0.7, single_source: 0.4, unverified: 0.2 };

/** Per-entity confidence influence from its relationships. */
export function relationshipInfluences(graph: EntityGraph): RelationshipInfluence[] {
  const byEntity = new Map<string, RelationshipEdge[]>();
  for (const e of graph.edges) {
    (byEntity.get(e.from) ?? byEntity.set(e.from, []).get(e.from)!).push(e);
    (byEntity.get(e.to) ?? byEntity.set(e.to, []).get(e.to)!).push(e);
  }
  const names = new Map(graph.nodes.map((n) => [n.id, n.name]));

  const out: RelationshipInfluence[] = [];
  for (const [id, edges] of byEntity) {
    const node = graph.nodes.find((n) => n.id === id);
    if (!node || (node.type !== "office" && node.type !== "broker")) continue;
    const avgStrength = Math.round(edges.reduce((s, e) => s + e.strength, 0) / edges.length);
    const maxStrength = Math.max(...edges.map((e) => e.strength));
    const bestVer = edges.reduce<VerificationLevel>((acc, e) => (VER_WEIGHT[e.verification] > VER_WEIGHT[acc] ? e.verification : acc), "unverified");
    // Blend average with the strongest relationship so a strong verified tie lifts confidence.
    const metric = 0.6 * avgStrength + 0.4 * maxStrength;
    const raw = ((metric - 50) / 4) * VER_WEIGHT[bestVer];
    const delta = Math.max(-15, Math.min(15, Math.round(raw)));
    const direction = delta > 1 ? "increase" : delta < -1 ? "decrease" : "neutral";
    out.push({
      entityId: id, entityName: names.get(id) ?? id, avgStrength, direction, delta, verification: bestVer,
      note: direction === "increase"
        ? `קשרים חזקים (${avgStrength}) → העלה ביטחון בהמלצות ל${names.get(id) ?? id} (+${delta}).`
        : direction === "decrease"
        ? `קשרים חלשים (${avgStrength}) → הורד ביטחון בהמלצות ל${names.get(id) ?? id} (${delta}).`
        : `קשרים נייטרליים (${avgStrength}) — אין שינוי ביטחון.`,
    });
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** Apply the relationship deltas to decisions keyed by entity (DE untouched). */
export function applyInfluenceToDecisions<T extends { entityId: string; confidence: number }>(
  decisions: T[], influences: RelationshipInfluence[],
): (T & { adjustedConfidence: number; relationshipNote: string | null })[] {
  const byId = new Map(influences.map((i) => [i.entityId, i]));
  return decisions.map((d) => {
    const inf = byId.get(d.entityId);
    return { ...d, adjustedConfidence: clamp(d.confidence + (inf?.delta ?? 0)), relationshipNote: inf ? inf.note : null };
  });
}
