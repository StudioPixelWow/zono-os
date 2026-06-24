// ============================================================================
// ZONO — Distribution analytics + performance scoring (pure, client + server
// safe, DETERMINISTIC). Every number below is computed from real records passed
// in by the service — no random, no mock, no fabricated values. The service maps
// Supabase rows into the lightweight inputs here and renders the result.
// ============================================================================

// ── Inputs (subset of the real DB rows) ──────────────────────────────────────
export interface ACampaign { id: string; name: string; status: string }
export interface AGroup { id: string; name: string; city: string | null; members: number }
export interface APost { id: string; campaignId: string | null; groupId: string | null; variationId: string | null; status: string; failureReason: string | null }
export interface AVariation { id: string; campaignId: string | null; angle: string | null; cta: string | null; headline: string | null }
export interface AComment { id: string; postId: string | null; groupId: string | null; category: string | null; sentiment: string | null; leadIntentScore: number; isLead: boolean; leadId: string | null }
export interface ALead { id: string; campaignId: string | null; postId: string | null; groupId: string | null; status: string; intentScore: number }

export interface AnalyticsInput {
  campaigns: ACampaign[]; groups: AGroup[]; posts: APost[];
  variations: AVariation[]; comments: AComment[]; leads: ALead[];
}

// ── Outputs ───────────────────────────────────────────────────────────────────
export interface ExecutiveSummary {
  totalCampaigns: number; totalGroupsUsed: number; scheduledPosts: number; publishedPosts: number;
  failedPosts: number; importedComments: number; detectedLeads: number; hotLeads: number;
  conversionRate: number; avgLeadIntentScore: number; publishingSuccessRate: number;
}
export interface GroupPerf { id: string; name: string; city: string | null; score: number; comments: number; leads: number; conversionRate: number; avgIntent: number; published: number; failed: number; spamNegative: number }
export interface CampaignPerf { id: string; name: string; score: number; reachProxy: number; commentRate: number; leadRate: number; hotLeadRate: number; publishingSuccessRate: number; published: number; comments: number; leads: number; groupsUsed: number }
export interface CityPerf { city: string; groups: number; comments: number; leads: number; leadRate: number }
export interface VariationPerf { id: string; angle: string | null; cta: string | null; headline: string | null; usedCount: number; comments: number; leads: number; avgIntent: number; conversionRate: number; score: number }
export interface AnglePerf { angle: string; variations: number; comments: number; leads: number; score: number }
export interface CtaPerf { cta: string; posts: number; comments: number; leads: number; commentRate: number }
export interface LeadFunnel { published: number; comments: number; leads: number; hotLeads: number; converted: number }
export interface FailedAnalysis { totalFailed: number; byReason: { reason: string; count: number }[]; byGroup: { groupName: string; count: number }[] }
export interface Recommendation { id: string; type: "win" | "warn" | "action" | "info"; text: string }
export interface DataSufficiency { enough: boolean; publishedPosts: number; comments: number; note: string }
export interface DistributionAnalytics {
  summary: ExecutiveSummary; campaigns: CampaignPerf[]; groups: GroupPerf[]; cities: CityPerf[];
  variations: VariationPerf[]; angles: AnglePerf[]; ctas: CtaPerf[]; funnel: LeadFunnel;
  failed: FailedAnalysis; recommendations: Recommendation[]; sufficiency: DataSufficiency;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const PUBLISHED = new Set(["published"]);
const SCHEDULED = new Set(["scheduled", "queued", "pending", "draft"]);
const FAILED = new Set(["failed"]);
const IGNORED_CAT = new Set(["spam", "negative"]);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10000) / 100 : 0);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
const HOT = 80;

