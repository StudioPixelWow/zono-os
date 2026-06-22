/**
 * ZONO Master Creative Prompt — pure, client-safe. Turns property facts + brand
 * identity + a creative style into a strong, brand-aware Nano-Banana-ready master
 * prompt (not a UI card). Enforces Hebrew RTL, no invented details, premium social
 * ad (not app UI / dashboard card), uploaded photo as visual anchor, and only uses
 * brand assets (logo / agent photo / colors) that actually exist (#P3-6/7/8/9).
 */
import type { BrandSnapshot } from "./quick-creative-engine";

export type CreativeStyle =
  | "premium_clean" | "bold_social" | "modern_sales" | "trust_authority"
  | "luxury_dark" | "family_warm" | "investor_focus" | "urgency_last_units";

export const CREATIVE_STYLES: { key: CreativeStyle; label: string; angle: string; visual: string }[] = [
  { key: "premium_clean", label: "Premium Clean", angle: "יוקרה שקטה, אמון, מרחב נושם", visual: "מינימליסטי, הרבה מרחב לבן, טיפוגרפיה נקייה, תמונת הנכס כגיבור" },
  { key: "bold_social", label: "Bold Social", angle: "עצירת גלילה, ניגודיות גבוהה, אנרגיה", visual: "בלוקי צבע נועזים, כותרת ענקית, קונטרסט חזק" },
  { key: "modern_sales", label: "Modern Sales", angle: "מודעת מכירה ממוקדת המרה", visual: "היררכיה ברורה, צ'יפים של מאפיינים, CTA בולט" },
  { key: "trust_authority", label: "Trust / Authority", angle: "מומחיות מקומית, ביטחון, תוצאות", visual: "לוגו+סוכן בולטים, פרטי קשר, טון רשמי" },
  { key: "luxury_dark", label: "Luxury Dark", angle: "פרימיום כהה, אקסקלוסיבי", visual: "רקע כהה, הדגשות זהב/אקסנט, ניגודיות עדינה" },
  { key: "family_warm", label: "Family Warm", angle: "חום, בית, סביבה משפחתית", visual: "טונים חמים, אווירה ביתית, תאורה רכה" },
  { key: "investor_focus", label: "Investor Focus", angle: "תשואה, נתונים, הזדמנות", visual: "דגש על מספרים/מ\"ר/מחיר, פריסה ענייני" },
  { key: "urgency_last_units", label: "Urgency / Last Units", angle: "דחיפות, מלאי אחרון", visual: "תג דחיפות, קונטרסט, CTA מיידי" },
];

/** 4 strategic variations for a property post (different message + style). */
export const VARIATION_STYLES: CreativeStyle[] = ["premium_clean", "bold_social", "trust_authority", "modern_sales"];

export interface MasterPromptInput {
  style: CreativeStyle;
  brand: BrandSnapshot;
  headline: string;
  subheadline?: string | null;
  bodyLines?: string[];
  cta?: string | null;
  format?: string; // feed_4_5 | story_9_16
  /** Human-readable facts the user actually provided (city, rooms, etc.). */
  facts: string[];
  hasPropertyImage: boolean;
  city?: string | null;
  neighborhood?: string | null;
}

export interface MasterPrompt {
  style: CreativeStyle;
  styleLabel: string;
  headline: string;
  subheadline: string;
  shortCopy: string;
  featureChips: string[];
  cta: string;
  visualDirection: string;
  layoutInstruction: string;
  brandInstruction: string;
  typographyInstruction: string;
  imageUsageInstruction: string;
  negativePrompt: string;
  /** The single combined Nano-Banana-ready master prompt. */
  nanoBananaPrompt: string;
  missingBrandAssets: string[];
}

const STYLE_BY_KEY = new Map(CREATIVE_STYLES.map((s) => [s.key, s]));

