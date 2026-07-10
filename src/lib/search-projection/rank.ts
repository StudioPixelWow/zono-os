// ============================================================================
// 🥇 ZONO OS 2.0 — Stage 4 · Search ranking (PURE).
// Ranks canonical search_documents candidates deterministically:
//   tier 0 exact title · tier 1 title prefix · tier 2 all-tokens (AND) ·
//   tier 3 partial. Exact/name matches always outrank fuzzy partials. Dedups by
//   (entity_type, entity_id) keeping the best tier. Skips broken routes (records
//   the count). Stable ordering: tier asc → source_updated_at desc → id asc.
// Pure + deterministic + offline-testable — the service supplies fetched rows.
// ============================================================================
import { foldForMatch, tokenize } from "./normalize";

export interface RankableDoc {
  entity_type: string;
  entity_id: string;
  title: string;
  subtitle: string | null;
  normalized_text: string;
  route: string | null;
  source_updated_at: string | null;
}

export interface RankedHit extends RankableDoc { tier: number }

export interface RankResult { hits: RankedHit[]; skippedBrokenRoutes: number; skippedNoMatch: number }

function isValidRoute(route: string | null): boolean {
  return typeof route === "string" && route.startsWith("/") && route.length > 1;
}

/**
 * Rank + dedup + route-filter the candidate docs for a folded query.
 * `folded` = foldForMatch(query); `tokens` = its tokens. Deterministic.
 */
export function rankSearchDocs(docs: RankableDoc[], folded: string, tokens: string[]): RankResult {
  let skippedBrokenRoutes = 0;
  let skippedNoMatch = 0;
  const best = new Map<string, RankedHit>();

  for (const d of docs) {
    if (!isValidRoute(d.route)) { skippedBrokenRoutes++; continue; }
    const foldedTitle = foldForMatch(d.title);
    const hay = d.normalized_text || foldedTitle;
    let tier: number;
    if (foldedTitle === folded) tier = 0;
    else if (folded.length > 0 && foldedTitle.startsWith(folded)) tier = 1;
    else if (tokens.length > 0 && tokens.every((t) => hay.includes(t))) tier = 2;
    else if (folded.length > 0 && hay.includes(folded)) tier = 3;
    else { skippedNoMatch++; continue; }

    const key = `${d.entity_type}:${d.entity_id}`;
    const prev = best.get(key);
    if (!prev || tier < prev.tier) best.set(key, { ...d, tier });
  }

  const hits = [...best.values()].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const at = a.source_updated_at ?? "";
    const bt = b.source_updated_at ?? "";
    if (at !== bt) return bt.localeCompare(at); // newer first
    return a.entity_id.localeCompare(b.entity_id); // stable tiebreak
  });

  return { hits, skippedBrokenRoutes, skippedNoMatch };
}

/** Fold + tokenize a raw query once for ranking. */
export function prepareQuery(query: string): { folded: string; tokens: string[] } {
  const folded = foldForMatch(query);
  return { folded, tokens: tokenize(folded) };
}
