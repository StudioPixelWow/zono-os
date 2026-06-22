// ============================================================================
// ZONO — Property Campaign Factory · Engine (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Derives Campaign DNA from the Marketing DNA + concept, and plans a COMPLETE
// asset structure (multiple planned assets) per campaign type — adapted to
// property type, audience, location and price tier. NO designs/visuals/prompts.
// This is the default ("mock") planner and the normalizer for AI plans.
// ============================================================================

export type EntityType = "agent" | "office" | "property" | "project";

export const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  property_marketing: "שיווק נכס", project_launch: "השקת פרויקט", project_awareness: "מודעות לפרויקט", project_presale: "פרי-סייל פרויקט",
  inventory_push: "דחיפת מלאי", seller_recruitment: "גיוס מוכרים", buyer_recruitment: "גיוס קונים", neighborhood_authority: "סמכות שכונתית",
  agent_branding: "מיתוג סוכן", office_branding: "מיתוג משרד", open_house: "בית פתוח", price_reduction: "הורדת מחיר",
  new_listing: "נכס חדש", sold_property: "נמכר", investment_opportunity: "הזדמנות השקעה", luxury_property: "נכס יוקרה",
};

/** Campaign types relevant per entity type (first = default suggestion). */
export function campaignTypesFor(entityType: string): string[] {
  if (entityType === "project") return ["project_launch", "project_awareness", "project_presale", "inventory_push", "investment_opportunity", "luxury_property"];
  if (entityType === "agent") return ["agent_branding", "seller_recruitment", "buyer_recruitment", "neighborhood_authority"];
  if (entityType === "office") return ["office_branding", "neighborhood_authority", "seller_recruitment"];
  return ["property_marketing", "new_listing", "open_house", "price_reduction", "sold_property", "investment_opportunity", "luxury_property", "seller_recruitment"];
}

// ── Campaign DNA ──────────────────────────────────────────────────────────────
export interface MarketingDnaScores {
  luxury: number; urgency: number; investment: number; lifestyle: number; sales: number; sellerFocus: number; buyerFocus: number; modern: number; confidence: number;
}
export interface CampaignDNA {
  urgency: number; trust: number; luxury: number; lifestyle: number; investment: number; seller: number; buyer: number;
  ctaIntensity: number; postingFrequency: string; contentMix: { type: string; share: number }[];
}
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function deriveCampaignDNA(dna: MarketingDnaScores, campaignType: string): CampaignDNA {
  const urgentTypes = ["project_presale", "inventory_push", "price_reduction", "open_house"];
  const sellerTypes = ["seller_recruitment"];
  const buyerTypes = ["buyer_recruitment", "open_house", "new_listing"];
  const urgency = clamp(dna.urgency * 0.6 + (urgentTypes.includes(campaignType) ? 35 : 10));
  const trust = clamp(70 - dna.sales * 0.2 + dna.confidence * 0.2 + (["agent_branding", "office_branding", "neighborhood_authority"].includes(campaignType) ? 15 : 0));
  const seller = clamp(dna.sellerFocus * 0.7 + (sellerTypes.includes(campaignType) ? 30 : 0));
  const buyer = clamp(dna.buyerFocus * 0.7 + (buyerTypes.includes(campaignType) ? 25 : 0));
  const ctaIntensity = clamp(dna.sales * 0.5 + urgency * 0.4);
  const frequency = urgency >= 70 ? "גבוהה (3-4 בשבוע)" : urgency >= 45 ? "בינונית (2 בשבוע)" : "נמוכה (1 בשבוע)";
  const contentMix = buildContentMix(campaignType, dna);
  return { urgency, trust, luxury: clamp(dna.luxury), lifestyle: clamp(dna.lifestyle), investment: clamp(dna.investment), seller, buyer, ctaIntensity, postingFrequency: frequency, contentMix };
}
function buildContentMix(campaignType: string, dna: MarketingDnaScores): { type: string; share: number }[] {
  if (campaignType.startsWith("project")) return [{ type: "מודעות", share: 35 }, { type: "ביקוש", share: 30 }, { type: "לידים", share: 25 }, { type: "הוכחה חברתית", share: 10 }];
  if (campaignType === "seller_recruitment") return [{ type: "סמכות", share: 40 }, { type: "FOMO", share: 30 }, { type: "ערך", share: 30 }];
  if (dna.luxury >= 65) return [{ type: "יוקרה", share: 40 }, { type: "לייפסטייל", share: 30 }, { type: "בלעדיות", share: 30 }];
  return [{ type: "ערך נכס", share: 40 }, { type: "לייפסטייל", share: 30 }, { type: "CTA", share: 30 }];
}

