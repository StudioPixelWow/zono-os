// ============================================================================
// ZONO Brokerage Knowledge — Duplicate Cluster engine (pure).
// Groups near-duplicate offices/agents into clusters (union-find over a
// similarity scorer), picks a suggested master record, and produces a merge
// recommendation + explanation. Deterministic; replaces conflict-only thinking.
// ============================================================================
import type { ClusterItem, DuplicateCluster, KnowledgeEntityType, ClusterRecommendation } from "./types";

const MERGE = 90, REVIEW = 70;

function recommendation(confidence: number): ClusterRecommendation {
  if (confidence >= MERGE) return "merge";
  if (confidence >= REVIEW) return "review";
  return "keep_separate";
}

/**
 * Build duplicate clusters. `score(a,b)` returns 0..100 similarity; pairs at or
 * above `threshold` are united. Returns clusters of size ≥ 2 only. The master is
 * the member with the highest masterScore (e.g. completeness×confidence).
 */
export function buildClusters(
  entityType: KnowledgeEntityType,
  items: ClusterItem[],
  score: (a: ClusterItem, b: ClusterItem) => { score: number; reasons: string[] },
  threshold = REVIEW,
): DuplicateCluster[] {
  const n = items.length;
  const parent = items.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  // pairwise similarity (O(n²) — callers cap n per city/batch).
  const pairScore = new Map<string, { score: number; reasons: string[] }>();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = score(items[i], items[j]);
      if (r.score >= threshold) { union(i, j); pairScore.set(`${i}_${j}`, r); }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) { const root = find(i); (groups.get(root) ?? groups.set(root, []).get(root)!).push(i); }

  const clusters: DuplicateCluster[] = [];
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    // cluster confidence = average of the within-cluster qualifying pair scores.
    let sum = 0, count = 0;
    for (let a = 0; a < idxs.length; a++) for (let b = a + 1; b < idxs.length; b++) {
      const key = idxs[a] < idxs[b] ? `${idxs[a]}_${idxs[b]}` : `${idxs[b]}_${idxs[a]}`;
      const p = pairScore.get(key); if (p) { sum += p.score; count++; }
    }
    const confidence = count ? Math.round(sum / count) : threshold;
    const masterIdx = idxs.reduce((best, i) => (items[i].masterScore > items[best].masterScore ? i : best), idxs[0]);
    const master = items[masterIdx];
    const members = idxs.map((i) => {
      // similarity-to-master (best qualifying pair, else the cluster confidence).
      const key = i < masterIdx ? `${i}_${masterIdx}` : `${masterIdx}_${i}`;
      const p = pairScore.get(key);
      return {
        id: items[i].id, label: items[i].label, similarity: i === masterIdx ? 100 : (p?.score ?? confidence),
        isMaster: i === masterIdx, reasons: p?.reasons ?? [],
      };
    });
    const rec = recommendation(confidence);
    const explanation = rec === "merge"
      ? `${members.length} רשומות זוהו כאותו ${entityType === "office" ? "משרד" : "סוכן"} (ביטחון ${confidence}%). מומלץ למזג ל"${master.label}".`
      : rec === "review"
        ? `${members.length} רשומות דומות מאוד (ביטחון ${confidence}%) — מומלץ לבדוק לפני מיזוג.`
        : `${members.length} רשומות עם דמיון חלקי — כנראה ישויות נפרדות.`;
    clusters.push({ entityType, city: master.city ?? null, confidence, masterId: master.id, recommendation: rec, explanation, members });
  }
  return clusters.sort((a, b) => b.confidence - a.confidence);
}
