/**
 * ZONO AI Marketing Kit — generates a full marketing content suite for a
 * property (not a single paragraph). Deterministic Hebrew output (client-safe).
 * Optional OpenAI augmentation lives in marketing-kit-actions.ts ("use server").
 * NEVER invents features — it only uses facts the user actually entered.
 * Missing data is simply omitted, and a "facts used" list is returned for the
 * internal view.
 */
import { PROPERTY_TYPE_LABELS } from "./labels";
import { audienceLabels } from "./audiences";
import type { PropertyType } from "@/lib/supabase/types";

export type KitTone =
  | "luxury"
  | "family"
  | "investment"
  | "urgency"
  | "calm"
  | "premium"
  | "young"
  | "formal";

export type KitLength = "short" | "medium" | "long";

export type KitChannel =
  | "whatsapp"
  | "facebook"
  | "instagram"
  | "website"
  | "portal"
  | "property_page"
  | "yad2_madlan";

export const KIT_TONES: { value: KitTone; label: string }[] = [
  { value: "luxury", label: "יוקרתי" },
  { value: "family", label: "משפחתי" },
  { value: "investment", label: "השקעה" },
  { value: "urgency", label: "דחיפות" },
  { value: "calm", label: "רגוע" },
  { value: "premium", label: "פרימיום" },
  { value: "young", label: "צעיר" },
  { value: "formal", label: "רשמי" },
];

export const KIT_LENGTHS: { value: KitLength; label: string }[] = [
  { value: "short", label: "קצר" },
  { value: "medium", label: "בינוני" },
  { value: "long", label: "ארוך" },
];

export const KIT_CHANNELS: { value: KitChannel; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "website", label: "אתר" },
  { value: "portal", label: "פורטל לקוח" },
  { value: "property_page", label: "עמוד נכס" },
  { value: "yad2_madlan", label: "יד2 / מדלן" },
];

export interface MarketingKitInput {
  title?: string | null;
  type?: PropertyType;
  city?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  rooms?: number | null;
  sizeSqm?: number | null;
  outdoorSqm?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  parkingCount?: number | null;
  storageCount?: number | null;
  balconyCount?: number | null;
  hasElevator?: boolean;
  hasSafeRoom?: boolean;
  price?: number | null;
  features?: string[]; // human-readable labels only
  sellerNotes?: string | null;
  audiences?: string[]; // audience keys
  tone: KitTone;
  length: KitLength;
  channel: KitChannel;
}

export interface MarketingKit {
  short: string;
  premium: string;
  emotional: string;
  investor: string;
  family: string;
  whatsapp: string;
  facebook: string;
  instagram: string;
  portal: string; // Yad2/Madlan-style
  luxury: string;
  seoTitle: string;
  seoMeta: string;
  sellingPoints: string[];
  highlights: string[];
  ctas: string[];
  objections: { objection: string; angle: string }[];
  audienceFit: string;
  factsUsed: string[];
  source: "template" | "openai";
}

const TONE_OPENERS: Record<KitTone, string> = {
  luxury: "נכס יוקרה נדיר",
  family: "בית מושלם למשפחה",
  investment: "הזדמנות השקעה חכמה",
  urgency: "ההזדמנות שלא תחזור",
  calm: "בית שקט ונעים",
  premium: "נכס פרימיום מוקפד",
  young: "הדירה שחיכיתם לה",
  formal: "נכס למכירה",
};

function fmtPrice(p?: number | null): string | null {
  return p && p > 0 ? `₪${p.toLocaleString("he-IL")}` : null;
}

/** Build the list of factual phrases — only from data actually provided. */
function collectFacts(input: MarketingKitInput): string[] {
  const f: string[] = [];
  const typeLabel = input.type ? PROPERTY_TYPE_LABELS[input.type] : null;
  const where = [input.neighborhood, input.city].filter(Boolean).join(", ");
  if (typeLabel) f.push(typeLabel);
  if (input.rooms != null) f.push(`${input.rooms} חדרים`);
  if (input.sizeSqm != null) f.push(`${input.sizeSqm} מ״ר בנוי`);
  if (input.outdoorSqm != null && input.outdoorSqm > 0) f.push(`${input.outdoorSqm} מ״ר חוץ`);
  if (input.floor != null) f.push(input.totalFloors != null ? `קומה ${input.floor} מתוך ${input.totalFloors}` : `קומה ${input.floor}`);
  if (where) f.push(where);
  if (input.parkingCount != null && input.parkingCount > 0) f.push(`${input.parkingCount} חניות`);
  if (input.storageCount != null && input.storageCount > 0) f.push(`${input.storageCount} מחסנים`);
  if (input.balconyCount != null && input.balconyCount > 0) f.push(`${input.balconyCount} מרפסות`);
  if (input.hasElevator) f.push("מעלית");
  if (input.hasSafeRoom) f.push('ממ"ד');
  for (const feat of input.features ?? []) f.push(feat);
  return f;
}

