// ============================================================================
// 📊 ZONO — Facebook Groups Intelligence — engine (pure). 33.4.
// The MISSING intelligence layer over the EXISTING group registry: it does NOT
// re-score groups (it consumes the real performance_score / lead_score / posts /
// leads already computed by groups-service). It only DERIVES structured insights
// (strong/weak/inactive/overused/no-leads/high-engagement + type) and per-group
// recommendations, plus FOLDER intelligence (health/coverage/top/weak per
// category). Everything explains WHY. Read-only; nothing executes.
// ============================================================================

export type InsightTag =
  | "strong" | "high_engagement" | "weak" | "no_leads" | "inactive" | "overused" | "spam_risk"
  | "luxury" | "investment" | "rental" | "neighborhood_specialist";

export type RecoAction = "publish_more" | "publish_less" | "pause" | "reengage" | "maintain" | "high_priority" | "low_priority";

export interface GroupStat {
  id: string; name: string; folder: string; city: string | null; propertyTypes: string[];
  members: number; status: string; performance: number; leadScore: number; spamRisk: number;
  totalPosts: number; totalLeads: number; lastPostAt: string | null; lastLeadAt: string | null; url: string | null;
}

export interface GroupInsight { tag: InsightTag; why: string; evidence: string[] }
export interface GroupRecommendation { action: RecoAction; priority: number; impact: "low" | "medium" | "high"; confidence: number; reason: string; evidence: string[] }

export interface GroupIntel {
  id: string; name: string; folder: string; city: string | null; url: string | null;
  members: number; performance: number; leadScore: number; totalPosts: number; totalLeads: number;
  leadRate: number; daysSincePost: number | null; aiScore: number;
  insights: GroupInsight[]; recommendation: GroupRecommendation;
}

export interface FolderIntel {
  folder: string; totalGroups: number; activeGroups: number; totalPosts: number; totalLeads: number;
  avgPerformance: number; folderScore: number; health: "מצוין" | "יציב" | "חלש" | "לא פעיל";
  cities: string[]; topGroups: { id: string; name: string; score: number }[];
  weakGroups: { id: string; name: string }[]; note: string;
}

export interface GroupsIntelligence {
  groups: GroupIntel[]; folders: FolderIntel[];
  summary: { totalGroups: number; totalLeads: number; strong: number; weak: number; inactive: number; noLeads: number };
}

const DAY = 86_400_000;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const daysSince = (iso: string | null): number | null => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY)) : null);
const kw = (g: GroupStat, words: string[]) => words.some((w) => `${g.name} ${g.folder}`.includes(w));

function typeInsights(g: GroupStat): GroupInsight[] {
  const out: GroupInsight[] = [];
  if (kw(g, ["יוקרה", "לוקסוס", "פרימיום", "luxury"]) || g.propertyTypes.includes("penthouse")) out.push({ tag: "luxury", why: "קבוצת יוקרה — מתאימה לנכסים ברמה גבוהה.", evidence: ["מילות מפתח יוקרה"] });
  if (kw(g, ["השקע", "משקיע", "תשוא", "invest"])) out.push({ tag: "investment", why: "קבוצת השקעות — קהל משקיעים.", evidence: ["מילות מפתח השקעה"] });
  if (kw(g, ["השכר", "שכירות", "להשכרה", "rent"])) out.push({ tag: "rental", why: "קבוצת השכרות — ביקוש לשוכרים.", evidence: ["מילות מפתח השכרה"] });
  if (g.city && (g.folder.includes(g.city) || g.name.includes(g.city))) out.push({ tag: "neighborhood_specialist", why: `מתמחה ב${g.city}.`, evidence: [`אזור: ${g.city}`] });
  return out;
}

export function analyzeGroup(g: GroupStat): GroupIntel {
  const dPost = daysSince(g.lastPostAt);
  const leadRate = g.totalPosts > 0 ? Number((g.totalLeads / g.totalPosts).toFixed(2)) : 0;
  const insights: GroupInsight[] = [];

  if (g.performance >= 70 && g.totalLeads >= 1) insights.push({ tag: "strong", why: "ביצועים גבוהים עם לידים בפועל.", evidence: [`ביצועים ${g.performance}`, `${g.totalLeads} לידים`] });
  if (g.leadScore >= 65) insights.push({ tag: "high_engagement", why: "מעורבות/יחס לידים גבוה.", evidence: [`ציון לידים ${g.leadScore}`] });
  if (g.totalPosts >= 3 && g.totalLeads === 0) insights.push({ tag: "no_leads", why: "פורסמו פוסטים אך ללא לידים.", evidence: [`${g.totalPosts} פוסטים · 0 לידים`] });
  if (g.totalPosts >= 3 && (g.performance < 40 || g.totalLeads === 0)) insights.push({ tag: "weak", why: "ביצועים חלשים ביחס לפעילות.", evidence: [`ביצועים ${g.performance}`, `${g.totalPosts} פוסטים`] });
  if (dPost == null || dPost > 30) insights.push({ tag: "inactive", why: dPost == null ? "טרם פורסם בקבוצה." : `לא פורסם ${dPost} ימים.`, evidence: [dPost == null ? "אין פוסטים" : `${dPost} ימים`] });
  if (g.totalPosts >= 15 && leadRate < 0.05) insights.push({ tag: "overused", why: "ריבוי פרסומים מול תשואת לידים נמוכה — סיכון לשחיקה.", evidence: [`${g.totalPosts} פוסטים`, `יחס לידים ${leadRate}`] });
  if (g.spamRisk >= 60) insights.push({ tag: "spam_risk", why: "סיכון ספאם גבוה — האטה מומלצת.", evidence: [`סיכון ספאם ${g.spamRisk}`] });
  insights.push(...typeInsights(g));

  const aiScore = clamp(g.performance * 0.5 + g.leadScore * 0.3 + (g.spamRisk >= 60 ? 0 : 20) - (dPost && dPost > 60 ? 10 : 0));
  return { id: g.id, name: g.name, folder: g.folder, city: g.city, url: g.url, members: g.members, performance: g.performance, leadScore: g.leadScore, totalPosts: g.totalPosts, totalLeads: g.totalLeads, leadRate, daysSincePost: dPost, aiScore, insights, recommendation: recommendGroup(g, insights, aiScore) };
}