export function buildMasterCreativePrompt(i: MasterPromptInput): MasterPrompt {
  const s = STYLE_BY_KEY.get(i.style) ?? CREATIVE_STYLES[0];
  const ratio = i.format === "story_9_16" ? "1080x1920 (9:16 story)" : "1080x1350 (4:5 feed)";
  const colors = i.brand.colors.filter(Boolean);
  const where = [i.neighborhood, i.city].filter(Boolean).join(", ");

  const missingBrandAssets: string[] = [];
  if (!i.brand.agentPhoto) missingBrandAssets.push("תמונת סוכן");
  if (!i.brand.officeLogo) missingBrandAssets.push("לוגו משרד");
  if (!colors.length) missingBrandAssets.push("צבעי מותג");
  if (!i.hasPropertyImage) missingBrandAssets.push("תמונת נכס");

  const featureChips = i.facts.slice(0, 6);
  const shortCopy = [i.subheadline, ...(i.bodyLines ?? [])].filter(Boolean).join(" ").slice(0, 200);
  const cta = i.cta || "לפרטים נוספים — צרו קשר";

  const visualDirection = `סגנון ${s.label}: ${s.visual}. זווית מסר: ${s.angle}.`;
  const layoutInstruction = i.format === "story_9_16"
    ? "פריסת סטורי אנכית: תמונת הנכס מלאה למעלה (60%), בלוק טקסט תחתון עם כותרת, צ'יפים ו-CTA; לוגו פינה עליונה."
    : "פוסט מרובע 4:5: תמונת הנכס כגיבור עליון, שכבת טקסט תחתונה עם כותרת גדולה, שורת צ'יפים של מאפיינים, ו-CTA בולט; לוגו ופרטי סוכן בתחתית.";
  const brandInstruction = [
    colors.length ? `השתמש בפלטת המותג: ${colors.join(", ")} (פריימרי לרקע/הדגשה, משני לטקסט).` : "השתמש בפלטה נקייה ומקצועית (אין צבעי מותג מוגדרים).",
    i.brand.officeLogo ? "שלב את לוגו המשרד בפינה (קטן, לא דומיננטי)." : "אל תמציא לוגו — השאר מקום ללוגו.",
    i.brand.agentPhoto ? "שלב תמונת סוכן עגולה קטנה עם השם ופרטי קשר." : "אל תמציא תמונת סוכן.",
    i.brand.agentName ? `שם הסוכן: ${i.brand.agentName}${i.brand.agentWhatsapp ? ` · ${i.brand.agentWhatsapp}` : ""}.` : "",
  ].filter(Boolean).join(" ");
  const typographyInstruction = "טיפוגרפיה עברית RTL מודרנית וקריאה (כמו Heebo/Assistant), משקלים מנוגדים לכותרת מול גוף; ללא פונטים 'AI' מעוותים, ללא טקסט לטיני מומצא.";
  const imageUsageInstruction = i.hasPropertyImage
    ? "השתמש בתמונת הנכס שהועלתה כעוגן הוויזואלי המרכזי — אל תחליף אותה בתמונת סטוק."
    : "אין תמונת נכס — בנה רקע מותגי נקי; אל תמציא תמונת נכס/נוף/ים/פארק.";
  const negativePrompt = "להימנע: מראה של אפליקציה/דשבורד/כרטיס מערכת, כפתורי UI, פונטים מעוותים, טקסט לטיני ג'יבריש, חדרים/מחיר/מאפיינים שלא סופקו, נוף ים/פארק מומצא, סטוק גנרי, לוגואים מזויפים, אימוג'ים מוגזמים.";

  const nanoBananaPrompt = [
    `Premium real-estate social media advertisement, ${ratio}, Hebrew RTL.`,
    `STYLE: ${s.label} — ${s.angle}. ${s.visual}.`,
    `HEADLINE (Hebrew): "${i.headline}".`,
    i.subheadline ? `SUBHEADLINE: "${i.subheadline}".` : "",
    featureChips.length ? `FEATURE CHIPS (only these real facts, do not add any): ${featureChips.join(" | ")}.` : "",
    `CTA: "${cta}".`,
    `LOCATION: ${where || "—"}.`,
    `VISUAL: ${visualDirection}`,
    `LAYOUT: ${layoutInstruction}`,
    `BRAND: ${brandInstruction}`,
    `TYPOGRAPHY: ${typographyInstruction}`,
    `IMAGE: ${imageUsageInstruction}`,
    `NEGATIVE / AVOID: ${negativePrompt}`,
    `It must look like a real, finished advertising post — NOT an app screen or system card.`,
  ].filter(Boolean).join("\n");

  return {
    style: i.style, styleLabel: s.label,
    headline: i.headline, subheadline: i.subheadline ?? "", shortCopy, featureChips, cta,
    visualDirection, layoutInstruction, brandInstruction, typographyInstruction, imageUsageInstruction, negativePrompt,
    nanoBananaPrompt, missingBrandAssets,
  };
}
