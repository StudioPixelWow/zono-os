// ============================================================================
// ZONO — Real Estate Creative Concept Engine (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Entity + Marketing DNA → 4-8 strategic creative CONCEPTS (no visuals).
// This is the default ("mock") generator and the normalizer for AI output.
// Thinks like an Israeli RE marketing strategist / project marketer / Meta Ads
// + listing-conversion + seller-recruitment expert. AI may augment via prompt.
// ============================================================================

export type EntityType = "agent" | "office" | "property" | "project";

export interface ConceptContext {
  entityType: EntityType;
  entityName: string;
  // DNA scores (0-100); default 50 when unknown
  luxury: number; investment: number; lifestyle: number; urgency: number; sales: number;
  sellerFocus: number; buyerFocus: number; dnaConfidence: number;
  preferredAngles: string[]; rejectedAngles: string[]; approvedPatterns: string[]; rejectedPatterns: string[];
  approvedConceptTypes: string[]; rejectedConceptTypes: string[];
  // optional entity hints
  propertyType?: string | null; neighborhood?: string | null; city?: string | null; priceTier?: string | null;
}

export interface GeneratedConcept {
  title: string;
  concept_type: string;
  description: string;
  marketing_angle: string;
  emotional_trigger: string;
  visual_hook: string;
  copy_hook: string;
  recommended_layout: string;
  recommended_cta_style: string;
  recommended_audience: string;
  reasoning: string;
  confidence_score: number;
}

export const CONCEPT_TYPE_LABELS: Record<string, string> = {
  luxury_lifestyle: "יוקרה ולייפסטייל", investment_opportunity: "הזדמנות השקעה", neighborhood_story: "סיפור שכונה",
  dream_home: "בית החלומות", family_living: "מגורי משפחה", exclusive_listing: "נכס בלעדי", premium_penthouse: "פנטהאוז יוקרה",
  garden_apartment_lifestyle: "דירת גן", first_home: "בית ראשון", upgrade_your_life: "שדרוג חיים",
  seller_recruitment: "גיוס מוכרים", buyer_recruitment: "גיוס קונים", project_launch: "השקת פרויקט", presale_opportunity: "הזדמנות פרי-סייל",
  authority_agent: "סוכן סמכות", neighborhood_expert: "מומחה שכונה", developer_prestige: "יוקרת יזם", community_living: "קהילה",
  location_advantage: "יתרון מיקום", urban_lifestyle: "לייפסטייל עירוני", beach_lifestyle: "לייפסטייל חוף", high_roi: "תשואה גבוהה", future_appreciation: "עליית ערך עתידית",
};

interface Template {
  type: string;
  title: string; angle: string; trigger: string; visualHook: string; copyHook: string; layout: string; cta: string; audience: string;
  score: (c: ConceptContext) => number; // base relevance 0-100
}

const ENT = (c: ConceptContext, ...types: EntityType[]) => (types.includes(c.entityType) ? 1 : 0);