// ── Deterministic scores ──────────────────────────────────────────────────────
/** performance = comments + leads + conversion + manual-quality − failed − spam/neg. */
export function groupScore(i: { comments: number; leads: number; conversion: number; avgIntent: number; failed: number; spamNegative: number }): number {
  const commentsWeight = Math.min(30, i.comments * 3);
  const leadsWeight = Math.min(30, i.leads * 8);
  const conversionWeight = (i.conversion / 100) * 20;       // conversion is a percentage
  const manualQualityWeight = (i.avgIntent / 100) * 20;
  const failedPenalty = Math.min(20, i.failed * 5);
  const spamNegativePenalty = Math.min(15, i.spamNegative * 5);
  return clamp(commentsWeight + leadsWeight + conversionWeight + manualQualityWeight - failedPenalty - spamNegativePenalty);
}
export function campaignScore(i: { commentRate: number; leadRate: number; hotLeadRate: number; publishingSuccessRate: number; reachProxy: number }): number {
  return clamp(
    Math.min(25, i.leadRate * 12) + Math.min(15, i.commentRate * 4) +
    i.hotLeadRate * 0.25 + i.publishingSuccessRate * 0.20 + Math.min(15, i.reachProxy / 2000),
  );
}
export function variationScore(i: { leads: number; conversion: number; avgIntent: number; comments: number }): number {
  return clamp(Math.min(25, i.leads * 8) + (i.conversion / 100) * 30 + (i.avgIntent / 100) * 25 + Math.min(20, i.comments * 2));
}