// ── asset planning ────────────────────────────────────────────────────────────
export interface PlannedAsset { asset_type: string; title: string; purpose: string; recommended_message: string; recommended_cta: string; audience_variant: string | null; priority: number }

export interface PlanContext {
  entityType: EntityType; entityName: string; campaignType: string; dna: MarketingDnaScores; cdna: CampaignDNA;
  conceptTitle?: string | null; conceptAngle?: string | null; propertyType?: string | null; neighborhood?: string | null; city?: string | null; priceTier?: string | null;
}

const CTA_WHATSAPP = "וואטסאפ ישיר";
const CTA_VIEWING = "תיאום צפייה פרטית";
const CTA_EVAL = "הערכת שווי";
const CTA_REGISTER = "הרשמה מוקדמת";

/** Deterministic asset plan (the default / mock planner). */
export function planCampaignAssets(c: PlanContext): PlannedAsset[] {
  const loc = c.neighborhood || c.city || "האזור";
  const t = c.campaignType;
  const A: PlannedAsset[] = [];
  const add = (asset_type: string, title: string, purpose: string, msg: string, cta: string, priority: number, audience: string | null = null) =>
    A.push({ asset_type, title, purpose, recommended_message: msg, recommended_cta: cta, audience_variant: audience, priority });

  if (c.entityType === "project") {
    switch (t) {
      case "project_awareness":
        add("feed_post", "מודעוּת: פרויקט חדש", "להציג את הפרויקט לקהל הרחב", `פרויקט חדש ב${loc}`, CTA_WHATSAPP, 1);
        add("story", "טיזר ראשוני", "לעורר סקרנות", "משהו חדש מגיע", CTA_WHATSAPP, 2);
        add("carousel", "חזון הפרויקט", "להעביר ערך וייחוד", "מה הופך את הפרויקט למיוחד", CTA_REGISTER, 3);
        break;
      case "project_presale":
        add("feed_post", "פרי-סייל: מחיר השקה", "להמיר מתעניינים מוקדמים", "מחיר פרי-סייל לזמן מוגבל", CTA_REGISTER, 1);
        add("story", "דחיפות פרי-סייל", "FOMO", "המחיר הזה לא יחזור", CTA_REGISTER, 2);
        add("feed_post", "תשואה צפויה", "לפנות למשקיעים", "הזדמנות כניסה מוקדמת", CTA_WHATSAPP, 3, "investor");
        break;
      case "inventory_push": case "project_launch": default:
        add("feed_post", "השקה: ההזדמנות שחיכיתם לה", "מודעות + ביקוש", `${c.entityName} יוצא לדרך`, CTA_REGISTER, 1);
        add("story", "ספירה לאחור להשקה", "ביקוש ודחיפות", "ההשקה מתקרבת", CTA_REGISTER, 2);
        add("carousel", "סוגי דירות וזמינות", "לידים", "מצא את הדירה שלך", CTA_WHATSAPP, 3);
        add("feed_post", "יחידות אחרונות", "דחיפת מלאי", "הזדמנות אחרונה להיכנס", CTA_WHATSAPP, 4);
        add("reel_cover", "סיור בפרויקט", "מעורבות", "הצצה ראשונה", CTA_REGISTER, 5);
        break;
    }
    return A;
  }

  if (c.entityType === "agent" || c.entityType === "office") {
    switch (t) {
      case "seller_recruitment":
        add("feed_post", "כנראה שהשכן כבר קיבל הצעה", "FOMO לבעלי נכסים", `כמה שווה הנכס שלך ב${loc} היום?`, CTA_EVAL, 1, "seller");
        add("story", "הוכחה חברתית", "אמון", "עוד נכס נמכר באזור", CTA_EVAL, 2, "seller");
        add("feed_post", "המומחה של האזור", "סמכות", `אני מכיר את ${loc} הכי טוב`, CTA_WHATSAPP, 3);
        break;
      case "buyer_recruitment":
        add("feed_post", "מצאנו בדיוק מה שחיפשת", "גיוס קונים", "ספר לנו מה אתה מחפש", CTA_WHATSAPP, 1, "buyer");
        add("story", "נכסים חדשים השבוע", "מעורבות", "הגיעו נכסים חדשים", CTA_WHATSAPP, 2, "buyer");
        break;
      case "neighborhood_authority":
        add("carousel", `המדריך לשכונת ${loc}`, "סמכות מקומית", "כל מה שצריך לדעת על האזור", CTA_WHATSAPP, 1);
        add("feed_post", "נתוני שוק מקומיים", "אמון ומומחיות", "מה קורה במחירים באזור", CTA_WHATSAPP, 2);
        break;
      case "office_branding": case "agent_branding": default:
        add("feed_post", "מי אנחנו", "מיתוג ואמון", "הניסיון שמוכר", CTA_WHATSAPP, 1);
        add("story", "מאחורי הקלעים", "חיבור אישי", "הצוות שמלווה אתכם", CTA_WHATSAPP, 2);
        add("feed_post", "הצלחות אחרונות", "הוכחה חברתית", "עוד עסקה שנסגרה", CTA_WHATSAPP, 3);
        break;
    }
    return A;
  }

  // property
  const luxe = c.cdna.luxury >= 65 || t === "luxury_property" || c.propertyType === "penthouse";
  switch (t) {
    case "luxury_property":
      add("feed_post", "הנוף שלא מחליפים", "יוקרה ובלעדיות", `נכס יוקרה ב${loc}`, CTA_VIEWING, 1);
      add("feed_post", "סגנון חיים שלא מתפשרים", "לייפסטייל", "כאן מתחילים חיים אחרים", CTA_VIEWING, 2);
      add("story", "צפייה פרטית", "המרה", "צפייה בתיאום בלבד", CTA_VIEWING, 3);
      add("carousel", "נקודות השיא של הנכס", "ערך", "כל הפרטים שעושים את ההבדל", CTA_VIEWING, 4);
      add("feed_post", "חושב למכור נכס דומה?", "גיוס מוכרים", "כמה שווה הנכס שלך?", CTA_EVAL, 5, "seller");
      break;
    case "open_house":
      add("feed_post", "בית פתוח בסוף השבוע", "הנעה לפעולה", `בית פתוח ב${loc}`, CTA_WHATSAPP, 1);
      add("story", "תזכורת בית פתוח", "דחיפות", "מחר נפגשים בנכס", CTA_WHATSAPP, 2, "buyer");
      add("story", "מיקום הנכס", "נוחות", "איך מגיעים", CTA_WHATSAPP, 3);
      break;
    case "price_reduction":
      add("feed_post", "מחיר עודכן", "דחיפות והזדמנות", "הזדמנות חדשה במחיר", CTA_VIEWING, 1, "buyer");
      add("story", "לזמן מוגבל", "FOMO", "המחיר החדש לא יישאר זמן רב", CTA_VIEWING, 2);
      break;
    case "sold_property":
      add("feed_post", "נמכר!", "הוכחה חברתית", `עוד נכס נמכר ב${loc}`, CTA_EVAL, 1);
      add("story", "מחפשים את הבא", "גיוס", "הנכס שלך יכול להיות הבא", CTA_EVAL, 2, "seller");
      break;
    case "investment_opportunity":
      add("feed_post", "המספרים מדברים בעד עצמם", "ROI", "תשואה שקשה להתעלם ממנה", CTA_WHATSAPP, 1, "investor");
      add("carousel", "ניתוח השקעה", "ערך למשקיע", "כל הנתונים במקום אחד", CTA_WHATSAPP, 2, "investor");
      add("story", "פוטנציאל עתידי", "חזון", "להיכנס לפני כולם", CTA_WHATSAPP, 3, "investor");
      break;
    case "new_listing": case "property_marketing": default:
      add("feed_post", luxe ? "נכס יוקרה חדש" : "נכס חדש שכדאי להכיר", "מודעות + ערך", `${c.conceptTitle ?? "נכס חדש"} ב${loc}`, CTA_VIEWING, 1);
      add("feed_post", "החיים בנכס", "לייפסטייל", "תרגיש בבית מהרגע הראשון", CTA_VIEWING, 2, "buyer");
      add("feed_post", "יתרון המיקום", "ערך מעשי", `הכל במרחק הליכה ב${loc}`, CTA_WHATSAPP, 3);
      add("story", "דחיפות", "המרה", "נכסים כאלה נחטפים", CTA_VIEWING, 4);
      add("story", "צפייה פרטית", "המרה", "מתי נוח לבוא לראות?", CTA_VIEWING, 5);
      add("story", "מיקום הנכס", "נוחות", "הסביבה של הנכס", CTA_WHATSAPP, 6);
      add("carousel", "נקודות השיא של הנכס", "ערך", "כל מה שחשוב לדעת", CTA_VIEWING, 7);
      add("feed_post", "חושב למכור?", "גיוס מוכרים", "כמה שווה הנכס שלך?", CTA_EVAL, 8, "seller");
      add("feed_post", "מחפש נכס כזה?", "גיוס קונים", "ספר לנו מה אתה מחפש", CTA_WHATSAPP, 9, "buyer");
      break;
  }
  return A;
}

