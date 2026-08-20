// ============================================================================
// ZONO — Notification cross-source collapse (PURE, client-safe, no imports).
// One business issue surfaced by several engines (attention + opportunity + radar
// + kernel) must appear as ONE in-app row. Rows sharing a (entity, category) key
// are collapsed to the highest-priority source; genuinely distinct events — and
// any row without an entity — are preserved. Extracted from notifications/service
// so the behavior is unit-testable without the server/DB layer.
// ============================================================================

/** Source priority (higher wins as the canonical row), keyed by the item-key prefix
 *  (e.g. "notif:123" → "notif"). Kernel notifications are authoritative. */
export const SOURCE_RANK: Record<string, number> = {
  notif: 5, attention: 4, leak: 3, opp: 2, radar: 2, mkt: 2, fc: 1, comp: 1,
};

export interface CollapsibleNotif {
  key: string; category: string; score: number; read: boolean; pinned: boolean; createdAt: string;
  entityType?: string | null; entityId?: string | null;
}

/**
 * Collapse cross-source duplicates. Two rows collapse only when they share a
 * non-null `${entityType}:${entityId}:${category}` key. The survivor keeps the
 * higher-ranked source, the max score, stays unread if ANY contributor is unread,
 * is pinned if ANY is pinned, and keeps the most recent timestamp. Order-stable:
 * the first occurrence's slot is retained.
 */
export function collapseNotifications<T extends CollapsibleNotif>(
  items: T[], rank: Record<string, number> = SOURCE_RANK,
): T[] {
  const collapsed: T[] = [];
  const byBiz = new Map<string, number>();
  for (const it of items) {
    const bizKey = it.entityId ? `${it.entityType ?? ""}:${it.entityId}:${it.category}` : null;
    if (!bizKey) { collapsed.push(it); continue; }
    const idx = byBiz.get(bizKey);
    if (idx === undefined) { byBiz.set(bizKey, collapsed.length); collapsed.push(it); continue; }
    const prev = collapsed[idx];
    const prevRank = rank[prev.key.split(":")[0]] ?? 0;
    const curRank = rank[it.key.split(":")[0]] ?? 0;
    const keep = curRank > prevRank ? it : prev;
    const drop = keep === it ? prev : it;
    collapsed[idx] = {
      ...keep,
      score: Math.max(keep.score, drop.score),
      read: keep.read && drop.read,
      pinned: keep.pinned || drop.pinned,
      createdAt: keep.createdAt >= drop.createdAt ? keep.createdAt : drop.createdAt,
    };
  }
  return collapsed;
}
