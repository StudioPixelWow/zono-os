// ============================================================================
// ZONO — Creative Asset Generator (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Approved campaign (+ its planned campaign assets, Campaign DNA, concept,
// property/project logic) → structured creative ASSETS (plans, not designs).
// This is the default ("mock") generator + the normalizer for AI output.
// ============================================================================

export const CREATIVE_ASSET_TYPE_LABELS: Record<string, string> = {
  feed_post: "פוסט פיד", story: "סטורי", carousel: "קרוסלה", reel_cover: "כריכת ריל", banner: "באנר",
  seller_recruitment_ad: "מודעת גיוס מוכרים", buyer_recruitment_ad: "מודעת גיוס קונים", project_awareness_asset: "נכס מודעוּת לפרויקט",
  investment_asset: "נכס השקעה", neighborhood_asset: "נכס שכונה", agent_branding_asset: "נכס מיתוג סוכן", office_branding_asset: "נכס מיתוג משרד",
};
export const OBJECTIVE_LABELS: Record<string, string> = {
  lead_generation: "יצירת לידים", awareness: "מודעוּת", engagement: "מעורבות", conversion: "המרה", trust: "אמון", recruitment: "גיוס",
};

export interface CampaignDnaLite {
  urgency: number; trust: number; luxury: number; lifestyle: number; investment: number; seller: number; buyer: number; ctaIntensity: number;
}
export interface SeedAsset {
  asset_type: string; title: string | null; purpose: string | null; recommended_message: string | null; recommended_cta: string | null; audience_variant: string | null; priority: number;
}
export interface GeneratorContext {
  entityType: string; entityName: string; campaignType: string; cdna: CampaignDnaLite;
  conceptTitle?: string | null; conceptAngle?: string | null; conceptTrigger?: string | null;
  propertyType?: string | null; neighborhood?: string | null; city?: string | null; priceTier?: string | null;
  seeds: SeedAsset[]; // planned campaign_assets (preferred source)
}

export interface CreativeAsset {
  asset_type: string; title: string; objective: string; audience: string; marketing_angle: string; emotional_trigger: string;
  visual_hook: string; copy_hook: string; cta_style: string; recommended_layout: string; priority: number; reasoning: string;
}

const AUDIENCE_HE: Record<string, string> = { seller: "מוכר פוטנציאלי", buyer: "קונה", investor: "משקיע", luxury: "קוני יוקרה", family: "משפחות", local: "קהל מקומי" };

// property/project angle sets per spec
const LUXURY_ANGLES = ["יוקרה", "לייפסטייל", "בלעדיות", "נוף", "מיקום"];
const INVESTMENT_ANGLES = ["ROI", "הזדמנות", "נתוני שוק", "פוטנציאל צמיחה"];
const FAMILY_ANGLES = ["לייפסטייל", "בתי ספר", "קהילה", "נוחות"];
const PROJECT_ANGLES = ["מודעוּת", "יצירת לידים", "לייפסטייל", "מיקום", "אמון יזם", "דחיפת מלאי"];

function objectiveFor(assetType: string, cdna: CampaignDnaLite): string {
  if (assetType.includes("recruitment") || assetType === "seller_recruitment_ad" || assetType === "buyer_recruitment_ad") return "recruitment";
  if (assetType === "project_awareness_asset" || (assetType === "feed_post" && cdna.trust >= 65)) return "awareness";
  if (assetType === "story") return cdna.ctaIntensity >= 60 ? "conversion" : "engagement";
  if (assetType === "carousel" || assetType === "investment_asset") return "lead_generation";
  return "lead_generation";
}
function layoutFor(assetType: string): string {
  switch (assetType) {
    case "story": return "מסך מלא אנכי 9:16 + CTA תחתון";
    case "carousel": return "3-5 שקופיות 4:5 + שקופית CTA";
    case "reel_cover": return "כריכה אנכית 9:16 + כותרת מודגשת";
    case "banner": return "באנר רוחבי + לוגו + CTA";
    default: return "ריבועי 4:5 + גיבור + כותרת + CTA";
  }
}