export function campaignTitle(entityName: string, campaignType: string): string {
  return `${CAMPAIGN_TYPE_LABELS[campaignType] ?? campaignType} · ${entityName}`;
}

export function campaignReasoning(c: PlanContext, assetCount: number): string {
  const bits: string[] = [];
  bits.push(`סוג קמפיין: ${CAMPAIGN_TYPE_LABELS[c.campaignType] ?? c.campaignType}`);
  if (c.cdna.luxury >= 65) bits.push(`רמת יוקרה גבוהה (${c.cdna.luxury}) → דגש בלעדיות ולייפסטייל`);
  if (c.cdna.urgency >= 60) bits.push(`דחיפות גבוהה (${c.cdna.urgency}) → תדירות ${c.cdna.postingFrequency}`);
  if (c.cdna.seller >= 55) bits.push("פוקוס מוכרים → נוספה גרסת גיוס מוכרים");
  if (c.cdna.buyer >= 55) bits.push("פוקוס קונים → נוספה גרסת גיוס קונים");
  if (c.neighborhood || c.city) bits.push(`התאמה מקומית ל${c.neighborhood || c.city}`);
  bits.push(`סה״כ ${assetCount} נכסים שיווקיים מתוכננים`);
  return `ZONO בנה קמפיין זה כי: ${bits.join(" · ")}.`;
}

/** Coerce an AI-provided asset into a safe PlannedAsset. */
export function normalizePlannedAsset(raw: unknown): PlannedAsset | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  if (!s("asset_type") && !s("title")) return null;
  return {
    asset_type: s("asset_type") || "feed_post", title: s("title") || "נכס שיווקי", purpose: s("purpose"),
    recommended_message: s("recommended_message"), recommended_cta: s("recommended_cta") || CTA_WHATSAPP,
    audience_variant: s("audience_variant") || null, priority: typeof r.priority === "number" ? (r.priority as number) : 1,
  };
}

export function scoresFromDna(dna: Record<string, unknown> | null): MarketingDnaScores {
  const n = (k: string, d = 50) => (dna && typeof dna[k] === "number" ? (dna[k] as number) : d);
  return {
    luxury: n("luxury_score"), urgency: n("urgency_score"), investment: n("investment_focus_score"), lifestyle: n("lifestyle_focus_score"),
    sales: n("sales_aggressiveness_score"), sellerFocus: n("seller_focus_score"), buyerFocus: n("buyer_focus_score"), modern: n("modern_score"), confidence: n("ai_confidence_score", 40),
  };
}