function recommendGroup(g: GroupStat, insights: GroupInsight[], aiScore: number): GroupRecommendation {
  const has = (t: InsightTag) => insights.some((i) => i.tag === t);
  if (has("spam_risk")) return { action: "pause", priority: 90, impact: "high", confidence: 75, reason: "סיכון ספאם גבוה — עצירה זמנית תשמור על הקבוצה.", evidence: [`סיכון ספאם ${g.spamRisk}`] };
  if (has("overused")) return { action: "publish_less", priority: 78, impact: "medium", confidence: 68, reason: "פרסום-יתר — הפחיתו תדירות והתמקדו באיכות.", evidence: [`${g.totalPosts} פוסטים`] };
  if (has("strong")) return { action: "publish_more", priority: 85, impact: "high", confidence: 80, reason: "קבוצה מניבה — הגדילו נוכחות (בזהירות).", evidence: [`ביצועים ${g.performance}`, `${g.totalLeads} לידים`] };
  if (has("no_leads") || has("weak")) return { action: "publish_less", priority: 60, impact: "medium", confidence: 62, reason: "ללא תשואת לידים — צמצמו והשקיעו בקבוצות מובילות.", evidence: [`${g.totalPosts} פוסטים · ${g.totalLeads} לידים`] };
  if (has("inactive")) return { action: "reengage", priority: 55, impact: "medium", confidence: 55, reason: "קבוצה לא פעילה — פרסום מחודש עם תוכן טרי.", evidence: g.totalLeads > 0 ? ["הניבה לידים בעבר"] : ["אין פעילות אחרונה"] };
  return { action: aiScore >= 60 ? "high_priority" : "maintain", priority: aiScore >= 60 ? 65 : 40, impact: "low", confidence: 55, reason: "המשיכו לעקוב אחר הביצועים.", evidence: [`ציון AI ${aiScore}`] };
}

function folderHealth(score: number, active: number): FolderIntel["health"] {
  if (active === 0) return "לא פעיל";
  return score >= 70 ? "מצוין" : score >= 45 ? "יציב" : "חלש";
}

export function buildFolderIntel(groups: GroupIntel[]): FolderIntel[] {
  const by = new Map<string, GroupIntel[]>();
  for (const g of groups) { const k = g.folder || "כללי"; (by.get(k) ?? by.set(k, []).get(k)!).push(g); }
  return [...by.entries()].map(([folder, gs]) => {
    const totalGroups = gs.length;
    const activeGroups = gs.filter((g) => g.daysSincePost != null && g.daysSincePost <= 30).length;
    const totalPosts = gs.reduce((s, g) => s + g.totalPosts, 0);
    const totalLeads = gs.reduce((s, g) => s + g.totalLeads, 0);
    const avgPerformance = clamp(gs.reduce((s, g) => s + g.performance, 0) / totalGroups);
    const leadYield = Math.min(100, (totalLeads / totalGroups) * 25);
    const activeShare = (activeGroups / totalGroups) * 100;
    const folderScore = clamp(avgPerformance * 0.5 + leadYield * 0.3 + activeShare * 0.2);
    const cities = [...new Set(gs.map((g) => g.city).filter((c): c is string => !!c))];
    const topGroups = [...gs].sort((a, b) => b.aiScore - a.aiScore).slice(0, 3).map((g) => ({ id: g.id, name: g.name, score: g.aiScore }));
    const weakGroups = gs.filter((g) => g.insights.some((i) => i.tag === "weak" || i.tag === "no_leads" || i.tag === "spam_risk")).slice(0, 5).map((g) => ({ id: g.id, name: g.name }));
    const note = totalLeads === 0 ? "התיקייה טרם הניבה לידים — התמקדו בקבוצות איכותיות." : cities.length <= 1 ? "כיסוי גיאוגרפי מצומצם — שקלו להוסיף קבוצות בערים נוספות." : "";
    return { folder, totalGroups, activeGroups, totalPosts, totalLeads, avgPerformance, folderScore, health: folderHealth(folderScore, activeGroups), cities, topGroups, weakGroups, note };
  }).sort((a, b) => b.folderScore - a.folderScore);
}

export function buildGroupsIntelligence(stats: GroupStat[]): GroupsIntelligence {
  const groups = stats.map(analyzeGroup).sort((a, b) => b.aiScore - a.aiScore);
  const folders = buildFolderIntel(groups);
  const tagCount = (t: InsightTag) => groups.filter((g) => g.insights.some((i) => i.tag === t)).length;
  return {
    groups, folders,
    summary: { totalGroups: groups.length, totalLeads: groups.reduce((s, g) => s + g.totalLeads, 0), strong: tagCount("strong"), weak: tagCount("weak"), inactive: tagCount("inactive"), noLeads: tagCount("no_leads") },
  };
}