const TEMPLATES: Template[] = [
  { type: "luxury_lifestyle", title: "סגנון חיים שלא מתפשרים", angle: "בלעדיות ויוקרה", trigger: "יוקרה", visualHook: "מרפסת עם נוף קו רקיע", copyHook: "כאן מתחילים חיים אחרים", layout: "Hero יוקרתי + פרטים מינימליים", cta: "צפייה פרטית", audience: "קוני יוקרה",
    score: (c) => c.luxury * 0.8 + ENT(c, "property", "project") * 20 },
  { type: "investment_opportunity", title: "המספרים מדברים בעד עצמם", angle: "ROI ונתונים", trigger: "הזדמנות", visualHook: "השוואת מחירים באזור", copyHook: "תשואה שקשה להתעלם ממנה", layout: "נתונים + גרף קצר", cta: "קבלת ניתוח השקעה", audience: "משקיעים",
    score: (c) => c.investment * 0.85 + ENT(c, "property", "project") * 15 },
  { type: "neighborhood_story", title: "השכונה שכולם מדברים עליה", angle: "סיפור מקומי", trigger: "שייכות", visualHook: "רחובות ואנשים מקומיים", copyHook: "לא רק דירה — שכונה", layout: "סטורי טלינג + תמונות מקום", cta: "מדריך שכונה", audience: "קונים מקומיים",
    score: (c) => 55 + c.lifestyle * 0.2 + (c.neighborhood ? 15 : 0) },
  { type: "dream_home", title: "הבית שחיכית לו", angle: "רגש ותחושת בית", trigger: "געגוע", visualHook: "סלון מואר בשעת בוקר", copyHook: "תרגיש בבית מהרגע הראשון", layout: "תמונת גיבור חמה + טקסט קצר", cta: "לתיאום ביקור", audience: "משפרי דיור",
    score: (c) => 50 + c.buyerFocus * 0.3 + c.lifestyle * 0.2 },
  { type: "family_living", title: "מקום לגדול בו", angle: "משפחתיות", trigger: "ביטחון", visualHook: "חצר/פארק וילדים", copyHook: "כל מה שמשפחה צריכה", layout: "אורח חיים + סביבה", cta: "לתיאום ביקור", audience: "משפחות",
    score: (c) => 45 + c.lifestyle * 0.35 + c.buyerFocus * 0.2 },
  { type: "exclusive_listing", title: "בלעדי. לזמן מוגבל.", angle: "בלעדיות + FOMO", trigger: "נדירות", visualHook: "תג בלעדי על הנכס", copyHook: "לא תמצאו את זה במקום אחר", layout: "תג בלעדי + גיבור נכס", cta: "צפייה פרטית", audience: "קונים רציניים",
    score: (c) => 40 + c.luxury * 0.3 + ENT(c, "property") * 25 + c.urgency * 0.15 },
  { type: "premium_penthouse", title: "הנוף שלא מחליפים", angle: "בלעדיות", trigger: "יוקרה", visualHook: "מרפסת ענקית בשקיעה", copyHook: "מעל הכל", layout: "Hero נוף + פרטים", cta: "צפייה פרטית", audience: "קוני יוקרה",
    score: (c) => (c.propertyType === "penthouse" ? 70 : 30) + c.luxury * 0.4 },
  { type: "garden_apartment_lifestyle", title: "החצר הפרטית שלך בלב העיר", angle: "לייפסטייל גינה", trigger: "רוגע", visualHook: "גינה פרטית ירוקה", copyHook: "עיר וטבע באותה כתובת", layout: "גינה + פנים", cta: "לתיאום ביקור", audience: "משפחות / משדרגים",
    score: (c) => (c.propertyType === "garden_apartment" ? 70 : 25) + c.lifestyle * 0.25 },
  { type: "first_home", title: "הצעד הראשון שלך", angle: "נגישות והדרכה", trigger: "התרגשות", visualHook: "זוג צעיר עם מפתחות", copyHook: "הבית הראשון מתחיל כאן", layout: "ידידותי + צעדים", cta: "ייעוץ ראשוני", audience: "רוכשי דירה ראשונה",
    score: (c) => 40 + c.buyerFocus * 0.3 + (c.priceTier === "affordable" ? 20 : 0) },
  { type: "upgrade_your_life", title: "הגיע הזמן לשדרג", angle: "שאיפה", trigger: "צמיחה", visualHook: "מעבר מקטן לגדול", copyHook: "מגיע לך יותר", layout: "לפני/אחרי קונספטואלי", cta: "לתיאום ביקור", audience: "משפרי דיור",
    score: (c) => 45 + c.buyerFocus * 0.25 + c.lifestyle * 0.15 },
  { type: "seller_recruitment", title: "כנראה שהשכן כבר קיבל הצעה", angle: "FOMO", trigger: "הזדמנות", visualHook: "השוואת שכונה", copyHook: "כמה שווה הנכס שלך היום?", layout: "שאלה + הוכחה חברתית", cta: "הערכת שווי", audience: "בעלי נכסים",
    score: (c) => c.sellerFocus * 0.7 + ENT(c, "agent", "office") * 25 },
  { type: "buyer_recruitment", title: "מצאנו בדיוק מה שחיפשת", angle: "התאמה אישית", trigger: "סקרנות", visualHook: "נכסים מותאמים", copyHook: "ספר לנו מה אתה מחפש", layout: "פנייה ישירה + CTA", cta: "וואטסאפ", audience: "קונים פוטנציאליים",
    score: (c) => c.buyerFocus * 0.6 + ENT(c, "agent", "office") * 20 },
  { type: "project_launch", title: "פרויקט חדש נכנס לשוק", angle: "מודעוּת והתרגשות", trigger: "חדשנות", visualHook: "הדמיית פרויקט", copyHook: "ההזדמנות שחיכיתם לה", layout: "הדמיה + הבטחת ערך", cta: "הרשמה מוקדמת", audience: "קונים ומשקיעים",
    score: (c) => ENT(c, "project") * 80 + c.investment * 0.1 },
  { type: "presale_opportunity", title: "מחיר פרי-סייל. לזמן מוגבל.", angle: "תמחור מוקדם + FOMO", trigger: "הזדמנות", visualHook: "תג מחיר השקה", copyHook: "המחיר הזה לא יחזור", layout: "מחיר + טיימר", cta: "הרשמה מוקדמת", audience: "משקיעים מוקדמים",
    score: (c) => ENT(c, "project") * 70 + c.urgency * 0.2 + c.investment * 0.15 },
  { type: "authority_agent", title: "הסוכן שמכיר את האזור הכי טוב", angle: "סמכות ואמון", trigger: "ביטחון", visualHook: "פורטרט מקצועי + הישגים", copyHook: "ניסיון שמוכר", layout: "מיתוג אישי + הוכחה", cta: "צור קשר", audience: "מוכרים וקונים",
    score: (c) => ENT(c, "agent") * 60 + c.sales * 0.2 },
  { type: "neighborhood_expert", title: "מומחה השכונה שלך", angle: "מומחיות מקומית", trigger: "אמון", visualHook: "מפת שכונה + נתונים", copyHook: "כל מה שצריך לדעת על האזור", layout: "מיתוג + נתוני שוק", cta: "מדריך שכונה", audience: "תושבי האזור",
    score: (c) => ENT(c, "agent", "office") * 55 + (c.neighborhood ? 15 : 0) },
  { type: "developer_prestige", title: "החתימה של היזם", angle: "יוקרת מותג", trigger: "אמון ויוקרה", visualHook: "מותג יזם + פרויקטים קודמים", copyHook: "בנייה שאפשר לסמוך עליה", layout: "מיתוג יזם + תיק עבודות", cta: "פרטים על הפרויקט", audience: "קוני יוקרה ומשקיעים",
    score: (c) => ENT(c, "project") * 50 + c.luxury * 0.35 },
  { type: "community_living", title: "קהילה, לא רק בניין", angle: "שייכות", trigger: "חמימות", visualHook: "מרחבים משותפים", copyHook: "כאן מכירים את השכנים", layout: "אורח חיים קהילתי", cta: "פרטים על הפרויקט", audience: "משפחות וזוגות",
    score: (c) => ENT(c, "project") * 40 + c.lifestyle * 0.3 },
  { type: "location_advantage", title: "הכל במרחק הליכה", angle: "נוחות ומיקום", trigger: "פרקטיות", visualHook: "מפה עם נקודות עניין", copyHook: "המיקום עושה את ההבדל", layout: "מפה + יתרונות", cta: "לתיאום ביקור", audience: "קונים מעשיים",
    score: () => 50 },
  { type: "urban_lifestyle", title: "העיר היא הבית שלך", angle: "אנרגיה עירונית", trigger: "חיוניות", visualHook: "קו רקיע ולילה עירוני", copyHook: "לחיות בלב הכל", layout: "עירוני דינמי", cta: "לתיאום ביקור", audience: "צעירים ומשקיעים",
    score: (c) => 35 + c.lifestyle * 0.3 + (c.city ? 10 : 0) },
  { type: "beach_lifestyle", title: "להתעורר מול הים", angle: "לייפסטייל חוף", trigger: "חופש", visualHook: "נוף ים מהבית", copyHook: "חופשה כל יום", layout: "נוף ים + רוגע", cta: "צפייה פרטית", audience: "קוני יוקרה ולייפסטייל",
    score: (c) => 25 + c.lifestyle * 0.3 + c.luxury * 0.2 },
  { type: "high_roi", title: "תשואה שמדברת מספרים", angle: "תשואה", trigger: "רווח", visualHook: "גרף תשואה", copyHook: "ההשקעה שעובדת בשבילך", layout: "נתוני תשואה", cta: "קבלת ניתוח השקעה", audience: "משקיעים",
    score: (c) => c.investment * 0.6 },
  { type: "future_appreciation", title: "האזור שעולה בערכו", angle: "פוטנציאל עתידי", trigger: "חזון", visualHook: "פיתוח עתידי באזור", copyHook: "להיכנס לפני כולם", layout: "מגמה + פיתוח", cta: "קבלת ניתוח השקעה", audience: "משקיעים לטווח ארוך",
    score: (c) => c.investment * 0.5 + c.urgency * 0.15 },
];

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Deterministic generation of 4-8 concepts from context (the default / mock generator). */
export function generateConceptsFromContext(c: ConceptContext): GeneratedConcept[] {
  const approved = new Set(c.approvedConceptTypes);
  const rejected = new Set(c.rejectedConceptTypes);
  const scored = TEMPLATES.map((t) => {
    let s = t.score(c);
    if (approved.has(t.type)) s += 18; // learning: liked types weigh up
    if (rejected.has(t.type)) s -= 30; // learning: rejected types weigh down
    if (c.preferredAngles.some((a) => t.angle.includes(a) || a.includes(t.angle))) s += 6;
    return { t, s };
  }).filter((x) => !rejected.has(x.t.type) || x.s > 40)
    .sort((a, b) => b.s - a.s);

  const top = scored.slice(0, Math.max(4, Math.min(8, scored.filter((x) => x.s >= 40).length || 6)));
  const conf = (s: number) => clamp(0.6 * Math.min(100, s) + 0.4 * (c.dnaConfidence || 40));

  return top.map(({ t, s }) => ({
    title: t.title, concept_type: t.type, description: `${CONCEPT_TYPE_LABELS[t.type]} עבור ${c.entityName} — כיוון ${t.angle} המבוסס על ה-DNA השיווקי.`,
    marketing_angle: t.angle, emotional_trigger: t.trigger, visual_hook: t.visualHook, copy_hook: t.copyHook,
    recommended_layout: t.layout, recommended_cta_style: t.cta, recommended_audience: t.audience,
    reasoning: buildReasoning(c, t.type, s, approved.has(t.type)),
    confidence_score: conf(s),
  }));
}

