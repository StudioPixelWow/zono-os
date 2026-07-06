// ============================================================================
// 📣 ZONO — Daily FB Groups Publishing — assembler (pure & deterministic). 49.0.
// Groups today's DUE Facebook-group posts by property, caps each property at
// MAX_GROUPS_PER_PROPERTY (surfacing — never discarding — any overflow), derives
// smart "folder" chips from the groups' categories, and marks overdue items.
// No I/O. No side effects. No publishing.
// ============================================================================
import {
  ACTIONABLE_STATUSES, MAX_GROUPS_PER_PROPERTY, ASSISTANT_NOTE,
  type PublishInputRow, type PublishPostCard, type PropertyPublishingGroup,
  type PublishFolder, type DailyGroupsPublishingPlan,
} from "./types";

const ACTIONABLE = new Set<string>(ACTIONABLE_STATUSES);
const dateOf = (iso: string | null): string | null => (iso ? iso.slice(0, 10) : null);

/** Build a card from a merged input row, flagging overdue against `today`. */
function toCard(r: PublishInputRow, today: string): PublishPostCard {
  const d = dateOf(r.scheduledAt);
  return {
    postId: r.postId, groupId: r.groupId, groupName: r.groupName, groupUrl: r.groupUrl,
    category: r.category, city: r.city, membersCount: r.membersCount, requiresMembership: r.requiresMembership,
    title: r.title, text: r.text, hashtags: r.hashtags, cta: r.cta, imageUrl: r.imageUrl,
    scheduledAt: r.scheduledAt, status: r.status, externalPostUrl: r.externalPostUrl,
    overdue: d != null && d < today,
  };
}

/**
 * Assemble the daily publishing plan.
 * @param rows   merged post+property+group rows (any statuses; filtered here).
 * @param today  YYYY-MM-DD of "today" (caller supplies to stay pure/testable).
 */
export function assembleDailyGroupsPublishing(rows: PublishInputRow[], today: string): DailyGroupsPublishingPlan {
  // Only actionable, not-yet-published posts belong in the daily checklist.
  const actionable = rows.filter((r) => ACTIONABLE.has(r.status) && !!r.propertyId);

  // Group by property.
  const byProp = new Map<string, PublishInputRow[]>();
  for (const r of actionable) {
    const k = r.propertyId as string;
    const bucket = byProp.get(k) ?? byProp.set(k, []).get(k)!;
    bucket.push(r);
  }

  const properties: PropertyPublishingGroup[] = [];
  const folderCounts = new Map<string, number>();
  let totalPosts = 0;
  let overdueTotal = 0;

  for (const [propertyId, propRows] of byProp) {
    // De-dupe by group (a property may have several posts to the same group today;
    // show the earliest actionable one per group so the checklist is one-per-group).
    const byGroup = new Map<string, PublishInputRow>();
    const noGroup: PublishInputRow[] = [];
    for (const r of propRows) {
      if (!r.groupId) { noGroup.push(r); continue; }
      const prev = byGroup.get(r.groupId);
      if (!prev || (r.scheduledAt ?? "") < (prev.scheduledAt ?? "")) byGroup.set(r.groupId, r);
    }
    const distinct = [...byGroup.values(), ...noGroup];

    // Sort: overdue first, then earliest scheduled, then group name.
    distinct.sort((a, b) => {
      const ao = (dateOf(a.scheduledAt) ?? "") < today ? 0 : 1;
      const bo = (dateOf(b.scheduledAt) ?? "") < today ? 0 : 1;
      if (ao !== bo) return ao - bo;
      const at = a.scheduledAt ?? "", bt = b.scheduledAt ?? "";
      if (at !== bt) return at < bt ? -1 : 1;
      return (a.groupName ?? "").localeCompare(b.groupName ?? "", "he");
    });

    const totalGroups = distinct.length;
    const shown = distinct.slice(0, MAX_GROUPS_PER_PROPERTY);
    const cards = shown.map((r) => toCard(r, today));
    const overdueCount = cards.filter((c) => c.overdue).length;

    // Folder chips (reuse the group category as the folder name).
    for (const c of cards) {
      const name = (c.category && c.category.trim()) || "כללי";
      folderCounts.set(name, (folderCounts.get(name) ?? 0) + 1);
    }

    const first = propRows[0];
    properties.push({
      propertyId,
      title: first.propertyTitle ?? "נכס",
      city: first.propertyCity,
      imageUrl: first.propertyImage,
      cards,
      totalGroups,
      overflow: Math.max(0, totalGroups - shown.length),
      overdueCount,
    });
    totalPosts += cards.length;
    overdueTotal += overdueCount;
  }

  // Order properties: those with overdue work first, then most groups to publish.
  properties.sort((a, b) => {
    if ((b.overdueCount > 0 ? 1 : 0) !== (a.overdueCount > 0 ? 1 : 0)) return (b.overdueCount > 0 ? 1 : 0) - (a.overdueCount > 0 ? 1 : 0);
    return b.cards.length - a.cards.length;
  });

  const folders: PublishFolder[] = [...folderCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    date: today,
    properties,
    folders,
    totalPosts,
    totalProperties: properties.length,
    overdueCount: overdueTotal,
    hasWork: totalPosts > 0,
    note: ASSISTANT_NOTE,
  };
}
