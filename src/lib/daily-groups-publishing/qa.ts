// ============================================================================
// 📣 ZONO — Daily FB Groups Publishing — offline self-check (pure). 49.0.
// Verifies the assembler: property grouping, per-group de-dupe, 15-group cap +
// overflow surfacing, overdue detection, folder chips, and actionable filtering.
// Runnable with `node` (no DB, no network).
// ============================================================================
import { assembleDailyGroupsPublishing } from "./assemble";
import { MAX_GROUPS_PER_PROPERTY, type PublishInputRow } from "./types";

let seq = 0;
function row(over: Partial<PublishInputRow> = {}): PublishInputRow {
  seq++;
  return {
    postId: over.postId ?? `p${seq}`, propertyId: "prop-1", propertyTitle: "דירה בתל אביב", propertyCity: "תל אביב",
    propertyImage: null, groupId: over.groupId ?? `g${seq}`, groupName: over.groupName ?? `קבוצה ${seq}`,
    groupUrl: "https://facebook.com/groups/x", category: over.category ?? "תל אביב", city: "תל אביב",
    membersCount: 1000, requiresMembership: true, title: "כותרת", text: "טקסט מוכן להעתקה", hashtags: ["#נדלן"],
    cta: "צרו קשר", imageUrl: null, scheduledAt: over.scheduledAt ?? "2026-07-06T09:00:00.000Z", status: over.status ?? "scheduled",
    externalPostUrl: null, ...over,
  };
}

export interface Check { name: string; pass: boolean }
export interface SelfCheck { ok: boolean; total: number; passed: number; checks: Check[] }

export function runSelfCheck(): SelfCheck {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });
  const today = "2026-07-06";

  // 1. Basic grouping by property.
  seq = 0;
  const p1 = assembleDailyGroupsPublishing([
    row({ propertyId: "prop-1", groupId: "g1" }),
    row({ propertyId: "prop-1", groupId: "g2" }),
    { ...row({ propertyId: "prop-2", groupId: "g3" }), propertyTitle: "פנטהאוז", propertyCity: "הרצליה" },
  ], today);
  add("groups by property (2 properties)", p1.totalProperties === 2);
  add("counts total posts", p1.totalPosts === 3);

  // 2. Non-actionable statuses excluded.
  seq = 0;
  const p2 = assembleDailyGroupsPublishing([
    row({ groupId: "g1", status: "published" }),
    row({ groupId: "g2", status: "cancelled" }),
    row({ groupId: "g3", status: "scheduled" }),
  ], today);
  add("excludes published/cancelled, keeps scheduled", p2.totalPosts === 1);

  // 3. Posts without a property are dropped.
  seq = 0;
  const p3 = assembleDailyGroupsPublishing([{ ...row({ groupId: "g1" }), propertyId: null }], today);
  add("drops post with no property", p3.totalPosts === 0 && !p3.hasWork);

  // 4. Per-group de-dupe (earliest kept).
  seq = 0;
  const p4 = assembleDailyGroupsPublishing([
    row({ postId: "late", groupId: "gX", scheduledAt: "2026-07-06T18:00:00.000Z" }),
    row({ postId: "early", groupId: "gX", scheduledAt: "2026-07-06T08:00:00.000Z" }),
  ], today);
  add("de-dupes same group to one card", p4.properties[0].cards.length === 1);
  add("keeps earliest post per group", p4.properties[0].cards[0].postId === "early");

  // 5. 15-group cap + overflow surfaced (never dropped from the count).
  seq = 0;
  const many: PublishInputRow[] = [];
  for (let i = 0; i < 20; i++) many.push(row({ groupId: `grp-${i}` }));
  const p5 = assembleDailyGroupsPublishing(many, today);
  add("caps shown cards at 15", p5.properties[0].cards.length === MAX_GROUPS_PER_PROPERTY);
  add("surfaces overflow (5)", p5.properties[0].overflow === 5);
  add("totalGroups keeps full count (20)", p5.properties[0].totalGroups === 20);

  // 6. Overdue detection + ordering.
  seq = 0;
  const p6 = assembleDailyGroupsPublishing([
    row({ groupId: "gtoday", scheduledAt: "2026-07-06T09:00:00.000Z" }),
    row({ groupId: "gpast", scheduledAt: "2026-07-01T09:00:00.000Z" }),
  ], today);
  add("detects overdue post", p6.overdueCount === 1);
  add("overdue sorted first", p6.properties[0].cards[0].overdue === true);

  // 7. Folder chips derived from categories.
  seq = 0;
  const p7 = assembleDailyGroupsPublishing([
    row({ groupId: "a", category: "יוקרה" }),
    row({ groupId: "b", category: "יוקרה" }),
    row({ groupId: "c", category: "השקעות" }),
  ], today);
  const luxury = p7.folders.find((f) => f.name === "יוקרה");
  add("folder chip counts categories", !!luxury && luxury.count === 2 && p7.folders.length === 2);

  // 8. Assurance note present.
  add("carries 'nothing automatic' note", p1.note.includes("אוטומטית"));

  // 9. Empty input → no work.
  add("empty input → no work", !assembleDailyGroupsPublishing([], today).hasWork);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
