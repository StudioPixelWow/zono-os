// ============================================================================
// ZONO — Copy Generation Engine (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Approved creative asset + DNA → all marketing COPY (headline/sub/body/cta,
// caption, story text, carousel slides, WhatsApp, scripts, reel hook). Hebrew,
// RTL, real-estate aware. Default ("mock") generator + normalizer for AI.
// ============================================================================

export const COPY_TYPE_LABELS: Record<string, string> = {
  headline: "כותרת", subheadline: "כותרת משנה", body: "גוף טקסט", caption: "כיתוב", story_text: "טקסט סטורי",
  carousel_slides: "שקופיות קרוסלה", whatsapp_message: "הודעת וואטסאפ", lead_form: "טקסט טופס ליד", cta: "קריאה לפעולה",
  reel_hook: "וו לריל", seller_script: "תסריט גיוס מוכרים", buyer_script: "תסריט גיוס קונים", project_launch_text: "טקסט השקת פרויקט",
  open_house_text: "טקסט בית פתוח", neighborhood_content: "תוכן שכונה", agent_branding_content: "תוכן מיתוג סוכן",
};
export const COPY_MODE_LABELS: Record<string, string> = {
  luxury: "יוקרה", premium: "פרימיום", investment: "השקעה", lifestyle: "לייפסטייל", family: "משפחתי", authority: "סמכות",
  urgency: "דחיפות", educational: "חינוכי", emotional: "רגשי", seller_recruitment: "גיוס מוכרים", buyer_recruitment: "גיוס קונים", project_launch: "השקת פרויקט",
};

export interface CopyContext {
  entityType: string; entityName: string; assetType: string; objective: string; audience: string;
  marketingAngle: string; emotionalTrigger: string; copyHook: string; ctaStyle: string;
  luxury: number; investment: number; lifestyle: number; urgency: number; seller: number; buyer: number;
  propertyType?: string | null; neighborhood?: string | null; city?: string | null; priceTier?: string | null;
  approvedPatterns: string[]; rejectedPatterns: string[]; toneNote?: string | null;
}

export interface GeneratedCopy {
  copy_type: string; title: string; headline: string; subheadline: string; body: string; cta: string;
  platform: string; tone: string; audience: string; reasoning: string;
}

function locStr(c: CopyContext): string { return c.neighborhood || c.city || ""; }
function locSuffix(c: CopyContext): string { const l = locStr(c); return l ? ` ב${l}` : ""; }

function pickMode(c: CopyContext): string {
  if (c.objective === "recruitment" && c.seller >= c.buyer) return "seller_recruitment";
  if (c.objective === "recruitment") return "buyer_recruitment";
  if (c.entityType === "project") return "project_launch";
  if (c.luxury >= 65) return "luxury";
  if (c.investment >= 60) return "investment";
  if (c.urgency >= 65) return "urgency";
  if (c.lifestyle >= 55) return "lifestyle";
  return "premium";
}

const CTA_BY_STYLE: Record<string, string> = {
  "וואטסאפ ישיר": "דברו איתנו עכשיו בוואטסאפ", "תיאום צפייה פרטית": "לתיאום סיור פרטי", "הערכת שווי": "לקבלת הערכת שווי ללא התחייבות",
  "הרשמה מוקדמת": "להרשמה מוקדמת לפרויקט", "לפרטים נוספים": "לפרטים נוספים בוואטסאפ",
};
function ctaText(c: CopyContext): string { return CTA_BY_STYLE[c.ctaStyle] ?? c.ctaStyle ?? "דברו איתנו בוואטסאפ"; }

/** Headline by mode — Hebrew, RE-aware. */
function headlineFor(mode: string, c: CopyContext): string {
  const loc = locStr(c);
  switch (mode) {
    case "luxury": return c.propertyType === "penthouse" ? "לא כל נוף נולד שווה" : "יוקרה שלא מתפשרת";
    case "investment": return "המספרים מדברים בעד עצמם";
    case "urgency": return "נכסים כאלה לא נשארים זמן רב";
    case "lifestyle": return loc ? `ככה נראים החיים${locSuffix(c)}` : "ככה נראים החיים שחיכית להם";
    case "family": return "מקום לגדול בו";
    case "seller_recruitment": return "השכן כבר בדק כמה הבית שלו שווה";
    case "buyer_recruitment": return "מצאנו בדיוק מה שחיפשת";
    case "project_launch": return loc ? `פרויקט חדש${locSuffix(c)}` : "פרויקט חדש נכנס לשוק";
    case "authority": return loc ? `המומחה של ${loc}` : "הסמכות שמוכרת";
    default: return c.copyHook || "ההזדמנות שחיכית לה";
  }
}
function subFor(mode: string, c: CopyContext): string {
  switch (mode) {
    case "luxury": return "מרפסת, נוף פתוח ופרטים שלא רואים כל יום.";
    case "investment": return "תשואה ופוטנציאל צמיחה שקשה להתעלם מהם.";
    case "urgency": return "כדאי לבדוק עכשיו לפני שמישהו אחר יקדים אתכם.";
    case "seller_recruitment": return "הגיע הזמן לבדוק גם את שלך.";
    case "buyer_recruitment": return "ספרו לנו מה אתם מחפשים ונמצא בשבילכם.";
    case "project_launch": return "ההזדמנות להיכנס מוקדם — לפני כולם.";
    case "family": return "קרוב לכל מה שחשוב — בתי ספר, פארקים וקהילה.";
    default: return c.copyHook || "כל הפרטים שעושים את ההבדל.";
  }
}