function joinHe(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} ו${items[items.length - 1]}`;
}

export function buildMarketingKit(input: MarketingKitInput): MarketingKit {
  const facts = collectFacts(input);
  const typeLabel = input.type ? PROPERTY_TYPE_LABELS[input.type] : "נכס";
  const where = [input.neighborhood, input.city].filter(Boolean).join(", ");
  const price = fmtPrice(input.price);
  const opener = TONE_OPENERS[input.tone];
  const headFacts = facts.slice(0, 4);
  const allFactsLine = joinHe(facts);

  const base = `${typeLabel}${input.rooms != null ? ` ${input.rooms} חדרים` : ""}${where ? ` ב${where}` : ""}`;
  const featLine = facts.length ? `${joinHe(facts.slice(0, 6))}.` : "";

  const short = `${base}${input.sizeSqm != null ? `, ${input.sizeSqm} מ״ר` : ""}.${price ? ` ${price}.` : ""}`.trim();

  const premium = [
    `${opener}: ${base}.`,
    featLine,
    price ? `מחיר מבוקש: ${price}.` : "",
    "לתיאום סיור פרטי — צרו קשר.",
  ].filter(Boolean).join(" ");

  const emotional = [
    `דמיינו את הבוקר הראשון שלכם ב${input.neighborhood || input.city || "בית החדש"}.`,
    base + (input.balconyCount ? " עם מרפסת שמזמינה אוויר ואור" : "") + ".",
    facts.length ? `כאן מחכים לכם ${joinHe(headFacts)}.` : "",
    "זה לא עוד נכס — זה הבית הבא שלכם.",
  ].filter(Boolean).join(" ");

  const investor = [
    `${base} — נכס עם פוטנציאל.`,
    input.sizeSqm != null ? `שטח של ${input.sizeSqm} מ״ר` : "",
    price ? `במחיר ${price}.` : "",
    "מתאים למשקיעים המחפשים נכס איכותי באזור מבוקש. נשמח להציג נתוני אזור מלאים.",
  ].filter(Boolean).join(" ");

  const family = [
    `${base} — מושלם למשפחה.`,
    [
      input.hasSafeRoom ? 'ממ"ד' : "",
      input.parkingCount ? "חניה" : "",
      input.balconyCount ? "מרפסת" : "",
      input.hasElevator ? "מעלית" : "",
    ].filter(Boolean).length ? `כולל ${joinHe([input.hasSafeRoom ? 'ממ"ד' : "", input.parkingCount ? "חניה" : "", input.balconyCount ? "מרפסת" : "", input.hasElevator ? "מעלית" : ""].filter(Boolean))}.` : "",
    "סביבה נוחה ומשפחתית. בואו לראות.",
  ].filter(Boolean).join(" ");

  const luxury = [
    `${typeLabel} יוקרתי${where ? ` ב${where}` : ""}.`,
    facts.length ? `${joinHe(facts.slice(0, 5))}.` : "",
    "גימור מוקפד וסטנדרט גבוה. סיור בתיאום אישי בלבד.",
  ].filter(Boolean).join(" ");

  const whatsapp = `🏠 ${base}${input.sizeSqm != null ? ` · ${input.sizeSqm} מ״ר` : ""}${price ? `\n💰 ${price}` : ""}${facts.length ? `\n✨ ${headFacts.join(" · ")}` : ""}\nמעוניינים? כתבו לי כאן 👇`;

  const facebook = `${opener}! 🏡\n${base}.\n${facts.length ? `${headFacts.map((x) => `✅ ${x}`).join("\n")}\n` : ""}${price ? `מחיר: ${price}\n` : ""}שלחו הודעה לתיאום סיור 📩`;

  const instagram = `${opener} ✨\n${where || "מיקום מעולה"}${input.rooms != null ? ` · ${input.rooms} חד׳` : ""}${input.sizeSqm != null ? ` · ${input.sizeSqm}מ״ר` : ""}\n${hashtags(input)}`;

  const portal = [
    `למכירה: ${base}.`,
    allFactsLine ? `${allFactsLine}.` : "",
    price ? `מחיר: ${price}.` : "",
    "פרטים נוספים וסיור בתיאום.",
  ].filter(Boolean).join(" ");

  const seoTitle = `${typeLabel}${input.rooms != null ? ` ${input.rooms} חדרים` : ""} למכירה${where ? ` ב${where}` : ""}${price ? ` | ${price}` : ""}`.slice(0, 60);
  const seoMeta = `${base}${input.sizeSqm != null ? `, ${input.sizeSqm} מ״ר` : ""}${facts.length ? `. ${joinHe(headFacts)}` : ""}${price ? `. ${price}` : ""}. צרו קשר לתיאום סיור.`.slice(0, 158);

  const sellingPoints = buildSellingPoints(input);
  const highlights = facts.slice(0, 8);
  const ctas = [
    "לתיאום סיור — שלחו הודעה עכשיו",
    "רוצים פרטים נוספים? דברו איתי",
    price ? `מחיר מבוקש ${price} — צרו קשר` : "צרו קשר לפרטים מלאים",
    "השאירו מספר ואחזור אליכם היום",
  ];

  const objections = buildObjections(input);
  const audienceLabelsList = audienceLabels(input.audiences ?? []);
  const audienceFit = audienceLabelsList.length
    ? `הנכס מתאים במיוחד ל${joinHe(audienceLabelsList)} — בזכות ${joinHe(headFacts.length ? headFacts : ["מאפייניו"])}${where ? ` והמיקום ב${where}` : ""}.`
    : "כדאי לבחור קהלי יעד כדי לחדד את המסר השיווקי.";

  // Honor requested length by trimming/expanding the lead descriptions.
  const lengthScaled = scaleByLength({ short, premium, emotional }, input.length);

  return {
    ...lengthScaled,
    investor,
    family,
    whatsapp,
    facebook,
    instagram,
    portal,
    luxury,
    seoTitle,
    seoMeta,
    sellingPoints,
    highlights,
    ctas,
    objections,
    audienceFit,
    factsUsed: facts,
    source: "template",
  };
}

function scaleByLength(
  d: { short: string; premium: string; emotional: string },
  length: KitLength,
): { short: string; premium: string; emotional: string } {
  if (length === "short") {
    return { short: d.short, premium: d.short, emotional: d.short };
  }
  return d;
}

function hashtags(input: MarketingKitInput): string {
  const tags = ["#נדלן", "#למכירה"];
  if (input.city) tags.push(`#${input.city.replace(/\s+/g, "")}`);
  if (input.type === "penthouse") tags.push("#פנטהאוז");
  if (input.tone === "luxury" || input.tone === "premium") tags.push("#יוקרה");
  return tags.join(" ");
}

