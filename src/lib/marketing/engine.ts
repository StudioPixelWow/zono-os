/**
 * Marketing Intelligence Engine — deterministic, client-safe, no LLM, no server
 * imports. The "Marketing Brain": community scoring, buyer segmentation, per-
 * property marketing DNA, community matching and marketing-opportunity detection.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// ── Community Intelligence ───────────────────────────────────────────────────
export interface CommunityInput {
  membersCount: number;
  engagementScore: number; // 0..100 (curated)
  leadScore: number;
  dealScore: number;
  roiScore: number;
  trustScore: number;
  status: string;          // active|inactive
  audienceType: string;
  /** How well the community's audience matches current org demand (0..100). */
  audienceDemand: number;
  /** Recent membership growth proxy (0..100). */
  growthProxy: number;
}

export interface CommunityScores {
  activity_score: number; lead_quality_score: number; deal_generation_score: number;
  audience_match_score: number; roi_score: number; growth_score: number;
  community_health_score: number; community_influence_score: number;
}
export type CommunityLevel = "elite" | "strong" | "average" | "weak" | "dead";
export const COMMUNITY_LEVEL_LABEL: Record<CommunityLevel, string> = {
  elite: "מצטיינת", strong: "חזקה", average: "ממוצעת", weak: "חלשה", dead: "לא פעילה",
};

export function computeCommunityScores(c: CommunityInput): CommunityScores {
  const inactive = c.status !== "active";
  const sizeScore = clamp(Math.min(100, Math.log10(Math.max(1, c.membersCount)) * 28)); // 1k→~84, 10k→~112→100
  const activity = inactive ? clamp(c.engagementScore * 0.3) : clamp(c.engagementScore * 0.7 + sizeScore * 0.3);
  const leadQuality = clamp(c.leadScore * 0.7 + c.trustScore * 0.3);
  const dealGen = clamp(c.dealScore * 0.8 + c.leadScore * 0.2);
  const audienceMatch = clamp(c.audienceDemand);
  const roi = clamp(c.roiScore * 0.7 + dealGen * 0.3);
  const growth = clamp(c.growthProxy);
  const health = clamp(activity * 0.3 + leadQuality * 0.25 + roi * 0.25 + (inactive ? 0 : 20));
  const influence = clamp(sizeScore * 0.4 + c.trustScore * 0.3 + activity * 0.3);
  return {
    activity_score: activity, lead_quality_score: leadQuality, deal_generation_score: dealGen,
    audience_match_score: audienceMatch, roi_score: roi, growth_score: growth,
    community_health_score: health, community_influence_score: influence,
  };
}

export function communityLevel(s: CommunityScores, status: string): CommunityLevel {
  if (status !== "active" || s.activity_score < 15) return "dead";
  const overall = s.community_health_score * 0.4 + s.deal_generation_score * 0.3 + s.lead_quality_score * 0.3;
  if (overall >= 78) return "elite";
  if (overall >= 60) return "strong";
  if (overall >= 40) return "average";
  return "weak";
}

// ── Buyer Segmentation ───────────────────────────────────────────────────────
export type SegmentKey = "young_families" | "luxury" | "investors" | "first_home" | "downsizers" | "commercial";
export const SEGMENT_LABEL: Record<SegmentKey, string> = {
  young_families: "משפחות צעירות", luxury: "יוקרה", investors: "משקיעים",
  first_home: "דירה ראשונה", downsizers: "מקטינים דיור", commercial: "מסחרי",
};

export interface BuyerForSegment {
  budgetMax: number | null; roomsMin: number | null; roomsMax: number | null;
  intent: string | null; propertyTypes: string[];
}

export function classifyBuyerSegment(b: BuyerForSegment): SegmentKey {
  const types = b.propertyTypes ?? [];
  if (b.intent === "investment" || b.intent === "investor") return "investors";
  if (types.includes("commercial") || types.includes("office") || types.includes("land")) return "commercial";
  if (b.budgetMax != null && b.budgetMax >= 4_000_000) return "luxury";
  if (b.roomsMax != null && b.roomsMax <= 3 && (b.budgetMax == null || b.budgetMax <= 1_800_000)) return "first_home";
  if (b.roomsMin != null && b.roomsMin >= 4) return "young_families";
  if (b.roomsMax != null && b.roomsMax <= 3) return "downsizers";
  return "young_families";
}

// ── Property Marketing DNA ───────────────────────────────────────────────────
export interface PropertyForMarketing {
  type: string; price: number | null; rooms: number | null; sqm: number | null;
  city: string | null; zonoScore: number | null;
}

export interface MarketingDNA {
  targetAudience: string[];
  buyerPersonas: string[];
  motivators: string[];
  objections: string[];
  painPoints: string[];
  angles: { lifestyle: string; investment: string; family: string; urgency: string };
  recommendedChannels: string[];
  recommendedContentTypes: string[];
  recommendedPublishingTimes: string[];
  recommendedBudgetLevel: "low" | "medium" | "high";
  expectedLeadVolume: number;
  expectedConversion: number;
  marketingScore: number;
}

const COMMERCIAL_TYPES = new Set(["commercial", "office", "land"]);

