// ============================================================================
// ZONO — Creative Studio + Real Estate Marketing DNA · Pure engine (client-safe)
// ----------------------------------------------------------------------------
// Phase 1 foundation: catalogs, labels, default ZONO real-estate marketing
// rules, DNA score definitions, and a DETERMINISTIC feedback→DNA score nudger.
// No AI, no I/O. Real AI analysis (Gemini/OpenAI Vision) arrives in Phase 2.
// ============================================================================

export type EntityType = "agent" | "office" | "property" | "project";
export const ENTITY_LABELS: Record<string, string> = { agent: "סוכן", office: "משרד", property: "נכס", project: "פרויקט" };
export const ENTITY_ICONS: Record<string, string> = { agent: "UserCheck", office: "Building2", property: "Home", project: "Building" };

// ── asset types + categories ──────────────────────────────────────────────────
export const ASSET_TYPE_LABELS: Record<string, string> = {
  logo: "לוגו", agent_photo: "תמונת סוכן", office_photo: "תמונת משרד", property_photo: "תמונת נכס", floor_plan: "תוכנית דירה",
  drone_photo: "צילום רחפן", project_render: "הדמיית פרויקט", brochure: "ברושור", approved_ad: "מודעה שאושרה", rejected_ad: "מודעה שנפסלה",
  social_post: "פוסט", story: "סטורי", carousel: "קרוסלה", banner: "באנר", website_screenshot: "צילום אתר",
  competitor_reference: "רפרנס מתחרה", neighborhood_reference: "רפרנס שכונה", other: "אחר",
};
export const ASSET_CATEGORY_LABELS: Record<string, string> = {
  agent_brand: "מותג סוכן", office_brand: "מותג משרד", property: "נכס", project: "פרויקט", campaign: "קמפיין", neighborhood: "שכונה", competitor: "מתחרה", reference: "רפרנס",
};

// ── library filters ─────────────────────────────────────────────────────────────
export interface FilterDef { key: string; label: string; match: (a: AssetLike) => boolean }
export interface AssetLike {
  asset_type: string; is_approved_reference: boolean; is_rejected_reference: boolean; is_competitor_reference: boolean;
  is_property_photo: boolean; is_floor_plan: boolean; is_project_render: boolean; is_agent_brand_asset: boolean;
}
export const LIBRARY_FILTERS: FilterDef[] = [
  { key: "all", label: "הכל", match: () => true },
  { key: "logos", label: "לוגואים", match: (a) => a.asset_type === "logo" },
  { key: "property_photos", label: "תמונות נכס", match: (a) => a.is_property_photo || a.asset_type === "property_photo" || a.asset_type === "drone_photo" },
  { key: "floor_plans", label: "תוכניות", match: (a) => a.is_floor_plan || a.asset_type === "floor_plan" },
  { key: "renders", label: "הדמיות", match: (a) => a.is_project_render || a.asset_type === "project_render" },
  { key: "approved_ads", label: "מודעות שאושרו", match: (a) => a.is_approved_reference || a.asset_type === "approved_ad" },
  { key: "rejected_ads", label: "מודעות שנפסלו", match: (a) => a.is_rejected_reference || a.asset_type === "rejected_ad" },
  { key: "stories", label: "סטוריז", match: (a) => a.asset_type === "story" },
  { key: "carousels", label: "קרוסלות", match: (a) => a.asset_type === "carousel" },
  { key: "competitors", label: "רפרנסים מתחרים", match: (a) => a.is_competitor_reference || a.asset_type === "competitor_reference" },
  { key: "neighborhood", label: "שכונה", match: (a) => a.asset_type === "neighborhood_reference" },
  { key: "other", label: "אחר", match: (a) => a.asset_type === "other" },
];

// ── badges derived from boolean flags ─────────────────────────────────────────
export interface Badge { label: string; tone: string }
export function assetBadges(a: AssetLike): Badge[] {
  const out: Badge[] = [];
  if (a.is_approved_reference) out.push({ label: "מאושר", tone: "bg-success-soft text-success" });
  if (a.is_rejected_reference) out.push({ label: "נפסל", tone: "bg-danger-soft text-danger" });
  if (a.is_competitor_reference) out.push({ label: "מתחרה", tone: "bg-warning-soft text-warning" });
  if (a.is_property_photo) out.push({ label: "תמונת נכס", tone: "bg-brand-soft text-brand-strong" });
  if (a.is_floor_plan) out.push({ label: "תוכנית דירה", tone: "bg-surface text-ink" });
  if (a.is_project_render) out.push({ label: "הדמיית פרויקט", tone: "bg-brand-soft text-brand-strong" });
  if (a.is_agent_brand_asset) out.push({ label: "חומר סוכן", tone: "bg-surface text-muted" });
  return out;
}

// ── upload validation ──────────────────────────────────────────────────────────
export const ALLOWED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf", "image/svg+xml", "video/mp4"];
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB
export function validateUpload(file: { type: string; size: number }): { ok: boolean; error?: string } {
  if (!ALLOWED_MIME.includes(file.type)) return { ok: false, error: "סוג קובץ לא נתמך (png/jpg/webp/pdf/svg/mp4)" };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "הקובץ גדול מדי (מקסימום 50MB)" };
  return { ok: true };
}

