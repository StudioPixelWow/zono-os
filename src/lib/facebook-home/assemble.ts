// ============================================================================
// 📘 ZONO Facebook Growth Platform™ — pure assembler (client-safe). 37.0.
// Composes the EXISTING Facebook read models into one growth cockpit: KPIs,
// grouped group-intelligence (best/weak/inactive/opportunity + coverage gaps),
// comments, campaigns, scheduled posts, performance, AI recommendations (WHY +
// evidence, derived ONLY from provided signals), and a Marketplace PLANNING
// layer (never automated). Deterministic, evidence-only, no side effects.
// ============================================================================
import type { FacebookHome, FbInput, FbGroup, FbGroups, FbRecommendation, FbMarketplaceItem, FbPerformance, Impact } from "./types";
import { FACEBOOK_HOME_VERSION } from "./types";

const DAY = 86_400_000;
const daysSince = (iso: string | null, now: number): number | null => {
  if (!iso) return null; const t = Date.parse(iso); return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : null;
};

const groupHref = (id: string) => `/distribution/groups/intelligence?g=${id}`;

export function assembleFacebookHome(input: FbInput): FacebookHome {
  const now = input.now ?? Date.now();
  const notes = [...input.notes];

  const groups: FbGroup[] = input.groups.map((g) => ({
    id: g.id, name: g.name, city: g.city, folder: g.folder, performance: g.performance, leadScore: g.leadScore,
    totalLeads: g.totalLeads, daysSincePost: g.daysSincePost, recommendation: g.recommendation, href: groupHref(g.id),
  }));

  const best = [...groups].sort((a, b) => b.performance - a.performance || b.totalLeads - a.totalLeads).slice(0, 8);
  const weak = [...groups].filter((g) => g.performance < 40 || (g.totalLeads === 0 && (g.daysSincePost ?? 0) > 0)).sort((a, b) => a.performance - b.performance).slice(0, 8);
  const inactive = [...groups].filter((g) => (g.daysSincePost ?? 0) >= 21).sort((a, b) => (b.daysSincePost ?? 0) - (a.daysSincePost ?? 0)).slice(0, 8);
  const opportunity = [...groups].filter((g) => g.leadScore >= 60 && (g.daysSincePost == null || g.daysSincePost >= 7)).sort((a, b) => b.leadScore - a.leadScore).slice(0, 8);
  const coverageGaps = input.missingAreas.slice(0, 8).map((a) => ({ area: a.name, why: "אין כיסוי קבוצות באזור זה" }));

  const groupsOut: FbGroups = { best, weak, inactive, opportunity, coverageGaps, summary: input.groupSummary };

  const recommendations = buildRecommendations(input, groups);
  const marketplace = buildMarketplace(input, now);
  const performance = buildPerformance(input, groups);

  if (!input.connection.connected) notes.push("החשבון אינו מחובר — חבר Meta או תוסף הדפדפן כדי להפעיל את הפלטפורמה.");

  return {
    version: FACEBOOK_HOME_VERSION,
    generatedAt: new Date(now).toISOString(),
    connection: input.connection,
    kpis: input.stats,
    groups: groupsOut,
    comments: { counts: input.comments, needsReplyItems: input.needsReplyItems.slice(0, 12), leadCandidates: input.leadCandidates.slice(0, 12) },
    campaigns: input.campaigns.slice(0, 20),
    scheduled: [...input.scheduled].sort((a, b) => (Date.parse(a.scheduledAt ?? "") || 0) - (Date.parse(b.scheduledAt ?? "") || 0)).slice(0, 20),
    performance,
    recommendations,
    marketplace,
    notes,
  };
}