export function buildMarketingDNA(p: PropertyForMarketing, marketDemand: number, buyerDemandForType: number): MarketingDNA {
  const price = p.price ?? 0;
  const luxury = price >= 4_000_000;
  const entry = price > 0 && price <= 1_800_000;
  const family = (p.rooms ?? 0) >= 4;
  const commercial = COMMERCIAL_TYPES.has(p.type);
  const investment = commercial || entry;

  const audience: string[] = [];
  if (commercial) audience.push("commercial");
  if (luxury) audience.push("luxury");
  if (family) audience.push("families");
  if (entry) audience.push("young", "first_home");
  if (investment) audience.push("investors");
  if (!audience.length) audience.push("buyers");

  const personas = [...new Set(audience.map((a) => SEGMENT_FROM_AUDIENCE[a] ?? "קונה כללי"))];

  const channels: string[] = ["facebook", "neighborhood"];
  if (luxury) channels.push("linkedin", "investors");
  if (investment) channels.push("investors", "telegram");
  if (family || entry) channels.push("whatsapp", "local");

  const contentTypes = [
    "תמונות איכותיות", luxury ? "סרטון סיור יוקרתי" : "סרטון סיור קצר",
    investment ? "ניתוח תשואה" : "סיפור שכונה", "פוסט נקודות מכירה",
  ];
  const times = ["ראשון 20:00", "שלישי 13:00", "חמישי 19:00", family ? "שבת 11:00" : "שישי 10:00"];

  const motivators = [luxury ? "יוקרה ובלעדיות" : "מחיר אטרקטיבי", family ? "קרבה לחינוך" : "מיקום מרכזי", investment ? "פוטנציאל השבחה" : "מוכנות לכניסה"];
  const objections = ["מחיר", luxury ? "תחזוקה" : "קומה/כיוון", "מרחק משירותים"];
  const painPoints = [entry ? "תקציב מוגבל" : "התאמת חדרים", "זמינות חניה", "ודאות תשואה"];

  const budget: "low" | "medium" | "high" = luxury ? "high" : marketDemand >= 65 || buyerDemandForType >= 60 ? "medium" : "low";
  const marketingScore = clamp((p.zonoScore ?? 50) * 0.3 + marketDemand * 0.35 + buyerDemandForType * 0.35);
  const expectedLeadVolume = Math.max(1, Math.round((marketDemand * 0.1 + buyerDemandForType * 0.1) * (luxury ? 0.6 : 1)));
  const expectedConversion = clamp(buyerDemandForType * 0.4 + marketingScore * 0.2 + 10);

  return {
    targetAudience: audience, buyerPersonas: personas, motivators, objections, painPoints,
    angles: {
      lifestyle: luxury ? "סטנדרט מגורים גבוה עם נוחות מקסימלית" : "איכות חיים נוחה במיקום מבוקש",
      investment: investment ? "כניסה במחיר אטרקטיבי עם פוטנציאל השבחה" : "נכס יציב לטווח ארוך",
      family: family ? "מרחב למשפחה גדלה, קרוב לחינוך וקהילה" : "מתאים לזוגות ומשפחות מתחילות",
      urgency: marketDemand >= 65 ? "ביקוש גבוה באזור — נכסים נחטפים מהר" : "הזדמנות לפני עליית מחירים",
    },
    recommendedChannels: [...new Set(channels)], recommendedContentTypes: contentTypes, recommendedPublishingTimes: times,
    recommendedBudgetLevel: budget, expectedLeadVolume, expectedConversion, marketingScore,
  };
}

const SEGMENT_FROM_AUDIENCE: Record<string, string> = {
  luxury: "רוכש יוקרה", families: "משפחה צעירה", young: "זוג צעיר", first_home: "דירה ראשונה",
  investors: "משקיע", commercial: "יזם/עסק", buyers: "קונה כללי",
};

// ── Community Matching (per property) ────────────────────────────────────────
export interface CommunityForMatch {
  id: string; name: string; audienceType: string; city: string | null; locality: string | null;
  engagementScore: number; leadScore: number; dealScore: number; level: string;
}
export interface CommunityMatch { communityId: string; name: string; matchScore: number; relevance: number; audience: number; engagement: number; historical: number }

export function rankCommunitiesForProperty(audience: string[], propCity: string | null, communities: CommunityForMatch[]): CommunityMatch[] {
  const aSet = new Set(audience);
  return communities.map((c) => {
    const audienceFit = aSet.has(c.audienceType) ? 100 : c.audienceType === "buyers" ? 60 : 30;
    const relevance = propCity && c.city ? (c.city === propCity ? 100 : (c.city.includes(propCity) || propCity.includes(c.city) ? 70 : 35)) : 50;
    const engagement = clamp(c.engagementScore);
    const historical = clamp(c.dealScore * 0.6 + c.leadScore * 0.4);
    const levelBoost = c.level === "elite" ? 12 : c.level === "strong" ? 6 : c.level === "dead" ? -25 : 0;
    const matchScore = clamp(audienceFit * 0.3 + relevance * 0.25 + engagement * 0.2 + historical * 0.25 + levelBoost);
    return { communityId: c.id, name: c.name, matchScore, relevance, audience: audienceFit, engagement, historical };
  }).sort((a, b) => b.matchScore - a.matchScore).slice(0, 20);
}

// ── Marketing Health (office-level) ──────────────────────────────────────────
export function marketingHealthScore(input: { activeCommunities: number; avgCommunityHealth: number; coveredAudiences: number; avgMarketingScore: number; openOpportunities: number }): number {
  return clamp(
    Math.min(100, input.activeCommunities * 8) * 0.2 +
    input.avgCommunityHealth * 0.3 +
    Math.min(100, input.coveredAudiences * 15) * 0.2 +
    input.avgMarketingScore * 0.2 +
    Math.min(100, input.openOpportunities * 10) * 0.1,
  );
}
