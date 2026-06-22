// ============================================================================
// ZONO — Creative Studio · Mock Marketing DNA provider
// ----------------------------------------------------------------------------
// No network, no key. Produces a reasonable, LOW-CONFIDENCE DNA derived
// deterministically from asset metadata (counts, flags, tags). Keeps the whole
// flow working when no API key exists, and never crashes.
// ============================================================================
import type { AnalysisInput, MarketingDnaProvider, MarketingDnaResult } from "./types";
import { normalizeResult } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export const mockProvider: MarketingDnaProvider = {
  name: "mock",
  async analyze(input: AnalysisInput): Promise<MarketingDnaResult> {
    const all = [...input.imageAssets, ...input.metadataAssets];
    const approved = all.filter((a) => a.isApproved);
    const rejected = all.filter((a) => a.isRejected);
    const renders = all.filter((a) => a.isProjectRender);
    const propertyPhotos = all.filter((a) => a.isPropertyPhoto);
    const logos = all.filter((a) => a.assetType === "logo" || a.isAgentBrandAsset);

    const tagPool = Array.from(new Set(all.flatMap((a) => a.tags))).slice(0, 8);
    const signal = Math.min(1, all.length / 12);
    const confidence = clamp(15 + approved.length * 8 + rejected.length * 6 + signal * 20); // low-ish

    const approvedPatterns = approved.length
      ? Array.from(new Set(approved.flatMap((a) => [a.title, ...a.tags].filter(Boolean) as string[]))).slice(0, 6)
      : ["רקע פרימיום נקי", "גיבור נכס חזק", "CTA וואטסאפ ברור"];
    const rejectedPatterns = rejected.length
      ? Array.from(new Set(rejected.flatMap((a) => [a.title, ...a.tags].filter(Boolean) as string[]))).slice(0, 6)
      : ["שימוש יתר בזהב", "מראה AI לא אמין", "RTL שגוי"];

    const result: Partial<MarketingDnaResult> = {
      dna_summary: `ניתוח ראשוני (מצב הדגמה) עבור ${input.entityName}: ${all.length} חומרים, ${approved.length} מאושרים, ${rejected.length} שנפסלו. חבר מפתח API לניתוח מלא.`,
      visual_personality: renders.length || propertyPhotos.length ? "נדל״ני, מבוסס נכס, אמין" : "מותגי, נקי",
      copywriting_tone: "מקצועי, מקומי, ממוקד ערך",
      real_estate_positioning: input.entityType === "project" ? "השקת פרויקט" : input.entityType === "property" ? "שיווק נכס ספציפי" : "סמכות מקומית של הסוכן",
      target_audiences: tagPool.length ? tagPool : ["קונים מקומיים", "מוכרים פוטנציאליים"],
      preferred_campaign_angles: ["ערך נכס ברור", "מומחיות מקומית", "CTA וואטסאפ"],
      rejected_campaign_angles: ["יוקרה מזויפת", "מראה דובאי/מיאמי לא רלוונטי"],
      preferred_cta_styles: ["וואטסאפ ישיר", "לתיאום צפייה"],
      whatsapp_cta_style: { primary: "וואטסאפ", tone: "ישיר ואישי" },
      brand_rules: input.defaultPreferRules.slice(0, 8),
      avoid_rules: input.defaultAvoidRules.slice(0, 10),
      approved_patterns: approvedPatterns,
      rejected_patterns: rejectedPatterns,
      primary_colors: logos.length ? ["#0F3D2E", "#1B1B1B"] : [],
      luxury_score: clamp(45 + renders.length * 6),
      urgency_score: 45,
      modern_score: 55,
      sales_aggressiveness_score: 45,
      investment_focus_score: input.entityType === "project" ? 60 : 45,
      lifestyle_focus_score: 50,
      seller_focus_score: input.entityType === "agent" ? 55 : 45,
      buyer_focus_score: 55,
      visual_density_score: 50,
      ai_generated_score: 30,
      ai_confidence_score: confidence,
    };
    return normalizeResult(result);
  },
};