/** Deterministic enrichment of a planned seed asset into a full creative asset. */
function enrichSeed(s: SeedAsset, c: GeneratorContext): CreativeAsset {
  const luxe = c.cdna.luxury >= 65 || c.propertyType === "penthouse";
  const angles = c.entityType === "project" ? PROJECT_ANGLES : c.cdna.investment >= 60 ? INVESTMENT_ANGLES : luxe ? LUXURY_ANGLES : FAMILY_ANGLES;
  const audKey = s.audience_variant ?? (c.cdna.seller >= c.cdna.buyer ? "local" : "buyer");
  const objective = objectiveFor(s.asset_type, c.cdna);
  return {
    asset_type: s.asset_type, title: s.title || c.conceptTitle || `${CREATIVE_ASSET_TYPE_LABELS[s.asset_type] ?? s.asset_type}`,
    objective, audience: AUDIENCE_HE[audKey] ?? audKey,
    marketing_angle: c.conceptAngle || angles[0], emotional_trigger: c.conceptTrigger || (luxe ? "יוקרה" : c.cdna.urgency >= 60 ? "דחיפות" : "ביטחון"),
    visual_hook: s.purpose ? `ויזואל התומך ב${s.purpose}` : (luxe ? "נוף/חלל מרשים" : "גיבור נכס ברור"),
    copy_hook: s.recommended_message || c.conceptTitle || "מסר ערך מותאם",
    cta_style: s.recommended_cta || (c.cdna.ctaIntensity >= 60 ? "וואטסאפ ישיר" : "לפרטים נוספים"),
    recommended_layout: layoutFor(s.asset_type), priority: s.priority || 1,
    reasoning: buildReasoning(s, c, objective),
  };
}

function buildReasoning(s: SeedAsset, c: GeneratorContext, objective: string): string {
  const bits: string[] = [];
  bits.push(`נגזר מתוכנית הקמפיין (${CREATIVE_ASSET_TYPE_LABELS[s.asset_type] ?? s.asset_type})`);
  bits.push(`מטרה: ${OBJECTIVE_LABELS[objective] ?? objective}`);
  if (s.audience_variant) bits.push(`קהל ייעודי: ${AUDIENCE_HE[s.audience_variant] ?? s.audience_variant}`);
  if (c.cdna.luxury >= 65) bits.push("דגש יוקרה לפי Campaign DNA");
  if (c.cdna.investment >= 60) bits.push("דגש השקעה לפי Campaign DNA");
  if (c.neighborhood || c.city) bits.push(`התאמה מקומית ל${c.neighborhood || c.city}`);
  return `ZONO ייצר נכס זה כי: ${bits.join(" · ")}.`;
}

/** Default generator: from planned seeds, else synthesize a baseline set from Campaign DNA. */
export function generateCreativeAssets(c: GeneratorContext): CreativeAsset[] {
  if (c.seeds.length) return c.seeds.slice(0, 16).map((s) => enrichSeed(s, c));
  // fallback baseline if a campaign has no planned assets
  const baseline: SeedAsset[] = [
    { asset_type: "feed_post", title: null, purpose: "ערך נכס", recommended_message: null, recommended_cta: null, audience_variant: null, priority: 1 },
    { asset_type: "story", title: null, purpose: "דחיפות", recommended_message: null, recommended_cta: null, audience_variant: "buyer", priority: 2 },
    { asset_type: "carousel", title: null, purpose: "נקודות שיא", recommended_message: null, recommended_cta: null, audience_variant: null, priority: 3 },
  ];
  return baseline.map((s) => enrichSeed(s, c));
}

/** Coerce AI output into a safe CreativeAsset. */
export function normalizeCreativeAsset(raw: unknown): CreativeAsset | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  if (!s("title") && !s("asset_type")) return null;
  return {
    asset_type: s("asset_type") || "feed_post", title: s("title") || "נכס שיווקי", objective: s("objective") || "lead_generation",
    audience: s("audience"), marketing_angle: s("marketing_angle"), emotional_trigger: s("emotional_trigger"),
    visual_hook: s("visual_hook"), copy_hook: s("copy_hook"), cta_style: s("cta_style") || "וואטסאפ ישיר",
    recommended_layout: s("recommended_layout") || layoutFor(s("asset_type") || "feed_post"),
    priority: typeof r.priority === "number" ? (r.priority as number) : 1, reasoning: s("reasoning"),
  };
}
