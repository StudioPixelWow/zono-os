// ============================================================================
// Matching Intelligence — bounded, deterministic candidate SCAN (PURE).
// 9.7 MATCHING SCALE. No DB, no "server-only", no @/ imports: the paging DECISION
// logic lives here so it is unit-testable and shared by the event recompute and the
// daily reconcile. The actual row fetch is INJECTED as a callback, so this module
// never "selects everything" — it caps in-memory rows at `ceiling` and reports
// HONEST truncation (total vs scanned) with a resume cursor. This is the single
// place the buyer/property paths get their "bounded batch → cursor → completion"
// contract; the canonical scoring brain (scoring.ts) is untouched.
// ============================================================================

export const MATCH_SCAN = {
  /** PostgREST-safe page size — a single .limit() above the server max-rows cap
   *  (commonly 1000) is silently truncated, so we page at 1000 and never above. */
  PAGE_SIZE: 1000,
  /** Buyer event path: max candidate PROPERTIES scanned for one buyer. Covers the
   *  5,000-property launch target with headroom; beyond it → truncated=true. */
  MAX_SCAN_PROPERTIES: 6000,
  /** Property event path: max candidate BUYERS scanned for one property. Covers the
   *  2,000-buyer launch target with headroom; beyond it → truncated=true. */
  MAX_SCAN_BUYERS: 4000,
  /** Daily reconcile: orgs processed per nightly run (replaces a silent .limit(100)
   *  that left org #101+ permanently unreconciled). Deterministically ordered +
   *  observable so any overflow is reported, never silent. */
  RECONCILE_ORG_CEILING: 1000,
  /** Buyer matches overview: matches surfaced to the internal buyer page. We fetch
   *  SHOWN+1 so the UI can honestly say "there are more" without a second query. */
  OVERVIEW_SHOWN: 80,
} as const;

export interface PagedScan<T> {
  rows: T[];
  scanned: number;
  total: number;
  truncated: boolean;
  nextCursor: string | null;
}

/**
 * Deterministic cursor scan. `fetchPage(cursor, limit)` MUST return rows ordered by
 * `keyOf` ASCENDING (so paging is stable + resumable); `countTotal()` returns the
 * true candidate count (a `head:true, count:'exact'` probe). Pages until the source
 * is exhausted OR `ceiling` rows are in memory — never more, so work stays bounded.
 * `truncated` is true iff more candidates exist than were scanned; `nextCursor` is
 * the key to resume from. Idempotent + side-effect free (all effects are the
 * caller's persistence, which upserts on a unique key).
 */
export async function boundedScan<T>(
  fetchPage: (cursor: string | null, limit: number) => Promise<T[]>,
  keyOf: (row: T) => string,
  countTotal: () => Promise<number>,
  ceiling: number,
  pageSize: number = MATCH_SCAN.PAGE_SIZE,
): Promise<PagedScan<T>> {
  const rows: T[] = [];
  let cursor: string | null = null;
  while (rows.length < ceiling) {
    const want = Math.min(pageSize, ceiling - rows.length);
    const page = await fetchPage(cursor, want);
    if (page.length === 0) break;
    rows.push(...page);
    cursor = keyOf(page[page.length - 1]);
    if (page.length < want) break; // partial page → source exhausted
  }
  const total = await countTotal();
  const truncated = total > rows.length;
  return {
    rows,
    scanned: rows.length,
    total,
    truncated,
    nextCursor: truncated && rows.length ? keyOf(rows[rows.length - 1]) : null,
  };
}

/**
 * UI honesty helper. Rows are fetched with `limit = shown + 1` so the caller can tell
 * there are MORE matches than the page shows, without a second query. Returns the
 * honest completeness for the overview: `hasMore` (do NOT claim a complete universe)
 * and the clamped `shown` count. No fake progress percentage.
 */
export function pageCompleteness(returnedCount: number, shown: number): { hasMore: boolean; shown: number } {
  return { hasMore: returnedCount > shown, shown: Math.min(returnedCount, shown) };
}
