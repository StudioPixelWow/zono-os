// ============================================================================
// ✅ Facebook Groups Intelligence — self-tests (pure, offline). 33.4.
// insights (strong/weak/inactive/overused/no-leads) / type tags / recommendations
// / folder intelligence / empty & large folders / prioritization / perf.
// ============================================================================
import { buildGroupsIntelligence, analyzeGroup, buildFolderIntel, type GroupStat } from "./intelligence";

export interface FBICheck { name: string; pass: boolean; detail: string }
export interface FBISelfCheck { ok: boolean; total: number; passed: number; checks: FBICheck[] }

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const g = (o: Partial<GroupStat> = {}): GroupStat => ({
  id: "g1", name: "דירות בחיפה", folder: "דירות בחיפה", city: "חיפה", propertyTypes: ["apartment"], members: 5000, status: "active",
  performance: 55, leadScore: 50, spamRisk: 10, totalPosts: 6, totalLeads: 2, lastPostAt: ago(3), lastLeadAt: ago(5), url: "https://fb/g1", ...o,
});

export function runSelfCheck(): FBISelfCheck {
  const checks: FBICheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });

  const strong = analyzeGroup(g({ performance: 82, totalLeads: 5, leadScore: 72 }));
  add("strong group insight + publish_more", strong.insights.some((i) => i.tag === "strong") && strong.insights.some((i) => i.tag === "high_engagement") && strong.recommendation.action === "publish_more");

  const noLeads = analyzeGroup(g({ performance: 30, totalPosts: 8, totalLeads: 0 }));
  add("no-leads + weak insight + publish_less", noLeads.insights.some((i) => i.tag === "no_leads") && noLeads.insights.some((i) => i.tag === "weak") && noLeads.recommendation.action === "publish_less");

  const inactive = analyzeGroup(g({ lastPostAt: ago(45), totalPosts: 4, totalLeads: 1 }));
  add("inactive insight + reengage", inactive.insights.some((i) => i.tag === "inactive") && inactive.recommendation.action === "reengage");

  const overused = analyzeGroup(g({ totalPosts: 30, totalLeads: 1 }));
  add("overused insight + publish_less", overused.insights.some((i) => i.tag === "overused") && overused.recommendation.action === "publish_less");

  const spam = analyzeGroup(g({ spamRisk: 75 }));
  add("spam risk → pause (high priority)", spam.insights.some((i) => i.tag === "spam_risk") && spam.recommendation.action === "pause" && spam.recommendation.priority >= 85);

  const luxury = analyzeGroup(g({ name: "נדל״ן יוקרה הרצליה", folder: "יוקרה" }));
  add("luxury type tag", luxury.insights.some((i) => i.tag === "luxury"));
  const invest = analyzeGroup(g({ name: "השקעות נדל״ן", folder: "השקעות" }));
  add("investment type tag", invest.insights.some((i) => i.tag === "investment"));
  const rental = analyzeGroup(g({ name: "דירות להשכרה בחיפה", folder: "השכרות" }));
  add("rental type tag", rental.insights.some((i) => i.tag === "rental"));
  add("neighborhood specialist tag", analyzeGroup(g({ name: "דירות בחיפה", city: "חיפה", folder: "דירות בחיפה" })).insights.some((i) => i.tag === "neighborhood_specialist"));

  add("every insight explains WHY + evidence", strong.insights.every((i) => i.why.length > 0 && i.evidence.length > 0));
  add("recommendation has priority/impact/confidence/reason/evidence", !!spam.recommendation.reason && spam.recommendation.evidence.length > 0 && spam.recommendation.confidence > 0);

  // Folder intelligence.
  const intel = buildGroupsIntelligence([
    g({ id: "a", folder: "חיפה", city: "חיפה", performance: 80, totalLeads: 4 }),
    g({ id: "b", folder: "חיפה", city: "חיפה", performance: 30, totalPosts: 6, totalLeads: 0 }),
    g({ id: "c", folder: "יוקרה", city: "הרצליה", name: "יוקרה הרצליה", performance: 70, totalLeads: 3, lastPostAt: ago(2) }),
  ]);
  add("folders built + sorted by score", intel.folders.length === 2 && intel.folders[0].folderScore >= intel.folders[1].folderScore);
  const haifa = intel.folders.find((f) => f.folder === "חיפה")!;
  add("folder totals + top/weak groups", haifa.totalGroups === 2 && haifa.topGroups.length >= 1 && haifa.weakGroups.some((w) => w.id === "b"));
  add("folder health label + coverage cities", ["מצוין", "יציב", "חלש", "לא פעיל"].includes(haifa.health) && haifa.cities.includes("חיפה"));
  add("summary counts", intel.summary.totalGroups === 3 && intel.summary.strong >= 1 && intel.summary.weak >= 1);

  // Empty + large folders.
  add("empty input safe", buildGroupsIntelligence([]).folders.length === 0 && buildGroupsIntelligence([]).groups.length === 0);
  const big = Array.from({ length: 400 }, (_, i) => g({ id: `x${i}`, folder: `folder${i % 10}`, city: `city${i % 20}`, performance: i % 100, totalLeads: i % 5 }));
  add("large folder set intel", buildFolderIntel(buildGroupsIntelligence(big).groups).length === 10);

  const t0 = Date.now();
  for (let k = 0; k < 10; k++) buildGroupsIntelligence(big);
  add("400 groups × 10 builds < 250ms", Date.now() - t0 < 250, `${Date.now() - t0}ms`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
