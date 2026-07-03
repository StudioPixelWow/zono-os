// ============================================================================
// ✅ Facebook Groups Campaign Wizard — self-tests (pure, offline). 33.2.
// folders / frequencies / gantt / anti-repetition / risk warnings / no-photos /
// content variations / safe auto-replies / no auto-publish (plan-only).
// ============================================================================
import { foldersFromGroups, generateSchedule, buildGantt, buildPlan, assessRisks, type WizardGroup } from "./planner";
import { generatePostVariations, autoReplyTemplates, type PropertyFacts } from "./content";

export interface FBCheck { name: string; pass: boolean; detail: string }
export interface FBSelfCheck { ok: boolean; total: number; passed: number; checks: FBCheck[] }

const g = (id: string, category: string | null, members = 1000): WizardGroup => ({ id, name: `קבוצה ${id}`, category, city: "חיפה", url: `https://facebook.com/groups/${id}`, membersCount: members, lastPostAt: null });
const groups: WizardGroup[] = [g("a", "דירות בקרית ביאליק", 5000), g("b", "דירות בקרית ביאליק", 3000), g("c", "יוקרה", 2000), g("d", "השקעות נדל״ן", 1500)];
const prop = (o: Partial<PropertyFacts> = {}): PropertyFacts => ({ title: "דירת 4 חדרים בקרית ביאליק", price: 1_950_000, city: "קרית ביאליק", neighborhood: "צור שלום", rooms: 4, area: 105, floor: "3", type: "apartment", amenities: ["מרפסת", "חניה", "מעלית"], summary: "דירה מרווחת ומוארת", hasPhotos: true, ...o });

export function runSelfCheck(): FBSelfCheck {
  const checks: FBCheck[] = [];
  const add = (name: string, pass: boolean, detail = "") => checks.push({ name, pass, detail });

  // Folders from category.
  const folders = foldersFromGroups(groups);
  add("group folders derived from category", folders.length === 3 && folders.some((f) => f.name === "דירות בקרית ביאליק" && f.groups.length === 2));
  add("folders sorted, groups sorted by members", folders[0].groups[0].membersCount >= folders[0].groups[folders[0].groups.length - 1].membersCount);

  // Frequencies.
  const start = "2026-07-05";
  const one = generateSchedule([g("a", null)], "one_time", start);
  add("one_time → 1 post per group", one.length === 1);
  const weekly = generateSchedule([g("a", null)], "three_weekly", start, { horizonDays: 7 });
  add("3x weekly → 3 posts in a week", weekly.length === 3);
  const daily = generateSchedule([g("a", null)], "daily", start, { horizonDays: 14 });
  add("daily → 14 posts over 14 days", daily.length === 14);
  const month = generateSchedule([g("a", null)], "full_month", start, { horizonDays: 30 });
  add("full_month → spread (~10 posts / 30 days)", month.length === 10);
  const custom = generateSchedule([g("a", null)], "custom", start, { customDates: ["2026-07-06", "2026-07-09"] });
  add("custom → uses provided dates", custom.length === 2);

  // Anti-repetition: a group never gets the same variation on consecutive posts.
  const seq = generateSchedule([g("a", null)], "daily", start, { horizonDays: 8, variations: 4 });
  let consecutiveSame = false; for (let i = 1; i < seq.length; i++) if (seq[i].variationIndex === seq[i - 1].variationIndex) consecutiveSame = true;
  add("anti-repetition: no same variation back-to-back", !consecutiveSame);

  // Gantt shape.
  const slots = generateSchedule(groups, "three_weekly", start, { horizonDays: 7 });
  const gantt = buildGantt(slots, groups);
  add("gantt rows=groups, cols=dates", gantt.rows.length === groups.length && gantt.dates.length >= 1 && gantt.rows[0].cells.length === gantt.dates.length);
  add("gantt cells carry slot or null", gantt.rows.every((r) => r.cells.every((c) => c.slot === null || c.slot.groupId === r.groupId)));

  // Risk warnings.
  const aggressive = buildPlan([g("a", null)], "daily", start, { horizonDays: 7 });
  add("aggressive daily schedule → danger/warning risk", aggressive.risks.some((r) => r.level === "danger" || r.level === "warning"));
  add("plan always includes safety note", buildPlan([g("a", null)], "one_time", start).risks.some((r) => r.level === "info"));
  add("plan is plan-only (no publish side-effects)", aggressive.totalPosts > 0 && aggressive.slots.every((s) => s.status === "draft"));

  // Content variations.
  const vars = generatePostVariations(prop(), 4);
  add("generates distinct post variations", vars.length === 4 && new Set(vars.map((v) => v.text)).size === 4);
  add("no invented numbers (only real price used)", vars.every((v) => !/₪/.test(v.text) || v.text.includes("1,950,000")));
  const noPhotos = generatePostVariations(prop({ hasPhotos: false, summary: null }), 3);
  add("property without photos still generates text", noPhotos.length === 3 && noPhotos[0].text.length > 0);
  const noPrice = generatePostVariations(prop({ price: null }), 2);
  add("no price → no price line fabricated", noPrice.every((v) => !v.text.includes("מחיר:")));

  // Safe auto-replies.
  const replies = autoReplyTemplates();
  add("auto-replies are safe (no invented price/phone)", replies.length >= 4 && replies.every((r) => !/\d{3}-?\d{7}|₪\d/.test(r.reply)));

  // Assess risks helper standalone.
  add("assessRisks flags same-day concentration", assessRisks(generateSchedule(groups, "one_time", start), groups).length >= 1);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