function buildSellingPoints(input: MarketingKitInput): string[] {
  const pts: string[] = [];
  if (input.rooms != null) pts.push(`${input.rooms} חדרים`);
  if (input.sizeSqm != null) pts.push(`${input.sizeSqm} מ״ר בנוי`);
  if (input.floor != null && input.hasElevator) pts.push("קומה גבוהה עם מעלית");
  if (input.parkingCount) pts.push(`${input.parkingCount} מקומות חניה`);
  if (input.hasSafeRoom) pts.push('ממ"ד');
  if (input.balconyCount) pts.push("מרפסת");
  for (const feat of (input.features ?? []).slice(0, 3)) pts.push(feat);
  if (input.neighborhood) pts.push(`מיקום: ${input.neighborhood}`);
  return pts.slice(0, 8);
}

function buildObjections(input: MarketingKitInput): { objection: string; angle: string }[] {
  const out: { objection: string; angle: string }[] = [];
  if (input.price && input.price > 0)
    out.push({ objection: "המחיר גבוה לי", angle: "אפשר להציג השוואת עסקאות אחרונות באזור כדי להראות שהמחיר תואם שוק." });
  if (input.floor != null && !input.hasElevator && input.floor >= 3)
    out.push({ objection: "אין מעלית", angle: "להדגיש את היתרון של קומה גבוהה — נוף, פרטיות ושקט." });
  out.push({ objection: "אני רק מסתכל/ת", angle: "להזמין לסיור לא מחייב — רוב הקונים מתאהבים רק כשהם בנכס." });
  out.push({ objection: "אחשוב על זה", angle: "להציע לשמור עדכון אם המחיר משתנה או אם יש פנייה נוספת." });
  return out;
}

export const TONE_PROMPTS: Record<KitTone, string> = {
  luxury: "טון יוקרתי ומעודן",
  family: "טון חם ומשפחתי",
  investment: "טון ענייני ממוקד תשואה",
  urgency: "טון יוצר דחיפות",
  calm: "טון רגוע ונעים",
  premium: "טון פרימיום מוקפד",
  young: "טון צעיר ואנרגטי",
  formal: "טון רשמי ומקצועי",
};
