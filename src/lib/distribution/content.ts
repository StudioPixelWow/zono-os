/**
 * Assisted post-content engine — deterministic, client-safe, NO LLM. Builds
 * community-specific post variants for the agent to copy & publish manually.
 * Angles: family / investment / local / urgent / luxury / seller acquisition.
 */

export type PostAngle = "family" | "investment" | "local" | "urgent" | "luxury" | "seller";
export const ANGLE_LABEL: Record<PostAngle, string> = {
  family: "משפחתי", investment: "השקעה", local: "מקומי", urgent: "דחיפות", luxury: "יוקרה", seller: "גיוס מוכרים",
};

export interface PropertyForPost {
  title: string | null; type: string; city: string | null; neighborhood: string | null;
  price: number | null; rooms: number | null; sqm: number | null;
}
export interface CommunityForPost { name: string; audienceType: string; city: string | null; platform: string }

export interface PostContent { headline: string; postText: string; cta: string; hashtags: string[]; tone: string; angle: PostAngle }

/** Pick the best angle for a community audience + property. */
export function chooseAngle(p: PropertyForPost, audienceType: string): PostAngle {
  if (audienceType === "sellers") return "seller";
  if (audienceType === "luxury" || (p.price ?? 0) >= 4_000_000) return "luxury";
  if (audienceType === "investors") return "investment";
  if (audienceType === "families" || (p.rooms ?? 0) >= 4) return "family";
  if (audienceType === "young" || audienceType === "first_home") return "investment";
  return "local";
}

const fmt = (n: number | null) => (n != null ? n.toLocaleString("he-IL") : "");
const TYPE_LABEL: Record<string, string> = { apartment: "דירה", garden_apartment: "דירת גן", penthouse: "פנטהאוז", duplex: "דופלקס", private_house: "בית פרטי", cottage: "קוטג׳", studio: "סטודיו", commercial: "נכס מסחרי", office: "משרד", land: "מגרש", other: "נכס" };

export function buildPostContent(p: PropertyForPost, c: CommunityForPost, angle: PostAngle): PostContent {
  const typeLabel = TYPE_LABEL[p.type] ?? "נכס";
  const loc = [p.neighborhood, p.city].filter(Boolean).join(", ") || "מיקום מבוקש";
  const specs = [p.rooms != null ? `${p.rooms} חדרים` : null, p.sqm != null ? `${p.sqm} מ״ר` : null].filter(Boolean).join(" · ");
  const priceTxt = p.price ? `${fmt(p.price)} ₪` : "מחיר בפנייה";

  const base: Record<PostAngle, { headline: string; opener: string; cta: string }> = {
    family: { headline: `🏡 ${typeLabel} למשפחה ב${loc}`, opener: `הזדמנות מעולה למשפחה גדלה — ${typeLabel} ב${loc}, קרוב לחינוך ולקהילה.`, cta: "מוזמנים לפנות לתיאום ביקור 🙏" },
    investment: { headline: `📈 הזדמנות השקעה ב${loc}`, opener: `${typeLabel} בכניסה אטרקטיבית עם פוטנציאל השבחה — ${loc}.`, cta: "פנו אליי לפרטים ובדיקת תשואה" },
    local: { headline: `📍 ${typeLabel} חדש/ה ב${loc}`, opener: `נכס חדש לשוק ב${loc} — ${specs || typeLabel}.`, cta: "רוצים פרטים? שלחו לי הודעה" },
    urgent: { headline: `⏳ ביקוש גבוה — ${typeLabel} ב${loc}`, opener: `הביקוש באזור גבוה ונכסים נחטפים מהר. ${typeLabel} ב${loc}.`, cta: "כדאי להזדרז — פנו אליי עכשיו" },
    luxury: { headline: `✨ ${typeLabel} יוקרתי/ת ב${loc}`, opener: `סטנדרט מגורים גבוה במיקום מבוקש — ${typeLabel} ב${loc}.`, cta: "לפרטים דיסקרטיים פנו אליי" },
    seller: { headline: `🤝 מחפשים למכור ב${loc}?`, opener: `יש לי קונים פעילים שמחפשים ב${loc}. שוקלים למכור?`, cta: "דברו איתי להערכת שווי ללא התחייבות" },
  };
  const b = base[angle];
  const body = `${b.opener}\n${specs ? `${specs} · ` : ""}${priceTxt}\n\n${b.cta}`;
  const hashtags = [p.city ? `#${p.city.replace(/\s/g, "")}` : null, `#${typeLabel}`, "#נדלן", angle === "investment" ? "#השקעות_נדלן" : angle === "luxury" ? "#יוקרה" : "#למכירה"].filter(Boolean) as string[];

  return { headline: b.headline, postText: body, cta: b.cta, hashtags, tone: ANGLE_LABEL[angle], angle };
}