// ── Main computation ──────────────────────────────────────────────────────────
export function computeAnalytics(input: AnalyticsInput): DistributionAnalytics {
  const { campaigns, groups, posts, variations, comments, leads } = input;
  const postById = new Map(posts.map((p) => [p.id, p]));
  const groupById = new Map(groups.map((g) => [g.id, g]));

  const resolveGroup = (c: AComment): string | null => c.groupId ?? (c.postId ? postById.get(c.postId)?.groupId ?? null : null);
  const resolveCampaignOfComment = (c: AComment): string | null => (c.postId ? postById.get(c.postId)?.campaignId ?? null : null);

  // ── Executive summary ──
  const publishedPosts = posts.filter((p) => PUBLISHED.has(p.status)).length;
  const scheduledPosts = posts.filter((p) => SCHEDULED.has(p.status)).length;
  const failedPosts = posts.filter((p) => FAILED.has(p.status)).length;
  const groupsUsed = new Set(posts.map((p) => p.groupId).filter(Boolean)).size;
  const hotLeads = leads.filter((l) => l.intentScore >= HOT).length;
  const intentScores = comments.map((c) => c.leadIntentScore).filter((x) => x > 0);
  const summary: ExecutiveSummary = {
    totalCampaigns: campaigns.length, totalGroupsUsed: groupsUsed, scheduledPosts, publishedPosts, failedPosts,
    importedComments: comments.length, detectedLeads: leads.length, hotLeads,
    conversionRate: rate(leads.length, comments.length), avgLeadIntentScore: avg(intentScores),
    publishingSuccessRate: rate(publishedPosts, publishedPosts + failedPosts),
  };

  // ── Group leaderboard ──
  const groupPerf: GroupPerf[] = groups.map((g) => {
    const gPosts = posts.filter((p) => p.groupId === g.id);
    const published = gPosts.filter((p) => PUBLISHED.has(p.status)).length;
    const failed = gPosts.filter((p) => FAILED.has(p.status)).length;
    const gComments = comments.filter((c) => resolveGroup(c) === g.id);
    const gLeads = leads.filter((l) => (l.groupId ?? (l.postId ? postById.get(l.postId)?.groupId : null)) === g.id);
    const conversion = rate(gLeads.length, gComments.length);
    const avgIntent = avg(gComments.map((c) => c.leadIntentScore).filter((x) => x > 0));
    const spamNegative = gComments.filter((c) => IGNORED_CAT.has(c.category ?? "")).length;
    return {
      id: g.id, name: g.name, city: g.city,
      score: groupScore({ comments: gComments.length, leads: gLeads.length, conversion, avgIntent, failed, spamNegative }),
      comments: gComments.length, leads: gLeads.length, conversionRate: conversion, avgIntent, published, failed, spamNegative,
    };
  }).sort((a, b) => b.score - a.score);

  // ── Campaign leaderboard ──
  const campaignPerf: CampaignPerf[] = campaigns.map((c) => {
    const cPosts = posts.filter((p) => p.campaignId === c.id);
    const published = cPosts.filter((p) => PUBLISHED.has(p.status)).length;
    const failed = cPosts.filter((p) => FAILED.has(p.status)).length;
    const cComments = comments.filter((cm) => resolveCampaignOfComment(cm) === c.id);
    const cLeads = leads.filter((l) => l.campaignId === c.id);
    const hot = cLeads.filter((l) => l.intentScore >= HOT).length;
    const reachProxy = cPosts.filter((p) => PUBLISHED.has(p.status)).reduce((s, p) => s + (p.groupId ? groupById.get(p.groupId)?.members ?? 0 : 0), 0);
    const commentRate = rate(cComments.length, published);
    const leadRate = rate(cLeads.length, published);
    const hotLeadRate = rate(hot, cLeads.length);
    const publishingSuccessRate = rate(published, published + failed);
    return {
      id: c.id, name: c.name,
      score: campaignScore({ commentRate, leadRate, hotLeadRate, publishingSuccessRate, reachProxy }),
      reachProxy, commentRate, leadRate, hotLeadRate, publishingSuccessRate,
      published, comments: cComments.length, leads: cLeads.length,
      groupsUsed: new Set(cPosts.map((p) => p.groupId).filter(Boolean)).size,
    };
  }).sort((a, b) => b.score - a.score);

  // ── City performance ──
  const cityMap = new Map<string, { groups: Set<string>; comments: number; leads: number }>();
  for (const g of groups) {
    if (!g.city) continue;
    const e = cityMap.get(g.city) ?? { groups: new Set(), comments: 0, leads: 0 };
    e.groups.add(g.id);
    const gp = groupPerf.find((x) => x.id === g.id);
    e.comments += gp?.comments ?? 0; e.leads += gp?.leads ?? 0;
    cityMap.set(g.city, e);
  }
  const cities: CityPerf[] = Array.from(cityMap.entries())
    .map(([city, e]) => ({ city, groups: e.groups.size, comments: e.comments, leads: e.leads, leadRate: rate(e.leads, e.comments) }))
    .sort((a, b) => b.leadRate - a.leadRate);

  // ── Variation performance ──
  const variationPerf: VariationPerf[] = variations.map((v) => {
    const vPosts = posts.filter((p) => p.variationId === v.id);
    const vPostIds = new Set(vPosts.map((p) => p.id));
    const vComments = comments.filter((cm) => cm.postId && vPostIds.has(cm.postId));
    const vLeads = leads.filter((l) => l.postId && vPostIds.has(l.postId));
    const avgIntent = avg(vComments.map((c) => c.leadIntentScore).filter((x) => x > 0));
    const conversion = rate(vLeads.length, vComments.length);
    return {
      id: v.id, angle: v.angle, cta: v.cta, headline: v.headline, usedCount: vPosts.length,
      comments: vComments.length, leads: vLeads.length, avgIntent, conversionRate: conversion,
      score: variationScore({ leads: vLeads.length, conversion, avgIntent, comments: vComments.length }),
    };
  }).sort((a, b) => b.score - a.score);

  // ── Angle performance ──
  const angleMap = new Map<string, { variations: number; comments: number; leads: number; scoreSum: number }>();
  for (const v of variationPerf) {
    const a = v.angle ?? "—";
    const e = angleMap.get(a) ?? { variations: 0, comments: 0, leads: 0, scoreSum: 0 };
    e.variations++; e.comments += v.comments; e.leads += v.leads; e.scoreSum += v.score;
    angleMap.set(a, e);
  }
  const angles: AnglePerf[] = Array.from(angleMap.entries())
    .map(([angle, e]) => ({ angle, variations: e.variations, comments: e.comments, leads: e.leads, score: Math.round(e.scoreSum / e.variations) }))
    .sort((a, b) => b.score - a.score);

  // ── CTA performance ──
  const variationCta = new Map(variations.map((v) => [v.id, v.cta ?? "—"]));
  const ctaMap = new Map<string, { posts: number; comments: number; leads: number }>();
  for (const p of posts) {
    const cta = p.variationId ? variationCta.get(p.variationId) ?? "—" : "—";
    const e = ctaMap.get(cta) ?? { posts: 0, comments: 0, leads: 0 };
    e.posts++;
    e.comments += comments.filter((c) => c.postId === p.id).length;
    e.leads += leads.filter((l) => l.postId === p.id).length;
    ctaMap.set(cta, e);
  }
  const ctas: CtaPerf[] = Array.from(ctaMap.entries())
    .filter(([cta]) => cta !== "—")
    .map(([cta, e]) => ({ cta, posts: e.posts, comments: e.comments, leads: e.leads, commentRate: rate(e.comments, e.posts) }))
    .sort((a, b) => b.commentRate - a.commentRate);

  // ── Lead funnel ──
  const funnel: LeadFunnel = {
    published: publishedPosts, comments: comments.length, leads: leads.length, hotLeads,
    converted: leads.filter((l) => l.status === "converted").length,
  };

  // ── Failed posts analysis ──
  const failedPostsArr = posts.filter((p) => FAILED.has(p.status));
  const reasonMap = new Map<string, number>();
  const failGroupMap = new Map<string, number>();
  for (const p of failedPostsArr) {
    const r = (p.failureReason ?? "לא ידוע").slice(0, 80);
    reasonMap.set(r, (reasonMap.get(r) ?? 0) + 1);
    const gn = p.groupId ? groupById.get(p.groupId)?.name ?? "—" : "—";
    failGroupMap.set(gn, (failGroupMap.get(gn) ?? 0) + 1);
  }
  const failed: FailedAnalysis = {
    totalFailed: failedPostsArr.length,
    byReason: Array.from(reasonMap.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    byGroup: Array.from(failGroupMap.entries()).map(([groupName, count]) => ({ groupName, count })).sort((a, b) => b.count - a.count),
  };

  // ── Data sufficiency ──
  const enough = publishedPosts >= 3 && comments.length >= 5;
  const sufficiency: DataSufficiency = {
    enough, publishedPosts, comments: comments.length,
    note: enough ? "" : "אין מספיק נתונים אמיתיים עדיין — פרסם עוד פוסטים וייבא תגובות כדי לקבל תובנות אמינות.",
  };

  return {
    summary, campaigns: campaignPerf, groups: groupPerf, cities, variations: variationPerf, angles, ctas,
    funnel, failed, recommendations: buildRecommendations({ enough, cities, ctas, groupPerf, campaignPerf, angles }), sufficiency,
  };
}

// ── Recommendations (grounded; guarded by "needs more data") ──────────────────
function buildRecommendations(a: {
  enough: boolean; cities: CityPerf[]; ctas: CtaPerf[]; groupPerf: GroupPerf[]; campaignPerf: CampaignPerf[]; angles: AnglePerf[];
}): Recommendation[] {
  if (!a.enough) {
    return [{ id: "need-data", type: "info", text: "אין מספיק נתונים אמיתיים עדיין כדי להפיק המלצות. המשך לפרסם ולייבא תגובות — התובנות יופיעו אוטומטית." }];
  }
  const recs: Recommendation[] = [];

  // City lead-rate leader (min 5 comments in that city).
  const strongCities = a.cities.filter((c) => c.comments >= 5);
  if (strongCities.length >= 2 && strongCities[0].leadRate > strongCities[strongCities.length - 1].leadRate * 1.3) {
    recs.push({ id: "city", type: "win", text: `קבוצות ב${strongCities[0].city} מייצרות יותר לידים מקבוצות אחרות (${strongCities[0].leadRate}% המרה).` });
  }
  // WhatsApp CTA effect.
  const wa = a.ctas.find((c) => /וואטסאפ|whatsapp|💬/i.test(c.cta));
  const avgCommentRate = a.ctas.length ? a.ctas.reduce((s, c) => s + c.commentRate, 0) / a.ctas.length : 0;
  if (wa && wa.posts >= 2 && wa.commentRate > avgCommentRate * 1.15) {
    recs.push({ id: "cta-wa", type: "win", text: "פוסטים עם CTA לוואטסאפ מקבלים יותר תגובות — שווה להרחיב את השימוש." });
  }
  // High comments but low-quality leads group.
  const noisy = a.groupPerf.find((g) => g.comments >= 6 && g.conversionRate < 12);
  if (noisy) recs.push({ id: "noisy", type: "warn", text: `קבוצת ${noisy.name} יצרה הרבה תגובות אבל מעט לידים איכותיים — בדוק התאמת קהל.` });
  // Campaign needs more groups for spread.
  const thin = a.campaignPerf.find((c) => c.published >= 2 && c.groupsUsed < 5);
  if (thin) recs.push({ id: "spread", type: "action", text: `קמפיין ${thin.name} צריך עוד ${5 - thin.groupsUsed} קבוצות כדי להגיע לפיזור טוב יותר.` });
  // Best angle.
  if (a.angles.length >= 2 && a.angles[0].angle !== "—" && a.angles[0].score > a.angles[1].score + 8) {
    recs.push({ id: "angle", type: "win", text: `האנגל "${a.angles[0].angle}" מוביל בביצועים — תעדף וריאציות בכיוון הזה.` });
  }

  return recs.length ? recs : [{ id: "ok", type: "info", text: "הביצועים מאוזנים — אין כרגע חריגות שדורשות פעולה." }];
}