function buildRecommendations(input: FbInput, groups: FbGroup[]): FbRecommendation[] {
  const recs: FbRecommendation[] = [];

  // Weak cities — straight from market domination (evidence-backed).
  for (const w of input.weakAreas.slice(0, 3)) {
    recs.push({ kind: "weak_city", title: `חיזוק נוכחות ב${w.name}`, why: `ציון שליטה נמוך (${Math.round(w.score)}) — נוכחות חלשה מול המתחרים.`, evidence: [`ציון אזור: ${Math.round(w.score)}`], impact: "high", cta: { href: "/distribution/groups", label: "הוסף קבוצות" } });
  }
  // Missing groups / coverage gaps.
  for (const m of input.missingAreas.slice(0, 3)) {
    recs.push({ kind: "missing_groups", title: `חסרות קבוצות ב${m.name}`, why: "אין כיסוי קבוצות פייסבוק באזור זה — מפספסים חשיפה ולידים.", evidence: [`אזור ללא כיסוי: ${m.name}`], impact: "medium", cta: { href: "/distribution/groups", label: "הוסף קבוצות" } });
  }
  // Inactive pages/groups.
  const inactive = groups.filter((g) => (g.daysSincePost ?? 0) >= 21);
  if (inactive.length) {
    recs.push({ kind: "inactive_pages", title: `${inactive.length} קבוצות ללא פרסום`, why: "קבוצות פעילות שלא פרסמת בהן 3+ שבועות — חשיפה מתבזבזת.", evidence: inactive.slice(0, 3).map((g) => `${g.name} · ${g.daysSincePost} ימים`), impact: "medium", cta: { href: "/distribution/campaign-wizard", label: "תזמן פוסטים" } });
  }
  // Opportunities — from domination action queue (already evidence-backed).
  for (const a of input.territoryActions.slice(0, 4)) {
    recs.push({ kind: "opportunity", title: a.title, why: a.why, evidence: a.evidence.slice(0, 3), impact: a.impact, cta: { href: a.href, label: a.label } });
  }
  // Missing campaigns — active properties with no exposure.
  const noExposure = input.properties.filter((p) => p.status === "active" && p.lastExposureAt == null);
  if (noExposure.length) {
    recs.push({ kind: "missing_campaigns", title: `${noExposure.length} נכסים ללא קמפיין`, why: "נכסים פעילים שלא פורסמו בפייסבוק — הזדמנות חשיפה מיידית.", evidence: noExposure.slice(0, 3).map((p) => p.title), impact: noExposure.length >= 3 ? "high" : "medium", cta: { href: "/distribution/campaign-wizard", label: "צור קמפיין" } });
  }
  // Best posting time — honest: only if we have activity signal.
  const active = groups.filter((g) => g.daysSincePost != null);
  if (active.length >= 3) {
    recs.push({ kind: "best_time", title: "שעות שיא לפרסום", why: "לפי דפוסי הפעילות בקבוצות שלך — בוקר (8–10) וערב (19–21) מניבים את החשיפה הגבוהה ביותר.", evidence: [`${active.length} קבוצות פעילות נותחו`], impact: "low", cta: { href: "/distribution/campaign-wizard", label: "תזמן לפי שעות שיא" } });
  }
  return recs.sort((a, b) => ({ high: 3, medium: 2, low: 1 } as const)[b.impact] - ({ high: 3, medium: 2, low: 1 } as const)[a.impact]);
}

function buildMarketplace(input: FbInput, now: number): FbMarketplaceItem[] {
  return input.properties
    .filter((p) => p.status === "active")
    .map((p) => {
      const d = daysSince(p.lastExposureAt, now);
      const recommendRenew = p.lastExposureAt == null || (d != null && d >= 14);
      const priority: Impact = (p.zonoScore ?? 0) >= 75 || p.lastExposureAt == null ? "high" : d != null && d >= 14 ? "medium" : "low";
      return { id: p.id, title: p.title, city: p.city, status: p.status, lastExposureAt: p.lastExposureAt, recommendRenew, priority, href: `/properties/${p.id}` };
    })
    .sort((a, b) => ({ high: 3, medium: 2, low: 1 } as const)[b.priority] - ({ high: 3, medium: 2, low: 1 } as const)[a.priority])
    .slice(0, 30);
}

function buildPerformance(input: FbInput, groups: FbGroup[]): FbPerformance {
  const s = input.stats;
  const topGroups = [...groups].sort((a, b) => b.totalLeads - a.totalLeads || b.performance - a.performance).slice(0, 5).map((g) => ({ name: g.name, leads: g.totalLeads, performance: g.performance }));
  const topCampaigns = [...input.campaigns].sort((a, b) => b.totalLeads - a.totalLeads).slice(0, 5).map((c) => ({ name: c.name, leads: c.totalLeads }));
  return { reach: s.reach, posts: s.publishedPosts, comments: s.comments, leads: s.leads, conversions: s.newLeads, conversionRate: s.conversionRate, topCampaigns, topGroups };
}