/** Default generator: a full set of copy versions for one creative asset. */
export function generateCopySet(c: CopyContext): GeneratedCopy[] {
  const mode = pickMode(c);
  const loc = locStr(c);
  const headline = headlineFor(mode, c);
  const sub = subFor(mode, c);
  const cta = ctaText(c);
  const tone = COPY_MODE_LABELS[mode] ?? mode;
  const platform = c.assetType === "story" ? "Instagram Story" : c.assetType === "reel_cover" ? "Reels" : c.assetType === "whatsapp_message" ? "WhatsApp" : "Instagram/Facebook";
  const reason = `ZONO כתב במצב ״${tone}״ לפי ה-DNA (יוקרה ${c.luxury}, השקעה ${c.investment}, דחיפות ${c.urgency}) ובהתאמה לקהל ${c.audience}${loc ? ` ולמיקום ${loc}` : ""}.`;
  const base = (copy_type: string, over: Partial<GeneratedCopy>): GeneratedCopy => ({
    copy_type, title: COPY_TYPE_LABELS[copy_type] ?? copy_type, headline, subheadline: sub, body: "", cta, platform, tone, audience: c.audience, reasoning: reason, ...over,
  });

  const out: GeneratedCopy[] = [];
  out.push(base("headline", { body: "" }));
  out.push(base("subheadline", { headline: sub, subheadline: "", body: "" }));
  out.push(base("body", { body: `${headline}. ${sub} ${loc ? `מיקום מנצח${locSuffix(c)}.` : ""} ${cta}.` }));
  out.push(base("cta", { headline: cta, subheadline: "", body: "" }));
  out.push(base("caption", { body: `${headline} ✨\n${sub}\n📍 ${loc || "אזור מבוקש"}\n${cta} 👇` }));

  // asset-type specific
  if (c.assetType === "story") {
    out.push(base("story_text", { body: `סטורי 1: ${headline}\nסטורי 2: ${sub}\nסטורי 3: ${cta} 👆` }));
    out.push(base("reel_hook", { headline: mode === "luxury" ? "עצרו רגע — תראו את הנוף הזה" : "אל תפספסו את זה", subheadline: "", body: "" }));
  }
  if (c.assetType === "carousel") {
    out.push(base("carousel_slides", { body: `שקופית 1 — ${headline}\nשקופית 2 — ${sub}\nשקופית 3 — היתרונות${locSuffix(c)}\nשקופית 4 — ${cta}` }));
  }
  // whatsapp + scripts
  out.push(base("whatsapp_message", { copy_type: "whatsapp_message", headline: "", subheadline: "", body: `היי 🙂 ${headline}. ${sub} אשמח לשלוח פרטים — ${cta}?`, platform: "WhatsApp" }));
  if (c.objective === "recruitment" && c.seller >= c.buyer) out.push(base("seller_script", { body: `פתיח: ${headlineFor("seller_recruitment", c)}\nגוף: ${subFor("seller_recruitment", c)}\nסגירה: ${ctaText({ ...c, ctaStyle: "הערכת שווי" })}` }));
  if (c.objective === "recruitment" && c.buyer > c.seller) out.push(base("buyer_script", { body: `פתיח: ${headlineFor("buyer_recruitment", c)}\nגוף: ${subFor("buyer_recruitment", c)}\nסגירה: ${cta}` }));
  if (c.entityType === "project") out.push(base("project_launch_text", { body: `${headlineFor("project_launch", c)} — ${subFor("project_launch", c)} ${cta}.` }));
  if (loc) out.push(base("neighborhood_content", { headline: `כל מה שצריך לדעת על ${loc}`, subheadline: "המדריך המקומי שלכם", body: `${loc} מציעה שילוב של נגישות, קהילה וערך נדל״ני. ${cta}.` }));

  return out.slice(0, 12);
}

/** Coerce AI output into a safe GeneratedCopy. */
export function normalizeCopy(raw: unknown): GeneratedCopy | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  const type = s("copy_type") || "headline";
  if (!s("headline") && !s("body") && !s("cta")) return null;
  return {
    copy_type: type, title: s("title") || COPY_TYPE_LABELS[type] || type, headline: s("headline"), subheadline: s("subheadline"),
    body: s("body"), cta: s("cta"), platform: s("platform") || "Instagram/Facebook", tone: s("tone"), audience: s("audience"), reasoning: s("reasoning"),
  };
}