// ── DNA score definitions (the 0-100 cards) ───────────────────────────────────
export interface ScoreDef { key: string; label: string }
export const DNA_SCORES: ScoreDef[] = [
  { key: "luxury_score", label: "רמת יוקרה" },
  { key: "urgency_score", label: "רמת דחיפות" },
  { key: "sales_aggressiveness_score", label: "רמת מכירתיות" },
  { key: "modern_score", label: "רמת מודרניות" },
  { key: "investment_focus_score", label: "פוקוס השקעה" },
  { key: "lifestyle_focus_score", label: "פוקוס לייפסטייל" },
  { key: "seller_focus_score", label: "פוקוס גיוס מוכרים" },
  { key: "buyer_focus_score", label: "פוקוס גיוס קונים" },
  { key: "visual_density_score", label: "צפיפות ויזואלית" },
  { key: "ai_generated_score", label: "מראה AI" },
];

// ── feedback catalog ──────────────────────────────────────────────────────────
export interface FeedbackDef { type: string; label: string; tone?: string }
export const FEEDBACK_BUTTONS: FeedbackDef[] = [
  { type: "liked", label: "אהבתי", tone: "bg-success-soft text-success" },
  { type: "disliked", label: "לא בכיוון", tone: "bg-danger-soft text-danger" },
  { type: "more_luxury", label: "יוקרתי יותר" },
  { type: "less_ai", label: "פחות AI" },
  { type: "too_busy", label: "נקי יותר" },
  { type: "more_sales", label: "יותר מכירתי" },
  { type: "more_real_estate", label: "יותר נדל״ני" },
  { type: "more_local", label: "יותר מקומי" },
  { type: "more_investment", label: "יותר השקעה" },
  { type: "more_lifestyle", label: "יותר לייפסטייל" },
  { type: "more_seller_focused", label: "יותר מוכרים" },
  { type: "more_buyer_focused", label: "יותר קונים" },
  { type: "save_as_agent_style", label: "שמור כסגנון סוכן" },
  { type: "save_as_property_style", label: "שמור כסגנון נכס" },
  { type: "save_as_project_style", label: "שמור כסגנון פרויקט" },
];

// ── DEFAULT ZONO real-estate marketing rules ──────────────────────────────────
export const DEFAULT_AVOID_RULES: string[] = [
  "מראה AI גנרי", "יוקרה מזויפת", "אלמנטים פוטוריסטיים / HUD לא רלוונטיים", "בנייה ישראלית לא מציאותית",
  "דירות בלתי אפשריות", "עברית לא קריאה", "RTL שגוי", "שימוש יתר בזהב", "רעש ויזואלי מוגזם",
  "תמונות סוכן סטוק גנריות", "אנשים מזויפים שנראים AI", "תמונות נכס שלא תואמות את המודעה", "ויזואלים מטעים",
  "הבטחות מוגזמות", "מראה דובאי/מיאמי לא רלוונטי (אלא אם פרויקט יוקרה דורש)",
];
export const DEFAULT_PREFER_RULES: string[] = [
  "הקשר נדל״ן ישראלי אמיתי", "ערך נכס ברור", "סיגנל שכונה ברור", "קריאוּת חזקה במובייל", "CTA שמתחיל בוואטסאפ",
  "אמון ואמינות", "מומחיות מקומית", "סמכות הסוכן", "רלוונטיות ספציפית לנכס", "התאמה לקהל מוכרים/קונים",
  "היררכיה נקייה", "עקביות מותגית",
];

// ── deterministic feedback → DNA score nudge ──────────────────────────────────
export type DnaScores = {
  luxury_score: number; urgency_score: number; modern_score: number; sales_aggressiveness_score: number;
  investment_focus_score: number; lifestyle_focus_score: number; seller_focus_score: number; buyer_focus_score: number;
  visual_density_score: number; ai_generated_score: number;
};
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const STEP = 8;
/** Pure nudge: given current scores and a feedback type, return adjusted scores. */
export function applyFeedbackToScores(scores: DnaScores, feedbackType: string): DnaScores {
  const s = { ...scores };
  switch (feedbackType) {
    case "more_luxury": s.luxury_score = clamp(s.luxury_score + STEP); break;
    case "less_luxury": s.luxury_score = clamp(s.luxury_score - STEP); break;
    case "more_modern": s.modern_score = clamp(s.modern_score + STEP); break;
    case "less_modern": s.modern_score = clamp(s.modern_score - STEP); break;
    case "more_sales": s.sales_aggressiveness_score = clamp(s.sales_aggressiveness_score + STEP); break;
    case "less_sales": s.sales_aggressiveness_score = clamp(s.sales_aggressiveness_score - STEP); break;
    case "less_ai": s.ai_generated_score = clamp(s.ai_generated_score - STEP); break;
    case "more_premium": s.luxury_score = clamp(s.luxury_score + STEP); s.ai_generated_score = clamp(s.ai_generated_score - STEP / 2); break;
    case "too_busy": s.visual_density_score = clamp(s.visual_density_score - STEP); break;
    case "too_empty": s.visual_density_score = clamp(s.visual_density_score + STEP); break;
    case "more_investment": s.investment_focus_score = clamp(s.investment_focus_score + STEP); break;
    case "more_lifestyle": s.lifestyle_focus_score = clamp(s.lifestyle_focus_score + STEP); break;
    case "more_seller_focused": s.seller_focus_score = clamp(s.seller_focus_score + STEP); break;
    case "more_buyer_focused": s.buyer_focus_score = clamp(s.buyer_focus_score + STEP); break;
    case "more_real_estate": case "more_local": s.ai_generated_score = clamp(s.ai_generated_score - STEP / 2); break;
    default: break; // liked/disliked/approved/rejected/save_as_* do not nudge scores
  }
  return s;
}