function buildReasoning(c: ConceptContext, type: string, score: number, learned: boolean): string {
  const bits: string[] = [];
  if (type.includes("luxury") || type === "premium_penthouse" || type === "developer_prestige") bits.push(`רמת יוקרה גבוהה ב-DNA (${c.luxury})`);
  if (type.includes("investment") || type === "high_roi" || type === "future_appreciation") bits.push(`פוקוס השקעה (${c.investment})`);
  if (type === "seller_recruitment") bits.push(`פוקוס גיוס מוכרים (${c.sellerFocus})`);
  if (type === "buyer_recruitment" || type === "first_home") bits.push(`פוקוס גיוס קונים (${c.buyerFocus})`);
  if (c.entityType === "project" && type.includes("project")) bits.push("ישות מסוג פרויקט");
  if (c.neighborhood && type.includes("neighborhood")) bits.push(`רלוונטיות מקומית (${c.neighborhood})`);
  if (learned) bits.push("ZONO למד שקונספט מסוג זה אושר בעבר");
  bits.push(`ציון התאמה ${Math.min(100, Math.round(score))}`);
  return `ZONO בחר בקונספט זה כי: ${bits.join(" · ")}.`;
}

/** Build context from a DNA row + entity meta. Safe defaults when DNA is missing. */
export function contextFromDna(entityType: EntityType, entityName: string, dna: Record<string, unknown> | null, learn: { approvedTypes: string[]; rejectedTypes: string[] }, hints?: { propertyType?: string | null; neighborhood?: string | null; city?: string | null }): ConceptContext {
  const num = (k: string, d = 50) => (dna && typeof dna[k] === "number" ? (dna[k] as number) : d);
  const arr = (k: string): string[] => { const v = dna?.[k]; return Array.isArray(v) ? (v as unknown[]).filter((x) => typeof x === "string") as string[] : []; };
  const luxury = num("luxury_score");
  const priceTier = luxury >= 75 ? "luxury" : luxury >= 55 ? "premium" : luxury >= 35 ? "mid-market" : "affordable";
  return {
    entityType, entityName,
    luxury, investment: num("investment_focus_score"), lifestyle: num("lifestyle_focus_score"), urgency: num("urgency_score"),
    sales: num("sales_aggressiveness_score"), sellerFocus: num("seller_focus_score"), buyerFocus: num("buyer_focus_score"), dnaConfidence: num("ai_confidence_score", 40),
    preferredAngles: arr("preferred_campaign_angles"), rejectedAngles: arr("rejected_campaign_angles"), approvedPatterns: arr("approved_patterns"), rejectedPatterns: arr("rejected_patterns"),
    approvedConceptTypes: learn.approvedTypes, rejectedConceptTypes: learn.rejectedTypes,
    propertyType: hints?.propertyType ?? null, neighborhood: hints?.neighborhood ?? null, city: hints?.city ?? null, priceTier,
  };
}

/** Coerce an AI-provided concept object into a safe GeneratedConcept. */
export function normalizeConcept(raw: unknown): GeneratedConcept | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  const type = str("concept_type") || "location_advantage";
  if (!str("title")) return null;
  return {
    title: str("title"), concept_type: type, description: str("description"), marketing_angle: str("marketing_angle"),
    emotional_trigger: str("emotional_trigger"), visual_hook: str("visual_hook"), copy_hook: str("copy_hook"),
    recommended_layout: str("recommended_layout"), recommended_cta_style: str("recommended_cta_style"), recommended_audience: str("recommended_audience"),
    reasoning: str("reasoning"), confidence_score: clamp(typeof r.confidence_score === "number" ? (r.confidence_score as number) : 60),
  };
}
