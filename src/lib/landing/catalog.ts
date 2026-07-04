// ============================================================================
// 🎯 ZONO AI Landing Experience™ — landing type catalog (pure). 38.3.
// The 15 campaign landing types (Part 2). Each maps to an EXISTING data family
// (property/area/office) and defines the campaign framing: eyebrow, ordered CTA
// intents, section order, context-aware Ask questions, SEO suffix. Pure data.
// ============================================================================
import type { LandingConfig, LandingType } from "./types";

const SECTIONS_FULL: LandingConfig["sections"] = ["hero", "trust", "content", "showcase", "faq", "ask"];

export const LANDING_TYPES: Record<LandingType, LandingConfig> = {
  property: { key: "property", label: "נכס", family: "property", eyebrow: "נכס למכירה", ctaKinds: ["whatsapp", "visit", "phone"], sections: SECTIONS_FULL, ask: ["מה כולל המחיר?", "מתי אפשר לצפות?", "יש נכסים דומים?", "מה המצב באזור?"], seoSuffix: "למכירה" },
  project: { key: "project", label: "פרויקט", family: "office", eyebrow: "פרויקט חדש", ctaKinds: ["whatsapp", "meeting", "phone"], sections: SECTIONS_FULL, ask: ["מתי האכלוס?", "אילו טיפוסי דירות יש?", "מה מחירי הפתיחה?", "מה יש בסביבה?"], seoSuffix: "פרויקט" },
  neighborhood: { key: "neighborhood", label: "שכונה", family: "area", eyebrow: "מדריך שכונה", ctaKinds: ["whatsapp", "match", "phone"], sections: SECTIONS_FULL, ask: ["מה המחירים בשכונה?", "איך הביקוש?", "אילו נכסים יש?", "כדאי להשקיע כאן?"], seoSuffix: "מדריך שכונה" },
  area: { key: "area", label: "אזור", family: "area", eyebrow: "מדריך אזור", ctaKinds: ["whatsapp", "match", "phone"], sections: SECTIONS_FULL, ask: ["מה מאפיין את האזור?", "מה טווח המחירים?", "אילו נכסים זמינים?", "מה המגמה?"], seoSuffix: "מדריך אזור" },
  luxury: { key: "luxury", label: "יוקרה", family: "property", eyebrow: "נכס יוקרה", ctaKinds: ["whatsapp", "meeting", "phone"], sections: SECTIONS_FULL, ask: ["מה מייחד את הנכס?", "אפשר סיור פרטי?", "יש נכסי יוקרה נוספים?", "מה רמת הפרטיות?"], seoSuffix: "נכס יוקרה" },
  investment: { key: "investment", label: "השקעה", family: "property", eyebrow: "הזדמנות השקעה", ctaKinds: ["whatsapp", "valuation", "phone"], sections: SECTIONS_FULL, ask: ["מה התשואה הצפויה?", "מה פוטנציאל ההשבחה?", "יש הזדמנויות נוספות?", "מה הביקוש להשכרה?"], seoSuffix: "הזדמנות השקעה" },
  open_house: { key: "open_house", label: "בית פתוח", family: "property", eyebrow: "בית פתוח", ctaKinds: ["visit", "whatsapp", "phone"], sections: SECTIONS_FULL, ask: ["מתי הבית הפתוח?", "צריך להירשם מראש?", "מה כתובת הנכס?", "מה כדאי לבדוק?"], seoSuffix: "בית פתוח" },
  price_reduction: { key: "price_reduction", label: "הפחתת מחיר", family: "property", eyebrow: "מחיר עודכן", ctaKinds: ["whatsapp", "visit", "phone"], sections: SECTIONS_FULL, ask: ["מה המחיר החדש?", "למה המחיר ירד?", "אפשר לצפות היום?", "יש הזדמנויות דומות?"], seoSuffix: "מחיר מעודכן" },
  new_listing: { key: "new_listing", label: "חדש בשוק", family: "property", eyebrow: "חדש בשוק", ctaKinds: ["whatsapp", "visit", "match"], sections: SECTIONS_FULL, ask: ["מה חדש בנכס?", "מתי אפשר לצפות?", "יש נכסים חדשים נוספים?", "מה המצב באזור?"], seoSuffix: "חדש בשוק" },
  seller_recruitment: { key: "seller_recruitment", label: "גיוס מוכרים", family: "office", eyebrow: "חושבים למכור?", ctaKinds: ["valuation", "whatsapp", "meeting"], sections: ["hero", "trust", "content", "faq", "ask"], ask: ["כמה שווה הנכס שלי?", "כמה זמן לוקח למכור?", "מה תהליך המכירה?", "אילו נכסים מכרתם באזור?"], seoSuffix: "רוצים למכור" },
  buyer_recruitment: { key: "buyer_recruitment", label: "גיוס קונים", family: "office", eyebrow: "מחפשים לקנות?", ctaKinds: ["match", "whatsapp", "meeting"], sections: SECTIONS_FULL, ask: ["אילו נכסים מתאימים לי?", "מה התקציב הריאלי?", "איך מתחילים?", "מה כדאי לדעת?"], seoSuffix: "מחפשים לקנות" },
  valuation: { key: "valuation", label: "הערכת שווי", family: "office", eyebrow: "הערכת שווי חינם", ctaKinds: ["valuation", "whatsapp", "phone"], sections: ["hero", "trust", "content", "faq", "ask"], ask: ["כמה שווה הנכס שלי?", "מה משפיע על השווי?", "כמה זמן ההערכה?", "ההערכה מחייבת?"], seoSuffix: "הערכת שווי" },
  market_report: { key: "market_report", label: "דוח שוק", family: "area", eyebrow: "דוח שוק", ctaKinds: ["whatsapp", "match", "phone"], sections: ["hero", "trust", "content", "showcase", "ask"], ask: ["מה מגמת המחירים?", "איפה כדאי לקנות?", "מה הביקוש?", "מה צפוי בהמשך?"], seoSuffix: "דוח שוק" },
  broker_campaign: { key: "broker_campaign", label: "קמפיין סוכן", family: "office", eyebrow: "הסוכן שלכם", ctaKinds: ["whatsapp", "meeting", "phone"], sections: SECTIONS_FULL, ask: ["איך אתה יכול לעזור לי?", "אילו נכסים יש לך?", "מה הניסיון שלך?", "איך מתחילים?"], seoSuffix: "סוכן נדל\"ן" },
  office_campaign: { key: "office_campaign", label: "קמפיין משרד", family: "office", eyebrow: "המשרד שלכם", ctaKinds: ["whatsapp", "match", "meeting"], sections: SECTIONS_FULL, ask: ["אילו נכסים יש לכם?", "באילו אזורים אתם פועלים?", "איך אתם עוזרים לקונים?", "איך למוכרים?"], seoSuffix: "משרד תיווך" },
};

export const getLandingConfig = (t: LandingType): LandingConfig | null => LANDING_TYPES[t] ?? null;
export const isLandingType = (s: string): s is LandingType => s in LANDING_TYPES;
export const ALL_LANDING_TYPES = Object.keys(LANDING_TYPES) as LandingType[];
